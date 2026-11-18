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
    var local = options.local || { available: true, blocked: false };
    var backups = Array.isArray(options.backups) ? options.backups : [];
    var collections = ["ci", "ep", "ev", "chat", "notes", "cc", "cp"];
    var counts = collections.map(function (key) {
      return '<li>' + escapeHtml(key) + ': ' + (Array.isArray(data[key]) ? data[key].length : 0) + '</li>';
    }).join("");

    return '<section class="card" aria-labelledby="opora-privacy-title">' +
      '<h2 id="opora-privacy-title">Центр приватности</h2>' +
      '<p><b>Локальное хранилище: ' + (local.blocked ? "защищённый режим — запись заблокирована" : local.available ? "доступно" : "не подтверждено") + '.</b> Записи остаются в этом браузере.</p>' +
      '<ul><li>Генеративный ИИ и передача записей ИИ-сервисам: отключены.</li>' +
      '<li>Облачная синхронизация: ' + (cloud.enabled ? "включена" : "выключена") + '.</li>' +
      '<li>Подключённый облачный backend: ' + (cloud.configured ? "настроен" : "не настроен") + '.</li></ul>' +
      '<p>' + (cloud.enabled ? "Облачная синхронизация разрешена; проверьте результат последней операции перед закрытием приложения." : "Облачная синхронизация выключена: приложение не отправляет дневник, профиль или историю записей на сервер.") + ' Внешние шрифты не загружаются. ' + (cloud.configured ? "Backend настроен." : "Backend не настроен.") + '</p>' +
      '<p>Локальные резервные копии в этом браузере: ' + backups.length + '. Они не защищают от очистки данных браузера или потери устройства. Автоматически хранятся последние 10 обычных точек восстановления; копии, созданные перед переносом данных из прежней версии, не удаляются.</p>' +
      '<details><summary>Какие данные находятся в локальном профиле</summary>' +
      '<p>Счётчики записей по разделам (содержимое не выводится):</p><ul>' + counts + '</ul>' +
      '<p>Включая профиль и настройки приложения. Архив прежних диалогов, если он есть, остаётся локальным.</p></details>' +
      '<p class="mut">Облачный режим не активируется автоматически. Для включения требуются отдельное согласие и настроенный backend. Отключение синхронизации не удаляет локальную копию. Резервные копии в localStorage могут исчезнуть при очистке данных браузера.</p>' +
      '<p class="mut">Экспорт создаёт обычный JSON-файл без отдельного шифрования. Не передавайте его посторонним и храните в безопасном месте.</p>' +
      '</section>';
  }

  return { render: render };
});
