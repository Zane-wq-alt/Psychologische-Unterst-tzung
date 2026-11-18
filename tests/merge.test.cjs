"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OporaMerge = require("../src/storage/merge.js");

const empty = () => ({
  schemaVersion: 1,
  ci: [], ep: [], ev: [], chat: [], notes: [], cc: [], cp: [], hlp: {}, md: {}, plan: {},
  sp: { d: "", total: 12, tasks: [], fav: [], hist: {}, log: {} },
  rt: { morning: ["Вода"], evening: ["Ужин"], done: {} },
  st: { task: "", steps: [] },
  ui: { fs: 1, th: "auto", fav: [] },
  p: { name: "", sens: [], trig: [], spoons: 12 }
});
const D = empty();
const clone = (v) => JSON.parse(JSON.stringify(v));
const run = (base, local, remote) => OporaMerge.merge({ base, local, remote, defaults: D });
const canon = (state) => {
  const copy = clone(state);
  for (const key of OporaMerge.KEYED) copy[key] = (copy[key] || []).map((x) => JSON.stringify(x)).sort();
  delete copy.cloudRevision; delete copy.cloudBase; delete copy.cloudConsent;
  const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
  return JSON.stringify(sorted(copy));
};

test("a fresh device adopts the cloud copy instead of overwriting it with defaults", () => {
  const remote = empty();
  remote.p.name = "Аня"; remote.p.spoons = 8; remote.ui.th = "dark"; remote.ci.push({ d: "2026-11-17", mood: 2 });
  const result = run(null, empty(), remote);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.p, remote.p);
  assert.equal(result.state.ui.th, "dark");
  assert.equal(result.state.ci.length, 1);
  assert.deepEqual(result.stats.conflicts, []);
});

test("records added on both devices are united, local order first", () => {
  const base = OporaMerge.fingerprint(empty());
  const local = empty(); local.ci.push({ d: "2026-11-17", note: "A" });
  const remote = empty(); remote.ci.push({ d: "2026-11-17", note: "B" });
  const result = run(base, local, remote);
  assert.deepEqual(result.state.ci.map((x) => x.note), ["A", "B"]);
  assert.equal(result.changedLocal, true);
  assert.equal(result.changedRemote, true);
});

test("deletion propagates only when the record was in the base and unchanged on the other side", () => {
  const start = empty(); start.notes.push({ t: "keep" }, { t: "remove" });
  const base = OporaMerge.fingerprint(start);

  const local = clone(start); local.notes = [{ t: "keep" }];          // удалили здесь
  const remote = clone(start);                                          // в облаке без изменений
  assert.deepEqual(run(base, local, remote).state.notes, [{ t: "keep" }]);

  const local2 = clone(start);                                          // здесь без изменений
  const remote2 = clone(start); remote2.notes = [{ t: "keep" }];       // удалили в облаке
  assert.deepEqual(run(base, local2, remote2).state.notes, [{ t: "keep" }]);

  // без базы запись, которой нет на одной стороне, не удаляется
  assert.equal(run(null, local, remote).state.notes.length, 2);
});

test("an edit on one device and a new record on the other both survive; the old version disappears", () => {
  const start = empty(); start.ci.push({ d: "2026-11-16", mood: 3, note: "old" });
  const base = OporaMerge.fingerprint(start);
  const local = clone(start); local.ci[0].note = "edited";
  const remote = clone(start); remote.ci.push({ d: "2026-11-17", mood: 1 });
  const result = run(base, local, remote);
  assert.deepEqual(result.state.ci.map((x) => x.note || x.mood), ["edited", 1]);
});

test("identical duplicate records are counted, not collapsed", () => {
  const start = empty(); start.cp = ["фраза", "фраза"];
  const base = OporaMerge.fingerprint(start);
  const remote = clone(start); remote.cp = ["фраза", "фраза", "фраза"];
  assert.equal(run(base, clone(start), remote).state.cp.length, 3);
  const local = clone(start); local.cp = ["фраза"];
  assert.equal(run(base, local, clone(start)).state.cp.length, 1);
});

