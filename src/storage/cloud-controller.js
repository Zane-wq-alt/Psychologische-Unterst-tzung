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
    // Свой транспорт (тесты, другой backend) используется как есть. Транспорт по умолчанию
    // всегда оборачивается сквозным шифрованием: открытые снимки в облако не уходят.
    var transport = options.transport || OporaE2ETransport.create({
      transport: OporaSupabaseTransport.create({
        url: config.url, anonKey: config.anonKey,
        accessToken: function () { return auth.getAccessToken(); },
        fetch: options.fetch
      })
    });
    var e2e = transport.e2e || null;
    var freshRecoveryKey = null;
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
        e2e: e2e ? e2e.state() : "off",
        recoveryKeyPending: !!freshRecoveryKey,
        pendingRemote: !!pending
      };
    }

    function enable(consent) {
      if (!auth.getSession()) return { ok: false, error: "auth-required" };
      if (e2e && e2e.state() !== "unlocked") return { ok: false, error: "e2e-locked" };
      if (freshRecoveryKey) return { ok: false, error: "e2e-recovery-key-not-confirmed" };
      return sync.enable(consent);
    }

    async function guarded(action) {
      if (!auth.getSession()) return { ok: false, error: "auth-required" };
      if (!e2e) return { ok: false, error: "e2e-not-available" };
      try { return await action(); }
      catch (error) { return { ok: false, error: (error && error.code) || "e2e-failed" }; }
    }

    // Новая фраза, если в облаке ещё ничего нет; иначе фраза проверяется на существующих данных.
    function e2eStart(passphrase, confirmation) {
      return guarded(async function () {
        var found = await e2e.probe();
        if (found.exists) { await e2e.unlock(passphrase); return { ok: true, created: false }; }
        if (passphrase !== confirmation) return { ok: false, error: "e2e-passphrase-mismatch" };
        var made = await e2e.setup(passphrase);
        freshRecoveryKey = made.recoveryKey;
        return { ok: true, created: true };
      });
    }

    function e2eRecover(recoveryKey) {
      return guarded(async function () { await e2e.unlockWithRecovery(recoveryKey); return { ok: true }; });
    }

    function e2eChangePassphrase(next, confirmation) {
      return guarded(async function () {
        if (next !== confirmation) return { ok: false, error: "e2e-passphrase-mismatch" };
        return e2e.changePassphrase(next);
      });
    }

    function recoveryKeyOnce() { return freshRecoveryKey; }
    function confirmRecoveryKey() { freshRecoveryKey = null; return { ok: true }; }
    function lockE2E() { sync.disable(); if (e2e) e2e.lock(); freshRecoveryKey = null; return { ok: true }; }

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
      if (e2e) e2e.lock();
      freshRecoveryKey = null;
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
        if (state.e2e === "locked") {
          html += '<p>Данные шифруются на этом устройстве до отправки. Введите парольную фразу: если в облаке уже есть копия, она проверится на ней, иначе будет создана новая (повторите её во втором поле).</p>' +
            '<label for="cloud-pass">Парольная фраза (не короче 10 символов)</label><input id="cloud-pass" type="password" autocomplete="new-password">' +
            '<label for="cloud-pass2">Повторите фразу (только при первом создании)</label><input id="cloud-pass2" type="password" autocomplete="new-password">' +
            '<button type="button" data-a="cloudkey">Продолжить</button>' +
            '<details><summary>Забыли фразу? Использовать ключ восстановления</summary>' +
            '<label for="cloud-recovery">Ключ восстановления</label><input id="cloud-recovery" type="text" autocomplete="off" placeholder="XXXX-XXXX-…">' +
            '<button type="button" data-a="cloudrecover">Разблокировать ключом</button></details>';
        } else if (state.recoveryKeyPending) {
          html += '<div class="card z zy"><b>Ключ восстановления</b><p>Запишите его и храните отдельно от устройства. Он показывается один раз. Без фразы и без этого ключа облачные данные восстановить невозможно: ни приложение, ни провайдер этого сделать не смогут.</p>' +
            '<p><code id="cloud-recovery-key">' + esc(recoveryKeyOnce()) + '</code></p>' +
            '<div class="row"><button type="button" data-a="cloudcopykey">Копировать</button><button type="button" data-a="cloudackkey">Я сохранил(а) ключ</button></div></div>';
        } else if (!state.enabled) {
          html += '<label><input id="cloud-consent" type="checkbox"> Я отдельно разрешаю отправлять зашифрованную копию данных в настроенный Supabase backend.</label>' +
            '<p class="mut">Весь снимок (дневник и чек-ины, эпизоды, события и планы, рутины, профиль, настройки, заметки и архив) шифруется на этом устройстве. Провайдер хранит непрозрачный блок и видит только его размер и время изменения.</p>' +
            '<button type="button" data-a="cloudenable">Разрешить синхронизацию</button>';
        } else {
          html += '<p>Синхронизация разрешена, но выполняется только по нажатию кнопки.</p>' +
            '<div class="row"><button type="button" data-a="cloudsync">Синхронизировать сейчас</button><button type="button" data-a="clouddisable">Отключить</button></div>' +
            '<button type="button" data-a="clouddelete">Удалить облачную копию</button>';
        }
        if (state.e2e === "unlocked" && !state.recoveryKeyPending) {
          html += '<details><summary>Сменить парольную фразу</summary>' +
            '<label for="cloud-newpass">Новая фраза</label><input id="cloud-newpass" type="password" autocomplete="new-password">' +
            '<label for="cloud-newpass2">Повторите новую фразу</label><input id="cloud-newpass2" type="password" autocomplete="new-password">' +
            '<button type="button" data-a="cloudchangepass">Сменить</button>' +
            '<p class="mut">Новая фраза попадёт в облако при следующей синхронизации. Ключ восстановления остаётся прежним.</p></details>' +
            '<button type="button" data-a="cloudlock">Заблокировать облако на этом устройстве</button>';
        }
        if (state.e2e === "off") {
          html += '<p class="mut">Этот транспорт не шифрует данные сквозным шифрованием (end-to-end encrypted — нет).</p>';
        }
        if (state.pendingRemote) html += '<p class="z zy">Обнаружена удалённая копия или конфликт. Локальные данные не заменены.</p><button type="button" data-a="cloudrestore">Восстановить удалённую копию поверх локальной (с backup)</button>';
        html += '<p><button type="button" data-a="cloudlogout">Выйти из облачного аккаунта</button></p>';
      }
      html += '<p class="mut">Отключение синхронизации не удаляет локальные данные. Удаление облачной копии — отдельное действие. Экспорт JSON и локальные точки восстановления не зашифрованы.</p></section>';
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
      e2eStart: e2eStart,
      e2eRecover: e2eRecover,
      e2eChangePassphrase: e2eChangePassphrase,
      recoveryKeyOnce: recoveryKeyOnce,
      confirmRecoveryKey: confirmRecoveryKey,
      lockE2E: lockE2E,
      logout: logout
    };
  }

  return { create: create };
});
