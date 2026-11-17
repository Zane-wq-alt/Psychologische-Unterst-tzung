"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OporaStorage = require("../src/core/storage.js");
const OporaSelectiveDelete = require("../src/features/selective-delete.js");

const defaults = {
  ci: [], ep: [], ev: [], chat: [], notes: [], hlp: {}, cc: [], cp: [], md: {}, plan: {},
  sp: { d: "", total: 12, tasks: [], fav: [], hist: {}, log: {} },
  rt: { morning: ["Вода"], evening: ["Ужин"], done: {} },
  st: { task: "", steps: [] },
  ui: { fs: 1, th: "auto", fav: [] },
  p: { name: "", sens: [], trig: [], spoons: 12 }
};

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key(index) { return Array.from(map.keys())[index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    dump() { return map; }
  };
}

function filled() {
  const state = JSON.parse(JSON.stringify(defaults));
  state.schemaVersion = 1;
  state.ci = [{ d: "2026-11-17", mood: 2 }, { d: "2026-11-16", mood: 3 }];
  state.ep = [{ t: 1, d: "2026-11-17" }];
  state.ev = [{ id: "e1", d: "2026-11-18" }];
  state.notes = [{ t: "заметка", d: "2026-11-17" }];
  state.cp = ["фраза"]; state.cc = [["#fff", "карточка"]];
  state.chat = [{ r: "u", c: "старый диалог" }];
  state.hlp = { вода: 3 }; state.md = { "2026-11-17": [0] }; state.plan = { a: "b" };
  state.rt.done = { "2026-11-17": ["m0"] };
  state.sp.hist = { x: { c: 1, n: 1 } }; state.sp.log = { "2026-11-16": { p: 1 } };
  state.sp.tasks = [{ n: "задача", c: 2 }];
  state.p = { name: "Аня", sens: ["свет"], trig: [], spoons: 8 };
  state.ui = { fs: 1.2, th: "dark", fav: ["x"] };
  state.cloudRevision = 7;
  state.customTopLevel = { futureField: 42 };
  return state;
}

const empty = () => OporaStorage.create({ key: "k", defaults, storage: memoryStorage() }).fresh();

test("summarize counts records per category without exposing content", () => {
  const summary = OporaSelectiveDelete.summarize(filled(), empty());
  const byId = Object.fromEntries(summary.map((item) => [item.id, item.count]));
  assert.equal(byId.checkins, 2);
  assert.equal(byId.episodes, 1);
  assert.equal(byId.phrases, 2);
  assert.equal(byId.archive, 1);
  assert.equal(byId.profile, 3);
  assert.ok(byId.progress >= 5);
  assert.ok(summary.every((item) => Object.keys(item).sort().join() === "count,id,label"));
});

test("plan removes only the selected categories and leaves everything else untouched", () => {
  const state = filled();
  const snapshot = JSON.stringify(state);
  const result = OporaSelectiveDelete.plan(state, ["checkins", "archive"], empty());
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(state), snapshot, "input is not mutated");
  assert.deepEqual(result.state.ci, []);
  assert.deepEqual(result.state.chat, []);
  const expected = filled(); expected.ci = []; expected.chat = [];
  assert.deepEqual(result.state, expected);
  assert.deepEqual(result.removed.map((item) => item.count), [2, 1]);
});

test("progress and profile reset to defaults while keeping routine lists, tasks, UI and unknown fields", () => {
  const result = OporaSelectiveDelete.plan(filled(), ["progress", "profile"], empty());
  const next = result.state;
  assert.deepEqual(next.hlp, {}); assert.deepEqual(next.md, {}); assert.deepEqual(next.plan, {});
  assert.deepEqual(next.rt.done, {}); assert.deepEqual(next.sp.hist, {}); assert.deepEqual(next.sp.log, {});
  assert.deepEqual(next.rt.morning, ["Вода"]);
  assert.deepEqual(next.sp.tasks, [{ n: "задача", c: 2 }]);
  assert.deepEqual(next.p, defaults.p);
  assert.equal(next.ui.th, "dark");
  assert.equal(next.cloudRevision, 7);
  assert.deepEqual(next.customTopLevel, { futureField: 42 });
  assert.equal(next.ci.length, 2);
});

