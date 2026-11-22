# Зачёт

## Рисунки к вопросам

Поддерживаются PNG, JPG, WebP и SVG. Поместите рисунок в папку `images` и укажите его в поле `imagePath` вопроса:

```json
"imagePath": "images/von-neumann.png"
```

Путь задаётся относительно `index.html`, а не относительно JSON-файла в папке `data`. Рисунки отображаются в вопросах, увеличиваются при нажатии и сохраняются в разборе ответов. Пример PNG включён в папку `images`.
## Контрольный экзамен и Google Таблица

1. Создайте Google Таблицу → «Расширения» → «Apps Script» и вставьте код ниже.
2. «Начать развертывание» → «Веб-приложение», доступ: «Все». Скопируйте ссылку в `GOOGLE_SCRIPT_URL` в начале `app.js`.

Время записывается по часам серверов Google в часовом поясе Минска в момент получения ответа (браузер не может узнать время Google сам, поэтому его ставит скрипт). Время студента сохраняется отдельным столбцом для сверки.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) sheet.appendRow(["Время (Google, Минск)", "ФИО", "Группа", "Дисциплина", "Оценка", "Результат", "Затрачено", "Время на устройстве студента"]);
  const serverTime = Utilities.formatDate(new Date(), "Europe/Minsk", "dd.MM.yyyy, HH:mm:ss");
  sheet.appendRow([serverTime, d.studentName, d.group, d.subject, d.grade, d.scoreText, d.timeSpent, d.timestamp]);
  return ContentService.createTextOutput("ok");
}
```
