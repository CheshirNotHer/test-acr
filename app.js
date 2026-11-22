"use strict";
/* ===== Конфигурация банков тестов: добавляйте новые файлы сюда ===== */
const BANKS = [
  { file: "data/questions.json", title: "АЛоВТ" },
  { file: "data/questions_pssip.json", title: "ПССИП" },
];

const $ = (id) => document.getElementById(id);
const state = {
  questions: [], bankIndex: 0, settings: null,
  queue: [], answers: [], currentMode: null, currentTopic: null,
  selected: null, checked: false, startTime: 0, timerId: null, deadline: 0, finishReason: "",
};

/* ===== Утилиты ===== */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatTime(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
function topicsOf(qs) { return [...new Set(qs.map((q) => q.topic || "Без темы"))]; }

/* Оценка по 10-балльной шкале по проценту правильных ответов */
function calcGrade(correct, total) {
  if (total <= 0) return 2;
  const p = (correct / total) * 100;
  if (correct === total) return 10;
  if (p < 65) return 2;
  return Math.min(9, 3 + Math.floor((p - 65) / 5));
}

/* Сбалансированная выборка по темам без повторений */
function balancedPick(qs, n) {
  if (qs.length <= n) return shuffle(qs);
  const groups = topicsOf(qs).map((t) => shuffle(qs.filter((q) => (q.topic || "Без темы") === t)));
  const picked = [];
  let gi = 0;
  // Карусель по темам: по одному вопросу из каждой темы, пустые темы пропускаются — недостаток добирается из других
  while (picked.length < n) {
    const g = groups[gi % groups.length];
    if (g.length) picked.push(g.pop());
    gi++;
  }
  return shuffle(picked);
}

/* ===== Параметры ===== */
function readSettings() {
  const max = state.questions.length || 5;
  let count = parseInt($("countInput").value, 10);
  if (isNaN(count)) count = 20;
  count = Math.max(Math.min(5, max), Math.min(count, max));
  $("countInput").value = count;
  let minutes = parseInt($("timeInput").value, 10);
  if (isNaN(minutes) || minutes < 1) minutes = 30;
  $("timeInput").value = minutes;
  const s = { count, minutes, shuffle: $("shuffleToggle").checked, instant: $("instantToggle").checked, bankIndex: state.bankIndex };
  localStorage.setItem("quiz-settings", JSON.stringify(s));
  return s;
}
function loadSavedSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("quiz-settings") || "{}");
    if (s.count) $("countInput").value = s.count;
    if (s.minutes) $("timeInput").value = s.minutes;
    $("shuffleToggle").checked = !!s.shuffle;
    $("instantToggle").checked = !!s.instant;
    if (Number.isInteger(s.bankIndex) && BANKS[s.bankIndex]) state.bankIndex = s.bankIndex;
  } catch (e) { /* игнорируем повреждённые данные */ }
}

/* ===== Тема оформления ===== */
function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("darkToggle").checked = dark;
  localStorage.setItem("quiz-theme", dark ? "dark" : "light");
}

