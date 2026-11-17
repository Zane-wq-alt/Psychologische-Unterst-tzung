"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const CloudSync = require("../src/storage/cloud-sync.js");
const Privacy = require("../src/features/privacy.js");

test("cloud sync is local-only by default and makes no transport calls", async () => {
  let calls = 0;
  const sync = CloudSync.create({
    transport: {
      pull: async () => { calls++; return { revision: 1, snapshot: {} }; },
      push: async () => { calls++; return { ok: true, revision: 2 }; }
    }
  });

  assert.deepEqual(sync.status(), { enabled: false, configured: true, mode: "local-only" });
  const result = await sync.sync({}, 1);
  assert.equal(result.error, "sync-disabled");
  assert.equal(calls, 0);
});

test("cloud sync requires explicit consent and a configured backend", () => {
  const noBackend = CloudSync.create();
  assert.equal(noBackend.enable(true).error, "backend-not-configured");
  assert.equal(noBackend.status().enabled, false);

  const configured = CloudSync.create({ transport: { pull: async () => ({}), push: async () => ({ ok: true }) } });
  assert.equal(configured.enable(false).error, "explicit-consent-required");
  assert.equal(configured.status().enabled, false);
  assert.equal(configured.enable(true).ok, true);
});

test("revision mismatch returns a conflict and never overwrites remote data", async () => {
  let writes = 0;
  const sync = CloudSync.create({
    transport: {
      pull: async () => ({ revision: "remote-v2", snapshot: { marker: "remote" } }),
      push: async () => { writes++; return { ok: true, revision: "remote-v3" }; }
    }
  });
  sync.enable(true);

  const result = await sync.sync({ marker: "local" }, "local-v1");
  assert.equal(result.conflict, true);
  assert.equal(result.error, "revision-conflict");
  assert.deepEqual(result.remoteSnapshot, { marker: "remote" });
  assert.equal(writes, 0);
});

test("matching revisions use conditional write and can be disabled", async () => {
  let request;
  const sync = CloudSync.create({
    transport: {
      pull: async () => ({ revision: "v1" }),
      push: async (payload) => { request = payload; return { ok: true, revision: "v2" }; }
    }
  });
  sync.enable(true);
  const result = await sync.sync({ safe: true }, "v1");

  assert.equal(result.ok, true);
  assert.equal(result.revision, "v2");
  assert.deepEqual(request, { snapshot: { safe: true }, ifMatch: "v1" });
  sync.disable();
  assert.equal(sync.status().enabled, false);
});

test("privacy center describes current local-only state without exposing record contents", () => {
  const html = Privacy.render({
    cloud: { enabled: false, configured: false },
    data: { ci: [{ privateNote: "do not render this" }], chat: [{ c: "secret" }] }
  });

  assert.match(html, /Центр приватности/);
  assert.match(html, /Генеративный ИИ и передача записей ИИ-сервисам: отключены/);
  assert.match(html, /Облачная синхронизация: выключена/);
  assert.match(html, /ci: 1/);
  assert.doesNotMatch(html, /do not render this|secret/);
});


test("cloud compare-and-swap conflict is surfaced without treating it as success", async () => {
  const sync = CloudSync.create({
    transport: {
      pull: async () => ({ revision: "v1" }),
      push: async () => ({ ok: false, conflict: true, revision: "v2" })
    }
  });
  sync.enable(true);
  const result = await sync.sync({ marker: "local" }, "v1");

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error, "revision-conflict");
  assert.equal(result.remoteRevision, "v2");
});

test("cloud sync rejects remote responses without a revision", async () => {
  let writes = 0;
  const sync = CloudSync.create({ transport: { pull: async () => ({ snapshot: {} }), push: async () => { writes++; return { ok: true, revision: "v2" }; } } });
  sync.enable(true);
  const result = await sync.sync({}, null);
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid-remote-response");
  assert.equal(writes, 0);
});

