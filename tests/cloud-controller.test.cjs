"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const CloudSync = require("../src/storage/cloud-sync.js");
const Controller = require("../src/storage/cloud-controller.js");

global.OporaCloudSync = CloudSync;

function fakeAuth(signedIn) {
  let session = signedIn ? { user: { email: "person@example.com" } } : null;
  return {
    getSession: () => session,
    sendMagicLink: async () => ({ ok: true }),
    signOut: async () => { session = null; return { ok: true }; },
    getAccessToken: async () => "token"
  };
}

test("cloud controller stays disabled and unconfigured without backend settings", () => {
  const controller = Controller.create({ config: {}, auth: fakeAuth(false), transport: { configured: () => false, pull: async () => ({}), push: async () => ({}) } });
  assert.deepEqual(controller.status(), {
    configured: false, enabled: false, signedIn: false, email: null, revision: null,
    e2e: "off", recoveryKeyPending: false, pendingRemote: false
  });
  assert.match(controller.render(), /Backend не настроен/);
});

test("cloud controller requires sign-in and a separate consent before enabling", () => {
  const transport = { configured: () => true, pull: async () => ({ revision: 0, snapshot: {} }), push: async () => ({ ok: true, revision: 1 }) };
  const signedOut = Controller.create({ config: {}, auth: fakeAuth(false), transport });
  assert.equal(signedOut.enable(true).error, "auth-required");
  const signedIn = Controller.create({ config: {}, auth: fakeAuth(true), transport });
  assert.equal(signedIn.enable(false).error, "explicit-consent-required");
  assert.equal(signedIn.enable(true).ok, true);
  assert.match(signedIn.render(), /Синхронизировать сейчас/);
  assert.match(signedIn.render(), /end-to-end encrypted/);
});

test("cloud controller exposes a remote conflict for explicit restore, never silent replacement", async () => {
  const transport = {
    configured: () => true,
    pull: async () => ({ revision: 5, snapshot: { remote: true } }),
    push: async () => { throw new Error("must not push on unknown revision"); }
  };
  const controller = Controller.create({ config: {}, auth: fakeAuth(true), transport });
  controller.enable(true);
  const result = await controller.sync({ local: true }, null);
  assert.equal(result.error, "revision-conflict");
  assert.deepEqual(controller.pendingRemote(), { snapshot: { remote: true }, revision: 5 });
  assert.match(controller.render(), /Восстановить удалённую копию поверх локальной/);
});

test("deleting remote data requires enabled sync and does not sign out", async () => {
  let deletes = 0;
  const auth = fakeAuth(true);
  const transport = {
    configured: () => true, pull: async () => ({ revision: 0, snapshot: {} }),
    push: async () => ({ ok: true, revision: 1 }),
    deleteRemote: async () => { deletes++; return { ok: true }; }
  };
  const controller = Controller.create({ config: {}, auth, transport });
  assert.equal((await controller.deleteRemote()).error, "sync-disabled");
  controller.enable(true);
  assert.equal((await controller.deleteRemote()).ok, true);
  assert.equal(deletes, 1);
  assert.equal(controller.status().signedIn, true);
});
