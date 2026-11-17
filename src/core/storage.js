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
      if (value === undefined) {
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

  function assertStringArray(value, path) {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new Error("invalid-array:" + path);
    value.forEach(function (item, index) {
      if (typeof item !== "string") throw new Error("invalid-item:" + path + "[" + index + "]");
    });
  }

  function assertObjectArray(value, path) {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new Error("invalid-array:" + path);
    value.forEach(function (item, index) {
      if (!isObject(item)) throw new Error("invalid-record:" + path + "[" + index + "]");
    });
  }

  function validateKnownShapes(value) {
    ["ci", "ep", "ev", "chat", "notes"].forEach(function (key) {
      assertObjectArray(value[key], key);
    });

    ["cc", "cp"].forEach(function (key) {
      if (value[key] === undefined) return;
      if (!Array.isArray(value[key])) throw new Error("invalid-array:" + key);
      value[key].forEach(function (item, index) {
        if (item === null ||
            !(typeof item === "string" || Array.isArray(item) || isObject(item))) {
          throw new Error("invalid-record:" + key + "[" + index + "]");
        }
      });
    });

    if (isObject(value.p)) {
      assertStringArray(value.p.sens, "p.sens");
      assertStringArray(value.p.trig, "p.trig");
    }
    if (isObject(value.ui)) {
      assertStringArray(value.ui.dm, "ui.dm");
      assertStringArray(value.ui.fav, "ui.fav");
      assertObjectArray(value.ui.rem, "ui.rem");
    }
    if (isObject(value.sp)) {
      assertObjectArray(value.sp.tasks, "sp.tasks");
      assertObjectArray(value.sp.fav, "sp.fav");
    }
    if (isObject(value.rt)) {
      assertStringArray(value.rt.morning, "rt.morning");
      assertStringArray(value.rt.evening, "rt.evening");
      if (value.rt.done !== undefined) {
        if (!isObject(value.rt.done)) throw new Error("invalid-object:rt.done");
        Object.keys(value.rt.done).forEach(function (day) {
          assertStringArray(value.rt.done[day], "rt.done." + day);
        });
      }
    }
    if (isObject(value.st)) {
      assertObjectArray(value.st.steps, "st.steps");
    }
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
    validateKnownShapes(value);
    return true;
  }

  function create(options) {
    options = options || {};
    var key = options.key || "opora_v2";
    var legacyKey = options.legacyKey || null;
    var migrationMarkerKey = options.migrationMarkerKey || (key + "_migration_complete");
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

    function readCurrentRaw() {
      var current = storage.getItem(key);
      if (current === null && legacyKey && legacyKey !== key) {
        return storage.getItem(legacyKey);
      }
      return current;
    }

    function recordCounts(state) {
      var counts = {};
      COLLECTIONS.forEach(function (name) {
        if (Array.isArray(state[name])) counts[name] = state[name].length;
      });
      return counts;
    }

    function writeMigrationMarker(source, state, backupKey) {
      var marker = {
        format: "opora-migration-complete",
        version: VERSION,
        sourceKey: source,
        targetKey: key,
        completedAt: new Date().toISOString(),
        recordCounts: recordCounts(state),
        backupKey: backupKey || null
      };
      try {
        var rawMarker = JSON.stringify(marker);
        storage.setItem(migrationMarkerKey, rawMarker);
        return storage.getItem(migrationMarkerKey) === rawMarker;
      } catch (_) {
        return false;
      }
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
      var serialized = JSON.stringify(envelope);
      storage.setItem(backupKey, serialized);
      var stored = storage.getItem(backupKey);
      if (stored !== serialized) throw new Error("backup-verification-failed");
      var verified = JSON.parse(stored);
      if (!verified || verified.format !== envelope.format ||
          verified.backupVersion !== envelope.backupVersion ||
          verified.sourceKey !== key || verified.raw !== raw) {
        throw new Error("backup-verification-failed");
      }
      return backupKey;
    }

    function rollbackRaw(oldRaw) {
      try {
        if (oldRaw === null || oldRaw === undefined) storage.removeItem(key);
        else storage.setItem(key, oldRaw);
        return storage.getItem(key) === (oldRaw === undefined ? null : oldRaw);
      } catch (_) {
        return false;
      }
    }

    function writeWithBackup(state, reason, oldRaw) {
      var targetRaw;
      try { targetRaw = storage.getItem(key); }
      catch (error) { return { ok: false, error: "read-failed", detail: error, backupKey: null }; }
      var serialized;
      try {
        serialized = JSON.stringify(state);
        if (typeof serialized !== "string") throw new Error("not-serializable");
      } catch (error) {
        return { ok: false, error: "serialize-failed", detail: error, backupKey: null };
      }

      var backupKey = null;
      try {
        backupKey = backupRaw(oldRaw, reason);
      } catch (error) {
        return { ok: false, error: "backup-failed", detail: error, backupKey: null };
      }

      try {
        storage.setItem(key, serialized);
        var written = storage.getItem(key);
        if (written !== serialized) throw new Error("write-verification-failed");
        validateState(JSON.parse(written));
        return { ok: true, backupKey: backupKey, error: null };
      } catch (error) {
        return {
          ok: false,
          error: "write-failed",
          detail: error,
          backupKey: backupKey,
          rollbackOk: rollbackRaw(targetRaw)
        };
      }
    }

    function load() {
      var raw;
      var sourceKey = key;
      try {
        raw = storage.getItem(key);
        if (raw === null && legacyKey && legacyKey !== key) {
          raw = storage.getItem(legacyKey);
          if (raw !== null) sourceKey = legacyKey;
        }
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
      if (nextRaw !== raw || sourceKey !== key) {
        var result = writeWithBackup(migrated, sourceKey === key ? "schema-migration" : "namespace-migration", raw);
        if (!result.ok) {
          return { ok: false, blocked: true, status: result.error, state: fresh(), raw: raw, error: result.detail, backupKey: result.backupKey };
        }
        var markerSaved = sourceKey === key ? true : writeMigrationMarker(sourceKey, migrated, result.backupKey);
        return { ok: true, blocked: false, status: "migrated", state: migrated, backupKey: result.backupKey, migration: sourceKey === key ? null : { sourceKey: sourceKey, targetKey: key, recordCounts: recordCounts(migrated), markerSaved: markerSaved } };
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
        oldRaw = readCurrentRaw();
      } catch (error) {
        return { ok: false, error: "read-failed", detail: error };
      }

      var previousNeedsMigration = false;
      if (oldRaw !== null) {
        try {
          var previousParsed = JSON.parse(oldRaw);
          validateState(previousParsed);
          var previousNormalized = migrate(previousParsed);
          previousNeedsMigration =
            JSON.stringify(previousNormalized) !== JSON.stringify(previousParsed);
        } catch (error) {
          return { ok: false, error: "existing-data-invalid", detail: error };
        }
      }

      var stateNeedsNormalization =
        JSON.stringify(normalized) !== JSON.stringify(state);
      if (previousNeedsMigration || stateNeedsNormalization) {
        var protectedWrite = writeWithBackup(normalized, "schema-migration", oldRaw);
        if (!protectedWrite.ok) return protectedWrite;
        return {
          ok: true,
          state: normalized,
          backupKey: protectedWrite.backupKey
        };
      }

      var serialized = JSON.stringify(normalized);
      try {
        storage.setItem(key, serialized);
        var written = storage.getItem(key);
        if (written !== serialized) throw new Error("write-verification-failed");
        validateState(JSON.parse(written));
        return { ok: true, state: normalized, backupKey: null };
      } catch (error) {
        return {
          ok: false,
          error: "write-failed",
          detail: error,
          rollbackOk: rollbackRaw(oldRaw)
        };
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
      try { oldRaw = readCurrentRaw(); }
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
      if (typeof backupKey !== "string" ||
          backupKey.indexOf(BACKUP_PREFIX) !== 0) {
        return { ok: false, error: "invalid-backup" };
      }

      var entry;
      try {
        var backupText = storage.getItem(backupKey);
        if (backupText === null) throw new Error("missing-backup");
        entry = JSON.parse(backupText);
        if (!entry || entry.format !== "opora-local-backup" ||
            entry.backupVersion !== 1 || entry.sourceKey !== key ||
            typeof entry.raw !== "string") throw new Error("invalid-backup");
        migrate(JSON.parse(entry.raw));
      } catch (error) {
        return { ok: false, error: "invalid-backup", detail: error };
      }

      var raw;
      try { raw = readCurrentRaw(); }
      catch (error) { return { ok: false, error: "read-failed", detail: error }; }

      var currentBackup;
      try { currentBackup = backupRaw(raw, "before-restore"); }
      catch (error) { return { ok: false, error: "backup-failed", detail: error }; }

      try {
        storage.setItem(key, entry.raw);
        var restored = storage.getItem(key);
        if (restored !== entry.raw) throw new Error("restore-verification-failed");
      } catch (error) {
        return {
          ok: false,
          error: "restore-failed",
          detail: error,
          backupKey: currentBackup,
          rollbackOk: rollbackRaw(raw)
        };
      }
      return { ok: true, backupKey: currentBackup, raw: entry.raw };
    }

    function exportText(state) {
      return JSON.stringify(migrate(state), null, 2);
    }

    function raw() {
      try { return readCurrentRaw(); }
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