test("leaves: untouched side yields, both-edited keeps local and reports it, edit beats delete", () => {
  const start = empty(); start.p.name = "Аня"; start.hlp = { вода: 1 }; start.md = { "2026-11-16": [0] };
  const base = OporaMerge.fingerprint(start);

  const local = clone(start); local.p.name = "Анна"; local.hlp.вода = 5;
  const remote = clone(start); remote.p.spoons = 7; remote.hlp.вода = 9; delete remote.md["2026-11-16"];
  const result = run(base, local, remote);
  assert.equal(result.state.p.name, "Анна");
  assert.equal(result.state.p.spoons, 7, "remote-only change is taken");
  assert.equal(result.state.hlp.вода, 5, "both edited: local wins");
  assert.deepEqual(result.state.md, {}, "remote deletion of an unchanged local value is taken");
  assert.deepEqual(result.stats.conflicts.map((c) => c.kind), ["both-edited"]);

  const local2 = clone(start); local2.md = {};
  const remote2 = clone(start); remote2.md["2026-11-16"] = [0, 1];
  const kept = run(base, local2, remote2);
  assert.deepEqual(kept.state.md, { "2026-11-16": [0, 1] });
  assert.equal(kept.stats.conflicts[0].kind, "edit-vs-delete");
});

test("cloud bookkeeping fields stay local and never count as changes", () => {
  const local = empty(); local.cloudRevision = 4; local.cloudBase = { x: "y" };
  const remote = empty(); remote.cloudRevision = 9;
  const result = run(OporaMerge.fingerprint(local), local, remote);
  assert.equal(result.state.cloudRevision, 4);
  assert.equal(result.changedLocal, false);
  assert.equal(result.changedRemote, false);
  assert.equal(Object.keys(OporaMerge.fingerprint(local)).some((k) => /cloud/.test(k)), false);
});

test("merging is idempotent: after a merge with its own fingerprint nothing changes", () => {
  const local = empty(); local.ci.push({ a: 1 }); local.p.name = "x";
  const remote = empty(); remote.ci.push({ a: 2 }); remote.hlp = { k: 1 };
  const first = run(null, local, remote);
  const again = run(OporaMerge.fingerprint(first.state), first.state, first.state);
  assert.equal(again.changedLocal, false);
  assert.equal(again.changedRemote, false);
});

test("invalid input is rejected without throwing", () => {
  assert.equal(OporaMerge.merge({ local: null, remote: {} }).ok, false);
  assert.equal(OporaMerge.merge({ local: {}, remote: [] }).ok, false);
});

// --- Моделирование: два устройства и «сервер», случайные правки, потом сходимость и отсутствие потерь ---
function prng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

for (const seed of [1, 2, 3, 7, 42, 99, 2026]) {
  test("two devices with random adds/deletes/edits converge without losing surviving records (seed " + seed + ")", () => {
    const rnd = prng(seed);
    const server = { state: null };
    const devices = ["A", "B"].map((name) => ({ name, state: empty(), base: null }));
    const expected = new Set();
    let uid = 0;

    const sync = (dev) => {
      const remote = server.state ? clone(server.state) : empty();
      const result = OporaMerge.merge({ base: dev.base, local: dev.state, remote, defaults: D });
      assert.equal(result.ok, true);
      dev.state = result.state;
      server.state = clone(dev.state);
      dev.base = OporaMerge.fingerprint(dev.state);
    };

    for (let step = 0; step < 120; step += 1) {
      const dev = devices[Math.floor(rnd() * 2)];
      const roll = rnd();
      if (roll < 0.45) {
        const coll = ["ci", "ep", "notes", "cp"][Math.floor(rnd() * 4)];
        const id = "r" + (uid += 1);
        dev.state[coll].push(coll === "cp" ? id : { id, d: "2026-11-17" });
        expected.add(id);
      } else if (roll < 0.6) {
        const coll = ["ci", "ep", "notes", "cp"][Math.floor(rnd() * 4)];
        if (dev.state[coll].length) {
          const index = Math.floor(rnd() * dev.state[coll].length);
          const item = dev.state[coll].splice(index, 1)[0];
          expected.delete(typeof item === "string" ? item : item.id);
        }
      } else if (roll < 0.7) {
        dev.state.p[dev.name === "A" ? "goal" : "media"] = "v" + step; // разные поля на разных устройствах
      } else {
        sync(dev);
      }
    }
    for (let i = 0; i < 3; i += 1) devices.forEach(sync);

    assert.equal(canon(devices[0].state), canon(devices[1].state), "devices converge");
    const survivors = new Set();
    for (const coll of ["ci", "ep", "notes", "cp"]) {
      for (const item of devices[0].state[coll]) survivors.add(typeof item === "string" ? item : item.id);
    }
    assert.deepEqual([...survivors].sort(), [...expected].sort(), "exactly the records added and not deleted remain");
    assert.equal(devices[0].state.p.goal, devices[1].state.p.goal);
    assert.equal(devices[0].state.p.media, devices[1].state.p.media);
  });
}
