(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaCloudController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function create(options) {
    options = options || {};
    var config = options.config || {};
    var auth = options.auth || OporaSupabaseAuth.create({
      url: config.url, anonKey: config.anonKey, redirectTo: config.redirectTo,
      storage: options.sessionStorage, fetch: options.fetch
    });
    var transport = options.transport || OporaSupabaseTransport.create({
      url: config.url, anonKey: config.anonKey,
      accessToken: function () { return auth.getAccessToken(); },
      fetch: options.fetch
    });
    var sync = options.sync || OporaCloudSync.create({ transport: transport, revision: options.revision });
    var pending = null;

    function status() {
      var session = auth.getSession();
      return {
        configured: (typeof auth.configured !== "function" || auth.configured()) &&
          !!(transport.configured && transport.configured()),
        enabled: sync.status().enabled,
        signedIn: !!session,
        email: session && session.user ? session.user.email : null,
        revision: sync.status().lastRevision,
        pendingRemote: !!pending
      };
    }

    function enable(consent) {
      if (!auth.getSession()) return { ok: false, error: "auth-required" };
      return sync.enable(consent);
    }

    async function syncNow(snapshot, revision) {
      if (!auth.getSession()) return { ok: false, error: "auth-required" };
      var result = await sync.sync(snapshot, revision);
      if (result.remoteSnapshot && result.remoteRevision !== undefined) {
        pending = { snapshot: result.remoteSnapshot, revision: result.remoteRevision };
      } else if (result.error === "remote-available" && result.remoteSnapshot) {
        pending = { snapshot: result.remoteSnapshot, revision: result.remoteRevision };
      }
      if (result.ok) pending = null;
      return result;
    }

    function pendingRemote() {
      return pending ? { snapshot: pending.snapshot, revision: pending.revision } : null;
    }

    async function deleteRemote() {
      if (!auth.getSession()) return { ok: false, error: "auth-required" };
      var result = await sync.deleteRemote();
      if (result.ok) pending = null;
      return result;
    }

    async function logout() {
      sync.disable();
      pending = null;
      return auth.signOut();
    }

    function render() {
      var state = status();
      var html = '<section class="card" aria-labelledby="opora-cloud-title"><h2 id="opora-cloud-title">Облачная синхронизация (необязательно)</h2>';
      if (!state.configured) {
        html += '<p>Backend не настроен. Приложение продолжает работать локально; никаких данных не отправляется.</p>' +
          '<p class="mut">Для подключения владелец проекта должен создать Supabase, применить SQL-миграцию и заполнить публичные параметры в <code>src/storage/supabase-config.js</code>. Секретный service-role key сюда не добавляется.</p>';
      } else if (!state.signedIn) {
        html += '<p>Вход по одноразовой ссылке на почту. Сессия хранится только в sessionStorage этого браузера.</p>' +
          '<label for="cloud-email">Электронная почта</label><input id="cloud-email" type="email" autocomplete="email" placeholder="name@example.com">' +
          '<button type="button" data-a="cloudlogin">Отправить ссылку для входа</button>';
      } else {
        html += '<p>Вход выполнен: <b>' + esc(state.email || "аккаунт") + '</b></p>';
        if (!state.enabled) {
          html += '<label><input id="cloud-consent" type="checkbox"> Я отдельно разрешаю отправлять выбранные ниже данные в настроенный Supabase backend.</label>' +
            '<p class="mut">Будут отправлены: дневник и чек-ины, профиль и настройки, планы, рутины, локальные заметки и архивные записи приложения. Снимок хранится в базе провайдера. Приложение не шифрует его сквозным шифрованием.</p>' +
            '<button type="button" data-a="cloudenable">Разрешить синхронизацию</button>';
        } else {
          html += '<p>Синхронизация разрешена, но выполняется только по нажатию кнопки.</p>' +
            '<div class="row"><button type="button" data-a="cloudsync">Синхронизировать сейчас</button><button type="button" data-a="clouddisable">Отключить</button></div>' +
            '<button type="button" data-a="clouddelete">Удалить облачную копию</button>';
        }
        if (state.pendingRemote) html += '<p class="z zy">Обнаружена удалённая копия или конфликт. Локальные данные не заменены.</p><button type="button" data-a="cloudrestore">Восстановить удалённую копию поверх локальной (с backup)</button>';
        html += '<p><button type="button" data-a="cloudlogout">Выйти из облачного аккаунта</button></p>';
      }
      html += '<p class="mut">Отключение синхронизации не удаляет локальные данные. Удаление облачной копии — отдельное действие. JSON и снимок облака не являются end-to-end encrypted.</p></section>';
      return html;
    }

    return {
      status: status,
      render: render,
      sendMagicLink: auth.sendMagicLink,
      handleCallback: function () { return auth.handleCallback(root.location, root.history); },
      enable: enable,
      disable: function () { return sync.disable(); },
      sync: syncNow,
      pendingRemote: pendingRemote,
      deleteRemote: deleteRemote,
      logout: logout
    };
  }

  return { create: create };
});
