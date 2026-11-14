"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const OporaStorage = require("../src/core/storage.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
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
    removeItem(key) { map.delete(key); },
    dump() { return map; }
  };
}

test("legacy migration backs up exact source and preserves old records and unknown fields", () => {
  const raw = fixture("legacy-full.json").trim();
  const storage = memoryStorage({ opora_v2: raw });
  const db = OporaStorage.create({ key: "opora_v2", defaults, storage });
  const result = db.load();

  assert.equal(result.ok, true);
  assert.equal(result.status, "migrated");
  assert.equal(result.state.schemaVersion, 1);
  assert.deepEqual(result.state.chat, [{ r: "u", c: "archived sample" }]);
  assert.deepEqual(result.state.customTopLevel, { futureField: 42 });
  assert.deepEqual(result.state.p.customProfileField, { keep: true });
  assert.equal(storage.getItem(result.backupKey) !== null, true);
  assert.equal(JSON.parse(storage.getItem(result.backupKey)).raw, raw);
});

test("migration is idempotent and does not create another backup", () => {
  const storage = memoryStorage({ opora_v2: fixture("legacy-partial.json").trim() });
  const db = OporaStorage.create({ defaults, storage });
  const first = db.load();
  const backupCount = db.listBackups().length;
  const second = db.load();

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.status, "ready");
  assert.equal(db.listBackups().length, backupCount);
  assert.deepEqual(second.state.unknownFutureData, ["must", "survive"]);
  assert.deepEqual(second.state.ui.dm, ["en", "sens", "anx"]);
});

test("corrupt JSON is never overwritten during startup", () => {
  const raw = fixture("malformed.txt");
  const storage = memoryStorage({ opora_v2: raw });
  const db = OporaStorage.create({ defaults, storage });
  const result = db.load();

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.status, "corrupt-data");
  assert.equal(storage.getItem("opora_v2"), raw);
  assert.equal(db.listBackups().length, 0);
});

test("wrong collection types block migration without discarding source data", () => {
  const raw = JSON.stringify({ ci: { not: "an array" }, chat: [{ c: "keep" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const result = OporaStorage.create({ defaults, storage }).load();

  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid-data");
  assert.equal(storage.getItem("opora_v2"), raw);
});

test("invalid import leaves current data unchanged", () => {
  const raw = JSON.stringify({ ci: [{ d: "kept" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const result = OporaStorage.create({ defaults, storage }).importText("{broken");

  assert.equal(result.ok, false);
  assert.equal(storage.getItem("opora_v2"), raw);
  assert.equal(storage.length, 1);
});

test("valid import backs up existing value before replacing it", () => {
  const raw = JSON.stringify({ ci: [{ d: "old" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const db = OporaStorage.create({ defaults, storage });
  const result = db.importText(JSON.stringify({ ci: [{ d: "new" }], extra: "kept" }));

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(storage.getItem(result.backupKey)).raw, raw);
  assert.deepEqual(JSON.parse(storage.getItem("opora_v2")).ci, [{ d: "new" }]);
  assert.equal(JSON.parse(storage.getItem("opora_v2")).extra, "kept");
});

test("failed backup prevents replacement", () => {
  const raw = JSON.stringify({ ci: [{ d: "old" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const originalSet = storage.setItem;
  storage.setItem = function (key, value) {
    if (String(key).startsWith("opora_v2_backup_")) throw new Error("quota");
    originalSet.call(storage, key, value);
  };
  const result = OporaStorage.create({ defaults, storage }).importText(JSON.stringify({ ci: [] }));

  assert.equal(result.ok, false);
  assert.equal(result.error, "backup-failed");
  assert.equal(storage.getItem("opora_v2"), raw);
});

test("write failure rolls back the original raw value", () => {
  const raw = JSON.stringify({ ci: [{ d: "old" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const originalSet = storage.setItem;
  let failOnce = true;
  storage.setItem = function (key, value) {
    if (key === "opora_v2" && failOnce) {
      failOnce = false;
      throw new Error("quota");
    }
    originalSet.call(storage, key, value);
  };
  const result = OporaStorage.create({ defaults, storage }).importText(JSON.stringify({ ci: [{ d: "new" }] }));

  assert.equal(result.ok, false);
  assert.equal(result.error, "write-failed");
  assert.equal(storage.getItem("opora_v2"), raw);
});

test("backup restore first backs up current state and restores exact raw text", () => {
  const original = fixture("legacy-full.json").trim();
  const storage = memoryStorage({ opora_v2: original });
  const db = OporaStorage.create({ defaults, storage });
  const migrated = db.load();
  const replacement = db.importText(JSON.stringify({ ci: [{ d: "new" }] }));
  assert.equal(replacement.ok, true);

  const restored = db.restoreBackup(migrated.backupKey);
  assert.equal(restored.ok, true);
  assert.equal(storage.getItem("opora_v2"), original);
  assert.equal(db.listBackups().length, 3);
});

test("unsupported future schema is left untouched", () => {
  const raw = JSON.stringify({ schemaVersion: 9, ci: [{ d: "future" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const result = OporaStorage.create({ defaults, storage }).load();

  assert.equal(result.ok, false);
  assert.equal(result.status, "unsupported-version");
  assert.equal(storage.getItem("opora_v2"), raw);
});

test("unavailable browser storage is reported without crashing", () => {
  const db = OporaStorage.create({ defaults });
  const result = db.load();

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.status, "read-failed");
  assert.equal(db.raw(), null);
  assert.deepEqual(db.listBackups(), []);
});


test("regular save preserves the previous value if storage write fails", () => {
  const raw = JSON.stringify({ ci: [{ d: "previous" }] });
  const storage = memoryStorage({ opora_v2: raw });
  const originalSet = storage.setItem;
  let failOnce = true;
  storage.setItem = function (key, value) {
    if (key === "opora_v2" && failOnce) {
      failOnce = false;
      throw new Error("quota");
    }
    originalSet.call(storage, key, value);
  };
  const db = OporaStorage.create({ defaults, storage });
  const result = db.save({ ci: [{ d: "new" }] });

  assert.equal(result.ok, false);
  assert.equal(result.error, "write-failed");
  assert.equal(storage.getItem("opora_v2"), raw);
});

test("regular save does not create a backup on every autosave", () => {
  const storage = memoryStorage({ opora_v2: JSON.stringify({ ci: [{ d: "old" }] }) });
  const db = OporaStorage.create({ defaults, storage });
  const result = db.save({ ci: [{ d: "new" }] });

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(storage.getItem("opora_v2")).ci[0].d, "new");
  assert.equal(db.listBackups().length, 0);
});
