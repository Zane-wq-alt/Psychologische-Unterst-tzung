/* Трёхстороннее слияние данных «Опоры» на устройстве (после расшифровки облачной копии).
   Сравниваются три состояния: база (то, что было при последней успешной синхронизации),
   локальные данные и облачная копия. Модель данных не меняется:
   - записи коллекций (чек-ины, эпизоды, события, заметки, фразы, карточки, архив) определяются
     по содержимому; одинаковые повторы различаются порядковым номером;
   - изменение записи = удаление старой + добавление новой, поэтому правка на одном устройстве
     и новая запись на другом сходятся без потерь;
   - остальные поля сравниваются по листьям вложенных объектов (профиль, настройки, отметки по датам и т. д.).
   Правила для листьев: если одна сторона не менялась относительно базы, берётся другая;
   если изменены обе — выигрывает локальная версия, но «правка против удаления» сохраняет правку.
   Ничего не удаляется только потому, что записи нет на одной из сторон: нужна база, где она была. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaMerge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEYED = ["ci", "ep", "ev", "chat", "notes", "cc", "cp"];
  var SKIP_TOP = ["schemaVersion", "cloudRevision", "cloudConsent", "cloudBase"];

  function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (isObject(value)) {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stable(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  // Быстрый несекретный хеш (cyrb53) только для обнаружения изменений на устройстве.
  function hash(text) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function pathKey(parts) { return JSON.stringify(parts); }

  // Разворачивает состояние в плоскую таблицу листьев: ключ пути -> { path, value, hash, keyed }.
  function flatten(state) {
    var leaves = Object.create(null);
    function put(path, value, keyed) {
      leaves[pathKey(path)] = { path: path, value: value, hash: hash(stable(value)), keyed: keyed };
    }
    function walk(value, path) {
      if (isObject(value)) {
        Object.keys(value).forEach(function (key) { walk(value[key], path.concat([key])); });
      } else {
        put(path, value, false);
      }
    }
    Object.keys(state || {}).forEach(function (key) {
      if (SKIP_TOP.indexOf(key) !== -1) return;
      var value = state[key];
      if (KEYED.indexOf(key) !== -1 && Array.isArray(value)) {
        var seen = Object.create(null);
        value.forEach(function (item) {
          var h = hash(stable(item));
          var n = seen[h] || 0;
          seen[h] = n + 1;
          put([key, h + "#" + n], item, true);
        });
      } else {
        walk(value, [key]);
      }
    });
    return leaves;
  }

  // Отпечаток для хранения как «база последней синхронизации»: путь -> хеш.
  function fingerprint(state) {
    var leaves = flatten(state), out = {};
    Object.keys(leaves).forEach(function (key) { out[key] = leaves[key].hash; });
    return out;
  }

  function setNested(target, path, value) {
    var node = target;
    for (var i = 0; i < path.length - 1; i += 1) {
      if (!isObject(node[path[i]])) node[path[i]] = {};
      node = node[path[i]];
    }
    node[path[path.length - 1]] = value;
  }

  function deleteNested(target, path) {
    var node = target;
    for (var i = 0; i < path.length - 1; i += 1) {
      if (!isObject(node[path[i]])) return;
      node = node[path[i]];
    }
    delete node[path[path.length - 1]];
  }

  // base: отпечаток (или null), local/remote: состояния, defaults: пустое состояние (fresh()).
  // Для листьев, которых нет в базе, «неизменённым» считается значение по умолчанию:
  // новое пустое устройство принимает облачные значения, а не затирает их своими.
  function merge(options) {
    options = options || {};
    var local = options.local, remote = options.remote;
    if (!isObject(local) || !isObject(remote)) return { ok: false, error: "invalid-state" };
    var base = isObject(options.base) ? options.base : {};
    var defaults = flatten(options.defaults || {});

    var L = flatten(local), R = flatten(remote);
    var keys = Object.create(null);
    Object.keys(L).forEach(function (k) { keys[k] = 1; });
    Object.keys(R).forEach(function (k) { keys[k] = 1; });

    var merged = clone(local);
    var stats = { added: 0, removed: 0, updated: 0, conflicts: [] };
    var keyedRemoved = Object.create(null);
    var keyedAdded = Object.create(null);

    Object.keys(keys).forEach(function (k) {
      var l = L[k], r = R[k];
      var hl = l ? l.hash : undefined, hr = r ? r.hash : undefined;
      var item = l || r;
      var hb = base[k] !== undefined ? base[k] : (!item.keyed && defaults[k] ? defaults[k].hash : undefined);
      if (hl === hr) return;

      var takeRemote;
      if (hr === hb) takeRemote = false;
      else if (hl === hb) takeRemote = true;
      else if (hl === undefined) { takeRemote = true; stats.conflicts.push({ path: item.path, kind: "edit-vs-delete" }); }
      else if (hr === undefined) { takeRemote = false; stats.conflicts.push({ path: item.path, kind: "edit-vs-delete" }); }
      else { takeRemote = false; stats.conflicts.push({ path: item.path, kind: "both-edited" }); }
      if (!takeRemote) return;

      if (item.keyed) {
        var coll = item.path[0];
        if (r) (keyedAdded[coll] = keyedAdded[coll] || []).push(r.value);
        else (keyedRemoved[coll] = keyedRemoved[coll] || Object.create(null))[item.path[1]] = true;
        if (r) stats.added += 1; else stats.removed += 1;
      } else {
        if (r) setNested(merged, item.path, clone(r.value)); else deleteNested(merged, item.path);
        stats.updated += 1;
      }
    });

    // Коллекции: сохраняем локальный порядок, затем дописываем новые облачные записи в их порядке.
    KEYED.forEach(function (coll) {
      if (!keyedRemoved[coll] && !keyedAdded[coll]) return;
      var seen = Object.create(null);
      var kept = (Array.isArray(local[coll]) ? local[coll] : []).filter(function (item) {
        var h = hash(stable(item));
        var n = seen[h] || 0;
        seen[h] = n + 1;
        return !(keyedRemoved[coll] && keyedRemoved[coll][h + "#" + n]);
      });
      merged[coll] = kept.concat(clone(keyedAdded[coll] || []));
    });

    return {
      ok: true,
      state: merged,
      stats: stats,
      changedLocal: stable(merged) !== stable(local),
      changedRemote: stable(stripCloud(merged)) !== stable(stripCloud(remote))
    };
  }

  function stripCloud(state) {
    var copy = clone(state);
    SKIP_TOP.forEach(function (key) { if (key !== "schemaVersion") delete copy[key]; });
    return copy;
  }

  return { fingerprint: fingerprint, merge: merge, KEYED: KEYED };
});