test("plan rejects empty, unknown and malformed requests", () => {
  assert.equal(OporaSelectiveDelete.plan(filled(), [], empty()).error, "nothing-selected");
  assert.equal(OporaSelectiveDelete.plan(filled(), ["nope"], empty()).error, "unknown-category");
  assert.equal(OporaSelectiveDelete.plan(null, ["checkins"], empty()).error, "invalid-state");
});

test("result of a plan is accepted by the storage validator and written with a backup", () => {
  const storage = memoryStorage();
  const db = OporaStorage.create({ key: "opora_v2_data_v1", legacyKey: "opora_v2", defaults, storage });
  db.load();
  assert.equal(db.save(filled()).ok, true);
  const before = storage.getItem("opora_v2_data_v1");
  const plan = OporaSelectiveDelete.plan(filled(), ["notes", "phrases"], db.fresh());
  const written = db.replaceState(plan.state, "before-selective-delete");
  assert.equal(written.ok, true);
  const after = JSON.parse(storage.getItem("opora_v2_data_v1"));
  assert.deepEqual(after.notes, []);
  assert.deepEqual(after.cp, []);
  assert.equal(after.ci.length, 2);
  assert.equal(JSON.parse(storage.getItem(written.backupKey)).raw, before, "deleted data is recoverable from the restore point");
  assert.equal(JSON.parse(storage.getItem(written.backupKey)).reason, "before-selective-delete");
  assert.equal(db.save(after).ok, true);
});

test("purgeLocalCopies removes restore points and the legacy copy but never the only copy of the data", () => {
  const storage = memoryStorage({ opora_v2: JSON.stringify(filled()) });
  const db = OporaStorage.create({ key: "opora_v2_data_v1", legacyKey: "opora_v2", defaults, storage });
  assert.equal(db.load().ok, true);
  const state = filled();
  state.notes = [];
  assert.equal(db.replaceState(state, "before-selective-delete").ok, true);
  const copies = db.localCopies();
  assert.equal(copies.legacy, true);
  assert.ok(copies.backups >= 2);

  const result = db.purgeLocalCopies();
  assert.equal(result.ok, true);
  assert.equal(result.removed.legacy, true);
  assert.deepEqual(db.localCopies(), { backups: 0, legacy: false });
  assert.equal(storage.getItem("opora_v2"), null);
  assert.equal(db.load().state.ci.length, 2, "current data is intact");

  // legacy-only storage: nothing is deleted because it is the only copy
  const onlyLegacy = memoryStorage({ opora_v2: JSON.stringify(filled()) });
  const other = OporaStorage.create({ key: "opora_v2_data_v1", legacyKey: "opora_v2", defaults, storage: onlyLegacy });
  const kept = other.purgeLocalCopies();
  assert.equal(kept.removed.legacy, false);
  assert.notEqual(onlyLegacy.getItem("opora_v2"), null);
});

test("render escapes labels, disables empty categories and when storage is blocked", () => {
  const html = OporaSelectiveDelete.render({
    summary: [{ id: "a", label: "<b>x</b>", count: 2 }, { id: "b", label: "пусто", count: 0 }],
    copies: { backups: 2, legacy: true }
  });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /data-sd="a"(?! disabled)/);
  assert.match(html, /data-sd="b" disabled/);
  const blocked = OporaSelectiveDelete.render({ summary: [{ id: "a", label: "x", count: 1 }], copies: { backups: 0, legacy: false }, disabled: true });
  assert.match(blocked, /data-a="sddo" disabled/);
});
