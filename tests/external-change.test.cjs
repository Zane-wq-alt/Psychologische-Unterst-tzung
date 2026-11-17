"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OporaStorage = require("../src/core/storage.js");
const OporaErrors = require("../src/core/errors.js");

const defaults = {
  ci: [], ep: [], ev: [], chat: [], notes: [], cc: [], cp: [],
  p: { name: "", sens: [], trig: [], spoons: 12 },
  ui: { th: "auto", dm: ["en", "sens", "anx"], fs: 1 }
};

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key(index) { return Array.from(map.keys())[index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function twoTabs() {
  const storage = memoryStorage();
  const make = () => OporaStorage.create({ key: "opora_v2_data_v1", legacyKey: "opora_v2", defaults, storage });
  return { storage, a: make(), b: make() };
}

test("save is refused without writing when another tab changed the data", () => {
  const { storage, a, b } = twoTabs();
  const first = a.load();
  b.load();
  assert.equal(a.save(first.state).ok, true);

  const fromB = b.load().state;
  fromB.ci.push({ d: "2026-11-17", mood: 3, note: "written in tab B" });
  assert.equal(b.save(fromB).ok, true);
  const afterB = storage.getItem("opora_v2_data_v1");

  assert.equal(a.hasExternalChange(), true);
  first.state.ci.push({ d: "2026-11-17", mood: 1, note: "stale tab A" });
  const result = a.save(first.state);
  assert.equal(result.ok, false);
  assert.equal(result.error, "external-change");
  assert.equal(storage.getItem("opora_v2_data_v1"), afterB, "stored data is untouched");
  assert.equal(a.save(first.state).error, "external-change", "refusal is stable until reloaded");
});

test("reloading accepts the other tab's data and unlocks saving", () => {
  const { storage, a, b } = twoTabs();
  const stateA = a.load().state;
  a.save(stateA);
  b.load();
  const stateB = b.load().state;
  stateB.notes.push({ id: 1, tx: "from B" });
  b.save(stateB);

  assert.equal(a.save(stateA).error, "external-change");
  const reloaded = a.load();
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.notes.length, 1);
  assert.equal(a.hasExternalChange(), false);
  reloaded.state.notes.push({ id: 2, tx: "from A after reload" });
  assert.equal(a.save(reloaded.state).ok, true);
  assert.equal(JSON.parse(storage.getItem("opora_v2_data_v1")).notes.length, 2);
});

test("deliberate replaceState keeps a backup of the other tab's data and unlocks saving", () => {
  const { storage, a, b } = twoTabs();
  const stateA = a.load().state;
  a.save(stateA);
  const stateB = b.load().state;
  stateB.notes.push({ id: 1, tx: "other tab" });
  b.save(stateB);

  const otherRaw = storage.getItem("opora_v2_data_v1");
  const result = a.replaceState(stateA, "before-overwrite-external-change");
  assert.equal(result.ok, true);
  const backup = JSON.parse(storage.getItem(result.backupKey));
  assert.equal(backup.raw, otherRaw);
  assert.equal(a.hasExternalChange(), false);
  assert.equal(a.save(stateA).ok, true);
});

test("hasExternalChange is false for own writes, unknown state and unavailable storage", () => {
  const { a } = twoTabs();
  assert.equal(a.hasExternalChange(), false);
  const state = a.load().state;
  assert.equal(a.save(state).ok, true);
  assert.equal(a.hasExternalChange(), false);
  const broken = OporaStorage.create({ key: "k", defaults, storage: {
    getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
    removeItem() {}, key() { return null; }, length: 0 } });
  assert.equal(broken.hasExternalChange(), false);
});

test("error journal is local, bounded, de-noised and keeps no user records", () => {
  OporaErrors.clear();
  const entry = OporaErrors.report(new TypeError("boom"), "action:test");
  assert.equal(entry.name, "TypeError");
  assert.equal(OporaErrors.count(), 1);
  assert.equal(OporaErrors.report(new Error("ResizeObserver loop limit exceeded")), null);
  for (let i = 0; i < 40; i += 1) OporaErrors.report(new Error("e" + i));
  assert.equal(OporaErrors.count(), OporaErrors.MAX_ENTRIES);
  const long = OporaErrors.report(new Error("x".repeat(5000)));
  assert.ok(long.message.length <= 301);
  assert.match(OporaErrors.exportText(), /Error: x/);
  OporaErrors.clear();
  assert.equal(OporaErrors.count(), 0);
});

test("guard reports exceptions instead of throwing", () => {
  OporaErrors.clear();
  const wrapped = OporaErrors.guard(() => { throw new Error("guarded"); }, "ctx");
  assert.doesNotThrow(() => wrapped());
  assert.equal(OporaErrors.list()[0].context, "ctx");
  OporaErrors.clear();
});
