/* Сквозное шифрование облачного снимка (Web Crypto, без внешних библиотек).

   Модель ключей:
   - данные шифруются случайным ключом данных (DEK, AES-256-GCM), который создаётся на устройстве;
   - DEK хранится в облаке только в «обёрнутом» виде: отдельно под ключом из парольной фразы
     (PBKDF2-HMAC-SHA256) и отдельно под ключом восстановления (HKDF, 160 бит энтропии);
   - смена фразы не требует перешифровывать данные: меняется только обёртка DEK;
   - сервер видит размер, время записи и служебные параметры, но не содержимое и не ключи. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaE2ECrypto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var FORMAT = "opora-e2e";
  var VERSION = 1;
  var DEFAULT_ITERATIONS = 600000;
  var MIN_ITERATIONS = 100000;
  var MAX_ITERATIONS = 5000000;
  var MIN_PASSPHRASE = 10;
  var MAX_ENVELOPE_CHARS = 8 * 1024 * 1024;
  var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  function subtle() {
    var c = root.crypto;
    if (!c || !c.subtle || typeof c.getRandomValues !== "function") throw new Error("e2e-crypto-unavailable");
    return c;
  }

  function fail(code, detail) {
    var error = new Error(code);
    error.code = code;
    if (detail) error.detail = detail;
    return error;
  }

  function utf8(text) { return new TextEncoder().encode(String(text)); }
  function random(length) { return subtle().getRandomValues(new Uint8Array(length)); }

  function toBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function fromBase64(text) {
    if (typeof text !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw fail("e2e-malformed");
    var binary = atob(text);
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  function normalizePassphrase(passphrase) {
    if (typeof passphrase !== "string") throw fail("e2e-passphrase-invalid");
    return passphrase.normalize("NFKC");
  }

  function checkNewPassphrase(passphrase) {
    var text = normalizePassphrase(passphrase);
    if (Array.from(text).length < MIN_PASSPHRASE) throw fail("e2e-passphrase-too-short");
    return text;
  }

  // ---- ключ восстановления ----
  function encodeRecoveryKey(bytes) {
    var bits = 0, value = 0, out = "";
    for (var i = 0; i < bytes.length; i += 1) {
      value = (value << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    return out.match(/.{1,4}/g).join("-");
  }

  function decodeRecoveryKey(text) {
    var clean = String(text || "").toUpperCase().replace(/[\s-]/g, "");
    if (clean.length !== 32 || /[^A-Z2-7]/.test(clean)) throw fail("e2e-recovery-key-invalid");
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < clean.length; i += 1) {
      value = (value << 5) | BASE32.indexOf(clean[i]); bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }

  // ---- получение ключей-обёрток ----
  async function passphraseKek(passphrase, salt, iterations, usages) {
    var base = await subtle().subtle.importKey("raw", utf8(normalizePassphrase(passphrase)), "PBKDF2", false, ["deriveKey"]);
    return subtle().subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations },
      base, { name: "AES-GCM", length: 256 }, false, usages);
  }

  async function recoveryKek(recoveryBytes, salt, usages) {
    var base = await subtle().subtle.importKey("raw", recoveryBytes, "HKDF", false, ["deriveKey"]);
    return subtle().subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: salt, info: utf8("opora-e2e-recovery-v1") },
      base, { name: "AES-GCM", length: 256 }, false, usages);
  }

  function wrapAad(type) { return utf8(FORMAT + ":wrap:v" + VERSION + ":" + type); }
  var DATA_AAD = utf8(FORMAT + ":data:v" + VERSION);

  async function wrapDek(dek, kek, type) {
    var iv = random(12);
    var wrapped = await subtle().subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv: iv, additionalData: wrapAad(type) });
    return { iv: iv, wk: new Uint8Array(wrapped) };
  }

  async function unwrapDek(wrap, kek) {
    try {
      return await subtle().subtle.unwrapKey("raw", fromBase64(wrap.wk), kek,
        { name: "AES-GCM", iv: fromBase64(wrap.iv), additionalData: wrapAad(wrap.type) },
        { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    } catch (error) {
      if (error && error.code === "e2e-malformed") throw error;
      throw fail("e2e-wrong-key");
    }
  }

  function validateWraps(wraps, options) {
    var minIterations = options && options.minIterations !== undefined ? options.minIterations : MIN_ITERATIONS;
    if (!Array.isArray(wraps) || wraps.length < 1 || wraps.length > 4) throw fail("e2e-malformed");
    wraps.forEach(function (wrap) {
      if (!wrap || (wrap.type !== "passphrase" && wrap.type !== "recovery") ||
          typeof wrap.salt !== "string" || typeof wrap.iv !== "string" || typeof wrap.wk !== "string") throw fail("e2e-malformed");
      if (wrap.type === "passphrase" &&
          (!Number.isInteger(wrap.iter) || wrap.iter < minIterations || wrap.iter > MAX_ITERATIONS)) throw fail("e2e-kdf-out-of-range");
    });
  }

  function serializeWrap(type, salt, wrapped, iterations) {
    var wrap = { type: type, kdf: type === "passphrase" ? "PBKDF2-SHA256" : "HKDF-SHA256",
      salt: toBase64(salt), iv: toBase64(wrapped.iv), wk: toBase64(wrapped.wk) };
    if (type === "passphrase") wrap.iter = iterations;
    return wrap;
  }

  // ---- хранилище ключей (vault) ----
  // Возвращает { dek, wraps, recoveryKey }. recoveryKey показывается пользователю один раз.
  async function createVault(passphrase, options) {
    options = options || {};
    var iterations = options.iterations || DEFAULT_ITERATIONS;
    if (iterations < (options.minIterations !== undefined ? options.minIterations : MIN_ITERATIONS) || iterations > MAX_ITERATIONS) {
      throw fail("e2e-kdf-out-of-range");
    }
    var text = checkNewPassphrase(passphrase);
    var dek = await subtle().subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

    var pSalt = random(16);
    var pWrapped = await wrapDek(dek, await passphraseKek(text, pSalt, iterations, ["wrapKey", "unwrapKey"]), "passphrase");

    var recoveryBytes = random(20);
    var rSalt = random(16);
    var rWrapped = await wrapDek(dek, await recoveryKek(recoveryBytes, rSalt, ["wrapKey", "unwrapKey"]), "recovery");

    return {
      dek: dek,
      recoveryKey: encodeRecoveryKey(recoveryBytes),
      wraps: [serializeWrap("passphrase", pSalt, pWrapped, iterations), serializeWrap("recovery", rSalt, rWrapped)]
    };
  }

  async function unlockWithPassphrase(wraps, passphrase, options) {
    validateWraps(wraps, options);
    var wrap = wraps.filter(function (item) { return item.type === "passphrase"; })[0];
    if (!wrap) throw fail("e2e-malformed");
    var kek = await passphraseKek(passphrase, fromBase64(wrap.salt), wrap.iter, ["unwrapKey"]);
    return unwrapDek(wrap, kek);
  }

  async function unlockWithRecovery(wraps, recoveryKey, options) {
    validateWraps(wraps, options);
    var wrap = wraps.filter(function (item) { return item.type === "recovery"; })[0];
    if (!wrap) throw fail("e2e-malformed");
    var kek = await recoveryKek(decodeRecoveryKey(recoveryKey), fromBase64(wrap.salt), ["unwrapKey"]);
    return unwrapDek(wrap, kek);
  }

  // Заменяет только обёртку под фразу; обёртка под ключ восстановления остаётся прежней.
  async function rewrapPassphrase(dek, wraps, newPassphrase, options) {
    options = options || {};
    var iterations = options.iterations || DEFAULT_ITERATIONS;
    var text = checkNewPassphrase(newPassphrase);
    var salt = random(16);
    var wrapped = await wrapDek(dek, await passphraseKek(text, salt, iterations, ["wrapKey", "unwrapKey"]), "passphrase");
    return wraps.filter(function (item) { return item.type !== "passphrase"; })
      .concat([serializeWrap("passphrase", salt, wrapped, iterations)]);
  }

  // ---- шифрование снимка ----
  async function encryptSnapshot(dek, wraps, snapshot) {
    validateWraps(wraps, { minIterations: 1 });
    var iv = random(12);
    var ct = await subtle().subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: DATA_AAD }, dek, utf8(JSON.stringify(snapshot)));
    return { format: FORMAT, v: VERSION, alg: "AES-256-GCM", iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)), wraps: wraps };
  }

  function isEnvelope(payload) {
    return !!payload && typeof payload === "object" && !Array.isArray(payload) && payload.format === FORMAT;
  }

  function checkEnvelope(payload, options) {
    if (!isEnvelope(payload)) throw fail("e2e-not-encrypted");
    if (payload.v !== VERSION) throw fail("e2e-unsupported-version");
    if (payload.alg !== "AES-256-GCM" || typeof payload.iv !== "string" || typeof payload.ct !== "string" ||
        payload.ct.length > MAX_ENVELOPE_CHARS) throw fail("e2e-malformed");
    validateWraps(payload.wraps, options);
  }

  async function decryptSnapshot(dek, payload, options) {
    checkEnvelope(payload, options);
    var plain;
    try {
      plain = await subtle().subtle.decrypt({ name: "AES-GCM", iv: fromBase64(payload.iv), additionalData: DATA_AAD }, dek, fromBase64(payload.ct));
    } catch (error) {
      if (error && error.code === "e2e-malformed") throw error;
      throw fail("e2e-wrong-key");
    }
    var snapshot;
    try { snapshot = JSON.parse(new TextDecoder().decode(plain)); }
    catch (_) { throw fail("e2e-malformed"); }
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw fail("e2e-malformed");
    return snapshot;
  }

  return {
    FORMAT: FORMAT, VERSION: VERSION, DEFAULT_ITERATIONS: DEFAULT_ITERATIONS, MIN_PASSPHRASE: MIN_PASSPHRASE,
    createVault: createVault, unlockWithPassphrase: unlockWithPassphrase, unlockWithRecovery: unlockWithRecovery,
    rewrapPassphrase: rewrapPassphrase, encryptSnapshot: encryptSnapshot, decryptSnapshot: decryptSnapshot,
    isEnvelope: isEnvelope, checkEnvelope: checkEnvelope, encodeRecoveryKey: encodeRecoveryKey, decodeRecoveryKey: decodeRecoveryKey
  };
});
