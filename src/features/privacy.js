(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaPrivacy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function render(options) {
    options = options || {};
    var cloud = options.cloud || { enabled: false, configured: false, mode: "local-only" };
    var data = options.data || {};
    var collections = ["ci", "ep", "ev", "chat", "notes", "cc", "cp"];
    var counts = collections.map(function (key) {
      return '<li>' + escapeHtml(key) + ': ' + (Array.isArray(data[key]) ? data[key].length : 0) + '</li>';
    }).join("");

    return '<section class="card" aria-labelledby="opora-privacy-title">' +
      '<h2 id="opora-privacy-title">Центр приватности</h2>' +
      '<p><b>Локальное хранение включено.</b> Основные записи остаются в хранилище этого браузера.</p>' +
      '<ul><li>Генеративный ИИ и передача записей ИИ-сервисам: отключены.</li>' +
      '<li>Облачная синхронизация: ' + (cloud.enabled ? "включена" : "выключена") + '.</li>' +
      '<li>Подключённый облачный backend: ' + (cloud.configured ? "настроен" : "не настроен") + '.</li></ul>' +
      '<p>Сейчас приложение не отправляет дневник, профиль или историю записей на облачный сервер. Внешние шрифты и сторонние сетевые зависимости не используются.</p>' +
      '<details><summary>Какие данные находятся в локальном профиле</summary>' +
      '<p>Счётчики записей по разделам (содержимое не выводится):</p><ul>' + counts + '</ul>' +
      '<p>Включая профиль и настройки приложения. Архив прежних диалогов, если он есть, остаётся локальным.</p></details>' +
      '<p class="mut">Облачный режим не активируется автоматически. Для его будущего включения потребуются отдельное согласие, настроенный backend и понятные правила хранения и удаления данных. Отключение синхронизации не удаляет локальную копию.</p>' +
      '<p class="mut">Экспорт создаёт обычный JSON-файл без отдельного шифрования. Не передавайте его посторонним и храните в безопасном месте.</p>' +
      '</section>';
  }

  return { render: render };
});