test("cloud sync rejects invalid local snapshots before writing", async () => {
  let writes = 0;
  const sync = CloudSync.create({ transport: { pull: async () => ({ revision: "v1" }), push: async () => { writes++; return { ok: true, revision: "v2" }; } } });
  sync.enable(true);
  const result = await sync.sync(["not", "a", "state-object"], "v1");
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid-local-snapshot");
  assert.equal(writes, 0);
});

test("cloud sync does not report success when backend omits its new revision", async () => {
  const sync = CloudSync.create({ transport: { pull: async () => ({ revision: "v1" }), push: async () => ({ ok: true }) } });
  sync.enable(true);
  const result = await sync.sync({ marker: "local" }, "v1");
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid-remote-response");
});

test("remote deletion requires enabled sync and explicit transport support", async () => {
  let deleted = 0;
  const sync = CloudSync.create({ transport: { pull: async () => ({ revision: "v1" }), push: async () => ({ ok: true, revision: "v2" }), deleteRemote: async () => { deleted++; return { ok: true }; } } });
  assert.equal((await sync.deleteRemote()).error, "sync-disabled");
  assert.equal(deleted, 0);
  sync.enable(true);
  assert.equal((await sync.deleteRemote()).ok, true);
  assert.equal(deleted, 1);
});

test("first sync bootstraps an empty remote with the local snapshot after consent", async () => {
  let pushed;
  const sync = CloudSync.create({ transport: {
    pull: async () => ({ revision: 0, snapshot: {} }),
    push: async (payload) => { pushed = payload; return { ok: true, revision: 1 }; }
  }});
  sync.enable(true);
  const result = await sync.sync({ ci: [{ d: "local" }] });
  assert.equal(result.ok, true);
  assert.equal(result.bootstrapped, true);
  assert.equal(result.revision, 1);
  assert.deepEqual(pushed, { snapshot: { ci: [{ d: "local" }] }, ifMatch: 0 });
  assert.equal(sync.status().lastRevision, 1);
});

test("first sync never overwrites an existing remote snapshot without a known revision", async () => {
  let writes = 0;
  const sync = CloudSync.create({ transport: {
    pull: async () => ({ revision: 7, snapshot: { remote: true } }),
    push: async () => { writes++; return { ok: true, revision: 8 }; }
  }});
  sync.enable(true);
  const result = await sync.sync({ local: true });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error, "revision-conflict");
  assert.deepEqual(result.remoteSnapshot, { remote: true });
  assert.equal(writes, 0);
});

test("an empty local profile can discover remote data without replacing either side", async () => {
  let writes = 0;
  const sync = CloudSync.create({ transport: {
    pull: async () => ({ revision: 3, snapshot: { remote: true } }),
    push: async () => { writes++; return { ok: true, revision: 4 }; }
  }});
  sync.enable(true);
  const result = await sync.sync({});
  assert.equal(result.ok, false);
  assert.equal(result.error, "remote-available");
  assert.deepEqual(result.remoteSnapshot, { remote: true });
  assert.equal(writes, 0);
});

test("empty local and remote profiles do not create unnecessary cloud writes", async () => {
  let writes = 0;
  const sync = CloudSync.create({ transport: {
    pull: async () => ({ revision: 0, snapshot: {} }),
    push: async () => { writes++; return { ok: true, revision: 1 }; }
  }});
  sync.enable(true);
  const result = await sync.sync({});
  assert.deepEqual(result, { ok: true, unchanged: true, revision: 0 });
  assert.equal(writes, 0);
});

test("privacy center reports blocked local storage and backup count accurately", () => {
  const html = Privacy.render({
    cloud: { enabled: false, configured: false },
    local: { available: false, blocked: true },
    backups: [{ key: "one" }, { key: "two" }],
    data: {}
  });
  assert.match(html, /защищённый режим/);
  assert.match(html, /Локальные резервные копии в этом браузере: 2/);
  assert.match(html, /Облачная синхронизация: выключена/);
});
