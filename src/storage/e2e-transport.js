/* Обёртка над транспортом: снимок шифруется на устройстве перед отправкой
   и расшифровывается после получения. Остальной код синхронизации (cloud-sync.js)
   видит обычные снимки и не меняется. Ключ живёт только в памяти страницы:
   после перезагрузки облако нужно разблокировать фразой или ключом восстановления. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaE2ETransport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function create(options) {
    options = options || {};
    var inner = options.transport;
    var crypto = options.crypto || root.OporaE2ECrypto;
    var cryptoOptions = options.cryptoOptions || {};
    var dek = null;
    var wraps = null;
    var wrapsDirty = false; // новая обёртка ключа ещё не отправлена в облако

    function fail(code) { var error = new Error(code); error.code = code; return error; }

    function state() {
      if (dek) return "unlocked";
      return "locked";
    }

    // Что лежит в облаке: ничего / зашифрованный снимок. Открытый (нешифрованный) снимок отвергается.
    async function probe() {
      var remote = await inner.pull();
      if (!remote || remote.revision === 0 || remote.revision === undefined) return { exists: false, revision: 0 };
      if (!crypto.isEnvelope(remote.snapshot)) throw fail("e2e-not-encrypted");
      crypto.checkEnvelope(remote.snapshot, cryptoOptions);
      wraps = remote.snapshot.wraps;
      return { exists: true, revision: remote.revision };
    }

    async function setup(passphrase) {
      var found = await probe();
      if (found.exists) throw fail("e2e-already-initialized");
      var vault = await crypto.createVault(passphrase, cryptoOptions);
      dek = vault.dek;
      wraps = vault.wraps;
      return { recoveryKey: vault.recoveryKey };
    }

    async function unlock(passphrase) {
      var found = await probe();
      if (!found.exists) throw fail("e2e-not-initialized");
      dek = await crypto.unlockWithPassphrase(wraps, passphrase, cryptoOptions);
      return { ok: true };
    }

    async function unlockWithRecovery(recoveryKey) {
      var found = await probe();
      if (!found.exists) throw fail("e2e-not-initialized");
      dek = await crypto.unlockWithRecovery(wraps, recoveryKey, cryptoOptions);
      return { ok: true };
    }

    async function changePassphrase(newPassphrase) {
      if (!dek || !wraps) throw fail("e2e-locked");
      wraps = await crypto.rewrapPassphrase(dek, wraps, newPassphrase, cryptoOptions);
      wrapsDirty = true;
      return { ok: true, needsSync: true };
    }

    function lock() { dek = null; wraps = null; wrapsDirty = false; return { ok: true }; }

    async function pull() {
      var remote = await inner.pull();
      if (!remote || remote.revision === 0) return remote;
      if (!dek) throw fail("e2e-locked");
      if (!wrapsDirty && crypto.isEnvelope(remote.snapshot)) wraps = remote.snapshot.wraps;
      return { revision: remote.revision, snapshot: await crypto.decryptSnapshot(dek, remote.snapshot, cryptoOptions) };
    }

    async function push(payload) {
      if (!dek || !wraps) throw fail("e2e-locked");
      var envelope = await crypto.encryptSnapshot(dek, wraps, payload.snapshot);
      var result = await inner.push({ snapshot: envelope, ifMatch: payload.ifMatch });
      if (result && result.ok === true) wrapsDirty = false;
      if (result && result.snapshot) {
        // При конфликте сервер возвращает чужую запись: расшифровываем её своим ключом.
        // Если расшифровать нельзя (другой ключ), конфликт сообщается без содержимого.
        try { result.snapshot = await crypto.decryptSnapshot(dek, result.snapshot, cryptoOptions); }
        catch (_) { result.snapshot = null; }
      }
      return result;
    }

    return {
      configured: function () { return !!inner && typeof inner.configured === "function" ? inner.configured() : !!inner; },
      pull: pull,
      push: push,
      deleteRemote: function () { return inner.deleteRemote(); },
      e2e: { state: state, probe: probe, setup: setup, unlock: unlock, unlockWithRecovery: unlockWithRecovery,
        changePassphrase: changePassphrase, lock: lock }
    };
  }

  return { create: create };
});
