(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = 1;
  var BACKUP_PREFIX = "opora_v2_backup_";
  var COLLECTIONS = ["ci", "ep", "ev", "chat", "notes", "cc", "cp"];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeDefaults(target, defaults, path) {
    Object.keys(defaults).forEach(function (key) {
      var value = target[key];
      var fallback = defaults[key];
      var field = path ? path + "." + key : key;
      if (value === undefined || value === null) {
        target[key] = copy(fallback);
      } else if (Array.isArray(fallback)) {
        if (!Array.isArray(value)) throw new Error("invalid-array:" + field);
      } else if (isObject(fallback)) {
        if (!isObject(value)) throw new Error("invalid-object:" + field);
        mergeDefaults(value, fallback, field);
      }
    });
    return target;
  }

  function validateState(value) {
    if (!isObject(value)) throw new Error("invalid-root");
    COLLECTIONS.forEach(function (key) {
      if (value[key] !== undefined && !Array.isArray(value[key])) {
        throw new Error("invalid-array:" + key);
      }
    });
    ["p", "ui"].forEach(function (key) {
      if (value[key] !== undefined && !isObject(value[key])) {
        throw new Error("invalid-object:" + key);
      }
    });
    if (value.schemaVersion !== undefined &&
        (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 0)) {
      throw new Error("invalid-schema-version");
    }
    if (value.schemaVersion > VERSION) throw new Error("unsupported-schema-version");
    return true;
  }

  function create(options) {
    options = options || {};
    var key = options.key || "opora_v2";
    var defaults = options.defaults || {};
    var storage = options.storage || null;
    if (!storage) {
      try { if (typeof localStorage !== "undefined") storage = localStorage; } catch (_) {}
    }
    if (!storage) {
      storage = {
        get length() { throw new Error("storage-unavailable"); },
        key: function () { throw new Error("storage-unavailable"); },
        getItem: function () { throw new Error("storage-unavailable"); },
        setItem: function () { throw new Error("storage-unavailable"); },
        removeItem: function () { throw new Error("storage-unavailable"); }
      };
    }

    function fresh() {
      var state = copy(defaults);
      state.schemaVersion = VERSION;
      return state;
    }

    function migrate(value) {
      validateState(value);
      var state = copy(value);
      mergeDefaults(state, defaults, "");
      state.schemaVersion = VERSION;
      validateState(state);
      return state;
    }

    function backupRaw(raw, reason) {
      if (raw === null || raw === undefined) return null;
      var stamp = Date.now();
      var backupKey = BACKUP_PREFIX + stamp;
      while (storage.getItem(backupKey) !== null) {
        stamp += 1;
        backupKey = BACKUP_PREFIX + stamp;
      }
      var envelope = {
        format: "opora-local-backup",
        backupVersion: 1,
        sourceKey: key,
        createdAt: new Date(stamp).toISOString(),
        reason: reason || "before-replacement",
        raw: raw
      };
      storage.setItem(backupKey, JSON.stringify(envelope));
      return backupKey;
    }

    function writeWithBackup(state, reason, oldRaw) {
      var backupKey = null;
      try {
        backupKey = backupRaw(oldRaw, reason);
      } catch (error) {
        return { ok: false, error: "backup-failed", detail: error, backupKey: null };
      }
      var serialized;
      try {
        serialized = JSON.stringify(state);
        storage.setItem(key, serialized);
        return { ok: true, backupKey: backupKey, error: null };
      } catch (error) {
        if (oldRaw === null || oldRaw === undefined) {
          try { storage.removeItem(key); } catch (_) {}
        } else {
          try { storage.setItem(key, oldRaw); } catch (_) {}
        }
        return { ok: false, error: "write-failed", detail: error, backupKey: backupKey };
      }
    }

    function load() {
      var raw;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        return { ok: false, blocked: true, status: "read-failed", state: fresh(), error: error };
      }
      if (raw === null) {
        return { ok: true, blocked: false, status: "empty", state: fresh(), backupKey: null };
      }

      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return { ok: false, blocked: true, status: "corrupt-data", state: fresh(), raw: raw, error: error, backupKey: null };
      }
      try {
        validateState(parsed);
      } catch (error) {
        return {
          ok: false, blocked: true,
          status: error && error.message === "unsupported-schema-version" ? "unsupported-version" : "invalid-data",
          state: fresh(), raw: raw, error: error, backupKey: null
        };
      }

      var migrated;
      try {
        migrated = migrate(parsed);
      } catch (error) {
        return { ok: false, blocked: true, status: "invalid-data", state: fresh(), raw: raw, error: error, backupKey: null };
      }
      var nextRaw = JSON.stringify(migrated);
      if (nextRaw !== raw) {
        var result = writeWithBackup(migrated, "schema-migration", raw);
        if (!result.ok) {
          return { ok: false, blocked: true, status: result.error, state: fresh(), raw: raw, error: result.detail, backupKey: result.backupKey };
        }
        return { ok: true, blocked: false, status: "migrated", state: migrated, backupKey: result.backupKey };
      }
      return { ok: true, blocked: false, status: "ready", state: migrated, backupKey: null };
    }

    function save(state) {
      var normalized;
      try {
        validateState(state);
        normalized = migrate(state);
      } catch (error) {
        return { ok: false, error: "save-failed", detail: error };
      }

      var oldRaw;
      try {
        oldRaw = storage.getItem(key);
      } catch (error) {
        return { ok: false, error: "read-failed", detail: error };
      }

      try {
        storage.setItem(key, JSON.stringify(normalized));
        return { ok: true, state: normalized };
      } catch (error) {
        try {
          if (oldRaw === null) storage.removeItem(key);
          else storage.setItem(key, oldRaw);
        } catch (_) {}
        return { ok: false, error: "write-failed", detail: error };
      }
    }

    function replaceState(value, reason) {
      var normalized;
      try {
        normalized = migrate(value);
      } catch (error) {
        return { ok: false, error: "invalid-import", detail: error };
      }
      var oldRaw;
      try { oldRaw = storage.getItem(key); }
      catch (error) { return { ok: false, error: "read-failed", detail: error }; }
      var result = writeWithBackup(normalized, reason || "replace-data", oldRaw);
      if (!result.ok) return result;
      return { ok: true, state: normalized, backupKey: result.backupKey };
    }

    function importText(text) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return { ok: false, error: "invalid-json", detail: error };
      }
      return replaceState(parsed, "before-import");
    }

    function listBackups() {
      var items = [];
      try {
        for (var i = 0; i < storage.length; i += 1) {
          var name = storage.key(i);
          if (!name || name.indexOf(BACKUP_PREFIX) !== 0) continue;
          try {
            var entry = JSON.parse(storage.getItem(name));
            items.push({ key: name, createdAt: entry.createdAt || "", reason: entry.reason || "" });
          } catch (_) {
            items.push({ key: name, createdAt: "", reason: "unreadable-backup" });
          }
        }
      } catch (_) { return []; }
      return items.sort(function (a, b) { return a.key < b.key ? 1 : -1; });
    }

    function restoreBackup(backupKey) {
      var entry;
      try {
        entry = JSON.parse(storage.getItem(backupKey));
        if (!entry || entry.format !== "opora-local-backup" ||
            entry.backupVersion !== 1 || entry.sourceKey !== key ||
            typeof entry.raw !== "string") throw new Error("invalid-backup");
      } catch (error) {
        return { ok: false, error: "invalid-backup", detail: error };
      }
      var raw;
      try { raw = storage.getItem(key); }
      catch (error) { return { ok: false, error: "read-failed", detail: error }; }
      var currentBackup;
      try { currentBackup = backupRaw(raw, "before-restore"); }
      catch (error) { return { ok: false, error: "backup-failed", detail: error }; }
      try {
        storage.setItem(key, entry.raw);
      } catch (error) {
        if (raw === null) {
          try { storage.removeItem(key); } catch (_) {}
        } else {
          try { storage.setItem(key, raw); } catch (_) {}
        }
        return { ok: false, error: "restore-failed", detail: error, backupKey: currentBackup };
      }
      return { ok: true, backupKey: currentBackup, raw: entry.raw };
    }

    function exportText(state) {
      return JSON.stringify(migrate(state), null, 2);
    }

    function raw() {
      try { return storage.getItem(key); }
      catch (_) { return null; }
    }

    return {
      version: VERSION,
      fresh: fresh,
      migrate: migrate,
      validate: validateState,
      load: load,
      save: save,
      replaceState: replaceState,
      importText: importText,
      restoreBackup: restoreBackup,
      listBackups: listBackups,
      exportText: exportText,
      raw: raw
    };
  }

  return { VERSION: VERSION, create: create };
});
