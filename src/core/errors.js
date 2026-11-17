/* Локальные уведомления о необработанных ошибках.
   Ничего не отправляется наружу: журнал хранится только в этом браузере,
   содержит тип ошибки, краткое сообщение и место в коде, но не записи пользователя. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OporaErrors = api;
  if (root.addEventListener && root.document) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var LOG_KEY = "opora_error_log_v1";
  var MAX_ENTRIES = 20;
  var MAX_TEXT = 300;
  var TOAST_GAP_MS = 8000;
  var memory = [];
  var lastToastAt = 0;
  var installed = false;

  function clip(value) {
    var text;
    try { text = String(value === undefined || value === null ? "" : value); }
    catch (_) { text = "[не удалось преобразовать]"; }
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "…" : text;
  }

  function storageOrNull() {
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function readStored() {
    var store = storageOrNull();
    if (!store) return null;
    try {
      var parsed = JSON.parse(store.getItem(LOG_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function list() {
    var stored = readStored();
    return (stored === null ? memory : stored).slice();
  }

  function persist(entries) {
    memory = entries;
    var store = storageOrNull();
    if (!store) return;
    try { store.setItem(LOG_KEY, JSON.stringify(entries)); } catch (_) { /* журнал необязателен */ }
  }

  function describe(error) {
    if (error && typeof error === "object") {
      return {
        name: clip(error.name || "Error"),
        message: clip(error.message || error),
        stack: clip(error.stack || "")
      };
    }
    return { name: "Error", message: clip(error), stack: "" };
  }

  function ignorable(info) {
    return /ResizeObserver loop/i.test(info.message) || /^Script error\.?$/i.test(info.message);
  }

  function notify(message) {
    var now = Date.now();
    if (now - lastToastAt < TOAST_GAP_MS) return;
    lastToastAt = now;
    try {
      if (typeof root.toast === "function" && root.document && root.document.getElementById("toast")) {
        root.toast(message, "err");
        return;
      }
    } catch (_) { /* переходим к запасному варианту */ }
    try {
      var doc = root.document;
      if (!doc || !doc.body) return;
      var box = doc.getElementById("opora-error-notice");
      if (!box) {
        box = doc.createElement("div");
        box.id = "opora-error-notice";
        box.setAttribute("role", "status");
        box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
          "max-width:90%;padding:10px 18px;border-radius:999px;background:#444;color:#fff;" +
          "z-index:1000;font:14px system-ui,sans-serif;text-align:center";
        doc.body.appendChild(box);
      }
      box.textContent = message;
      box.hidden = false;
      setTimeout(function () { box.hidden = true; }, 6000);
    } catch (_) { /* уведомление не должно вызывать новую ошибку */ }
  }

  function report(error, context) {
    var info = describe(error);
    if (ignorable(info)) return null;
    var entry = {
      at: new Date().toISOString(),
      context: clip(context || ""),
      name: info.name,
      message: info.message,
      stack: info.stack
    };
    var entries = list();
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
    persist(entries);
    notify("Что-то пошло не так. Данные не потеряны; сведения об ошибке сохранены только на этом устройстве.");
    return entry;
  }

  function guard(fn, context) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (error) { report(error, context); }
    };
  }

  function clear() {
    memory = [];
    var store = storageOrNull();
    if (!store) return;
    try { store.removeItem(LOG_KEY); } catch (_) {}
  }

  function exportText() {
    return list().map(function (item) {
      return [item.at, item.context, item.name + ": " + item.message, item.stack].filter(Boolean).join("\n");
    }).join("\n\n");
  }

  function install(target) {
    if (installed) return;
    installed = true;
    target.addEventListener("error", function (event) {
      if (event && event.target && event.target !== target && event.target.tagName) return; // ошибки загрузки ресурсов
      var place = event && event.filename ? String(event.filename).split("/").pop() + ":" + event.lineno : "";
      report(event && event.error ? event.error : (event && event.message), "window.error " + place);
    });
    target.addEventListener("unhandledrejection", function (event) {
      report(event ? event.reason : "unhandledrejection", "unhandledrejection");
    });
  }

  return { LOG_KEY: LOG_KEY, MAX_ENTRIES: MAX_ENTRIES, report: report, guard: guard, list: list,
    count: function () { return list().length; }, clear: clear, exportText: exportText, install: install };
});
