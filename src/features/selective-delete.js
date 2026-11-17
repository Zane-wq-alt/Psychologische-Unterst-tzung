/* Выборочное удаление данных по разделам.
   Чистые функции: ничего не пишут в хранилище. Запись и резервную копию
   выполняет OporaStorage.replaceState(). Поля, которых нет в списке
   (настройки интерфейса, неизвестные поля будущих версий, служебные метки),
   не изменяются. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaSelectiveDelete = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CATEGORIES = [
    { id: "checkins", label: "Чек-ины", paths: ["ci"] },
    { id: "episodes", label: "Эпизоды перегрузки", paths: ["ep"] },
    { id: "events", label: "События и подготовка", paths: ["ev"] },
    { id: "notes", label: "Заметки", paths: ["notes"] },
    { id: "phrases", label: "Свои фразы и карточки «без слов»", paths: ["cp", "cc"] },
    { id: "progress", label: "Отметки, планы и прогресс",
      paths: ["hlp", "md", "plan", "rt.done", "sp.hist", "sp.log"] },
    { id: "archive", label: "Архив старого диалога", paths: ["chat"] },
    { id: "profile", label: "Профиль и чувствительность", paths: ["p"] }
  ];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getPath(source, path) {
    return path.split(".").reduce(function (node, part) {
      return node === undefined || node === null ? undefined : node[part];
    }, source);
  }

  function setPath(target, path, value) {
    var parts = path.split(".");
    var node = target;
    for (var i = 0; i < parts.length - 1; i += 1) {
      if (!isObject(node[parts[i]])) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  function weigh(value) {
    if (Array.isArray(value)) return value.length;
    if (isObject(value)) return Object.keys(value).length;
    return value ? 1 : 0;
  }

  function find(id) {
    for (var i = 0; i < CATEGORIES.length; i += 1) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  function profileFilled(state, empty) {
    var current = isObject(state.p) ? state.p : {};
    var base = isObject(empty.p) ? empty.p : {};
    return Object.keys(current).filter(function (field) {
      return JSON.stringify(current[field]) !== JSON.stringify(base[field]);
    }).length;
  }

  function summarize(state, empty) {
    state = state || {};
    empty = empty || {};
    return CATEGORIES.map(function (category) {
      var count = category.id === "profile"
        ? profileFilled(state, empty)
        : category.paths.reduce(function (sum, path) { return sum + weigh(getPath(state, path)); }, 0);
      return { id: category.id, label: category.label, count: count };
    });
  }

  // state — текущие данные, ids — выбранные разделы, empty — пустое состояние
  // (OporaStorage.fresh()), из которого берутся значения по умолчанию.
  function plan(state, ids, empty) {
    if (!isObject(state) || !isObject(empty)) return { ok: false, error: "invalid-state" };
    if (!Array.isArray(ids) || !ids.length) return { ok: false, error: "nothing-selected" };
    var unique = [];
    for (var i = 0; i < ids.length; i += 1) {
      if (!find(ids[i])) return { ok: false, error: "unknown-category", detail: ids[i] };
      if (unique.indexOf(ids[i]) === -1) unique.push(ids[i]);
    }
    var before = summarize(state, empty);
    var next = clone(state);
    unique.forEach(function (id) {
      find(id).paths.forEach(function (path) {
        var replacement = clone(getPath(empty, path));
        if (replacement === undefined) replacement = Array.isArray(getPath(state, path)) ? [] : {};
        setPath(next, path, replacement);
      });
    });
    return {
      ok: true,
      state: next,
      categories: unique,
      removed: before.filter(function (item) { return unique.indexOf(item.id) !== -1; })
    };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function render(options) {
    options = options || {};
    var summary = Array.isArray(options.summary) ? options.summary : [];
    var copies = options.copies || { backups: 0, legacy: false };
    var disabled = options.disabled ? " disabled" : "";
    var rows = summary.map(function (item) {
      var off = disabled || (item.count ? "" : " disabled");
      return '<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" data-sd="' + esc(item.id) + '"' + off + ' style="flex:none;width:auto;margin:0">' +
        '<span style="flex:1">' + esc(item.label) + ' <span class="mut">(' + item.count + ')</span></span></label>';
    }).join("");
    var hasCopies = copies.backups > 0 || copies.legacy;
    return '<div class="card" id="sd-panel"><h2>Выборочное удаление</h2>' +
      '<p class="mut">Отметьте разделы, которые нужно удалить. Остальные данные и настройки не изменятся. ' +
      'Перед удалением приложение создаёт локальную точку восстановления, если вы не выберете её удаление.</p>' +
      rows +
      '<p class="mut">Точки восстановления и копия данных прежней версии хранят удаляемое: ' +
      'точек восстановления — ' + copies.backups + ', копия прежней версии — ' + (copies.legacy ? "есть" : "нет") + '. ' +
      'Облачная копия, если она включена, изменится только при следующей синхронизации.</p>' +
      '<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" data-sdpurge="1"' + disabled + (hasCopies ? "" : " disabled") + ' style="flex:none;width:auto;margin:0">' +
      '<span style="flex:1">Также окончательно удалить точки восстановления и копию прежней версии</span></label>' +
      '<div class="row" style="margin-top:8px"><button type="button" data-a="sddo"' + disabled + '>Удалить выбранное</button></div></div>';
  }

  return { CATEGORIES: CATEGORIES, summarize: summarize, plan: plan, render: render };
});