/* ===== Загрузка данных ===== */
function validateQuestions(data) {
  if (data && !Array.isArray(data) && Array.isArray(data.questions)) data = data.questions;
  if (!Array.isArray(data)) throw new Error("JSON должен содержать массив вопросов");
  return data
    .filter((q) => q && q.question && Array.isArray(q.options))
    .map((q, i) => {
      const options = q.options.filter((o) => o !== null && o !== undefined && String(o).trim() !== "");
      return { ...q, image: q.imagePath || q.image || "", id: q.id ?? i + 1, topic: q.topic || "Без темы", options, correctIndex: Number(q.correctIndex) || 0 };
    })
    .filter((q) => q.options.length > 0 && q.correctIndex < q.options.length);
}
function setQuestions(qs, label) {
  state.questions = qs;
  $("loadError").classList.add("hidden");
  const topics = topicsOf(qs);
  $("topicSelect").innerHTML = topics.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${qs.filter((q) => q.topic === t).length})</option>`).join("");
  $("countInput").max = qs.length;
  $("bankInfo").textContent = `${label}: ${qs.length} вопросов, ${topics.length} тем.`;
  document.querySelectorAll(".mode-card button, button.mode-card").forEach((b) => (b.disabled = qs.length === 0));
}
async function loadBank(index) {
  state.bankIndex = index;
  const bank = BANKS[index];
  $("bankInfo").textContent = "Загрузка…";
  try {
    const res = await fetch(bank.file, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setQuestions(validateQuestions(await res.json()), bank.title);
  } catch (err) {
    console.error(err);
    state.questions = [];
    $("bankInfo").textContent = "";
    $("loadError").classList.remove("hidden");
  }
}

/* ===== Запуск теста ===== */
function prepareQuestion(q) {
  let order = q.options.map((_, i) => i);
  if (state.settings.shuffle) order = shuffle(order);
  return { q, order, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correctIndex) };
}
function startQuiz(mode, topic) {
  if (!state.questions.length) return;
  state.settings = readSettings();
  state.currentMode = mode; state.currentTopic = topic || null;
  const n = state.settings.count, all = state.questions;
  let list;
  if (mode === "full") list = shuffle(all);
  else if (mode === "balanced" || mode === "exam") list = balancedPick(all, n);
  else if (mode === "random") list = shuffle(all).slice(0, n);
  else if (mode === "topic") list = shuffle(all.filter((q) => q.topic === topic));
  if (!list || !list.length) return;

  state.queue = list.map(prepareQuestion);
  state.answers = [];
  state.total = state.queue.length;
  state.startTime = Date.now();
  state.finishReason = "";
  clearInterval(state.timerId);
  $("timer").classList.add("hidden");
  if (mode === "exam") {
    state.deadline = state.startTime + state.settings.minutes * 60000;
    $("timer").classList.remove("hidden");
    tick();
    state.timerId = setInterval(tick, 500);
  }
  show("quizScreen");
  renderQuestion();
}
function tick() {
  const left = state.deadline - Date.now();
  $("timer").textContent = "⏱ " + formatTime(left);
  $("timer").classList.toggle("low", left < 60000);
  if (left <= 0) { state.finishReason = "Время вышло — засчитаны только данные ответы."; finishQuiz(); }
}

/* ===== Экран вопроса ===== */
function renderQuestion() {
  const item = state.queue[0];
  if (!item) return finishQuiz();
  state.selected = null; state.checked = false;
  const num = state.answers.length + 1;
  $("counter").textContent = `Вопрос ${num} из ${state.total}`;
  $("topicLabel").textContent = item.q.topic;
  $("progressBar").style.width = (state.answers.length / state.total) * 100 + "%";
  $("questionText").textContent = item.q.question;
  const img = $("questionImage");
  if (item.q.image) { img.src = item.q.image; img.classList.remove("hidden"); } else { img.removeAttribute("src"); img.classList.add("hidden"); }
  $("options").innerHTML = item.options.map((o, i) =>
    `<button type="button" class="option" role="radio" aria-checked="false" data-i="${i}"><span class="dot"></span><span>${escapeHtml(o)}</span></button>`).join("");
  $("explanation").classList.add("hidden");
  $("nextBtn").disabled = true;
  $("nextBtn").textContent = state.settings.instant ? "Проверить" : "Ответить";
  $("skipBtn").disabled = state.queue.length <= 1;
  $("skipBtn").classList.toggle("hidden", state.queue.length <= 1);
}
function selectOption(i) {
  if (state.checked) return;
  state.selected = i;
  document.querySelectorAll(".option").forEach((el) => {
    const on = Number(el.dataset.i) === i;
    el.classList.toggle("selected", on); el.setAttribute("aria-checked", on);
  });
  $("nextBtn").disabled = false;
  if (state.settings.instant) checkAnswer();
}
function checkAnswer() {
  const item = state.queue[0];
  state.checked = true;
  document.querySelectorAll(".option").forEach((el) => {
    const i = Number(el.dataset.i);
    el.disabled = true;
    if (i === item.correct) el.classList.add("correct");
    else if (i === state.selected) el.classList.add("wrong");
  });
  const ok = state.selected === item.correct;
  const ex = $("explanation");
  ex.innerHTML = `<strong>${ok ? "✓ Верно" : "✗ Неверно"}.</strong> ${escapeHtml(item.q.explanation || "Пояснение отсутствует.")}`;
  ex.classList.remove("hidden");
  $("skipBtn").disabled = true;
  $("nextBtn").textContent = state.queue.length > 1 ? "Далее" : "Завершить";
}
function commitAnswer() {
  const item = state.queue.shift();
  state.answers.push({ item, selected: state.selected, correct: state.selected === item.correct });
  if (state.queue.length) renderQuestion(); else finishQuiz();
}
function onNext() {
  if (state.selected === null) return;
  if (state.settings.instant && !state.checked) return checkAnswer();
  commitAnswer();
}
function skipQuestion() {
  if (state.queue.length <= 1 || state.checked) return;
  state.queue.push(state.queue.shift());
  renderQuestion();
}

/* ===== Результаты ===== */
function finishQuiz() {
  clearInterval(state.timerId);
  $("timer").classList.add("hidden");
  // Неотвеченные вопросы считаются неверными
  state.queue.forEach((item) => state.answers.push({ item, selected: null, correct: false }));
  state.queue = [];
  const total = state.total, correct = state.answers.filter((a) => a.correct).length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const grade = calcGrade(correct, total);
  $("gradeValue").textContent = grade;
  document.querySelector(".grade-circle").classList.toggle("fail", grade <= 2);
  $("resultTitle").textContent = grade >= 9 ? "Отлично!" : grade >= 6 ? "Хороший результат" : grade >= 3 ? "Зачёт, но есть над чем работать" : "Нужно повторить материал";
  $("resultReason").textContent = state.finishReason;
  $("statCorrect").textContent = `${correct} / ${total}`;
  $("statPercent").textContent = percent + "%";
  $("statTime").textContent = formatTime(Date.now() - state.startTime);
  $("errorsOnly").checked = false;
  renderReview();
  show("resultScreen");
}
function renderReview() {
  const onlyErr = $("errorsOnly").checked;
  const list = state.answers.filter((a) => !onlyErr || !a.correct);
  $("reviewList").innerHTML = list.length ? list.map((a, idx) => {
    const { q, options, correct } = a.item;
    const user = a.selected === null ? "<em>нет ответа</em>" : escapeHtml(options[a.selected]);
    return `<div class="review-item ${a.correct ? "" : "bad"}">
      <h3>${idx + 1}. ${escapeHtml(q.question)}</h3>
      ${q.image ? `<img src="${escapeHtml(q.image)}" alt="Иллюстрация">` : ""}
      <p>Ваш ответ: <span class="${a.correct ? "ans-ok" : "ans-bad"}">${user}</span></p>
      ${a.correct ? "" : `<p>Правильный ответ: <span class="ans-ok">${escapeHtml(options[correct])}</span></p>`}
      ${q.explanation ? `<p class="muted">${escapeHtml(q.explanation)}</p>` : ""}
    </div>`;
  }).join("") : `<p class="muted">Ошибок нет — так держать!</p>`;
}

function show(id) {
  ["homeScreen", "quizScreen", "resultScreen"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===== Инициализация ===== */
function init() {
  applyTheme(localStorage.getItem("quiz-theme") === "dark");
  loadSavedSettings();
  $("bankSelect").innerHTML = BANKS.map((b, i) => `<option value="${i}">${escapeHtml(b.title)}</option>`).join("");
  $("bankSelect").value = state.bankIndex;
  $("bankSelect").addEventListener("change", (e) => { loadBank(Number(e.target.value)); readSettings(); });
  ["countInput", "timeInput", "shuffleToggle", "instantToggle"].forEach((id) => $(id).addEventListener("change", readSettings));
  $("darkToggle").addEventListener("change", (e) => applyTheme(e.target.checked));
  $("themeBtn").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme !== "dark"));

  document.querySelectorAll("button.mode-card").forEach((b) => b.addEventListener("click", () => startQuiz(b.dataset.mode)));
  $("topicStart").addEventListener("click", () => startQuiz("topic", $("topicSelect").value));

  $("options").addEventListener("click", (e) => { const el = e.target.closest(".option"); if (el) selectOption(Number(el.dataset.i)); });
  $("nextBtn").addEventListener("click", onNext);
  $("skipBtn").addEventListener("click", skipQuestion);
  $("quitBtn").addEventListener("click", () => { if (confirm("Завершить тест? Неотвеченные вопросы будут засчитаны как неверные.")) { state.finishReason = "Тест завершён досрочно."; finishQuiz(); } });
  $("retryBtn").addEventListener("click", () => startQuiz(state.currentMode, state.currentTopic));
  $("homeBtn").addEventListener("click", () => show("homeScreen"));
  $("errorsOnly").addEventListener("change", renderReview);

  $("questionImage").addEventListener("click", () => { $("lightboxImg").src = $("questionImage").src; $("lightbox").classList.remove("hidden"); });
  $("lightbox").addEventListener("click", () => $("lightbox").classList.add("hidden"));

  $("fileInput").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { setQuestions(validateQuestions(JSON.parse(await f.text())), f.name); }
    catch (err) { alert("Ошибка чтения файла: " + err.message); }
  });

  loadBank(state.bankIndex);
}
document.addEventListener("DOMContentLoaded", init);
