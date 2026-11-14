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
