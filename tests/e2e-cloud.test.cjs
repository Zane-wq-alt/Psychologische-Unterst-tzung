"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Crypto = require("../src/storage/e2e-crypto.js");
const E2ETransport = require("../src/storage/e2e-transport.js");
const CloudSync = require("../src/storage/cloud-sync.js");
const Controller = require("../src/storage/cloud-controller.js");

global.OporaE2ECrypto = Crypto;
global.OporaCloudSync = CloudSync;
global.OporaE2ETransport = E2ETransport;

const FAST = { iterations: 100000 };
const PASS = "correct horse battery";

// Имитация сервера: одна строка, сравнение ревизий, ничего не знает о содержимом.
function fakeServer() {
  const row = { revision: 0, payload: null };
  const seen = [];
  return {
    row, seen,
    transport: {
      configured: () => true,
      pull: async () => row.revision === 0 ? { revision: 0, snapshot: {} } : { revision: row.revision, snapshot: JSON.parse(JSON.stringify(row.payload)) },
      push: async ({ snapshot, ifMatch }) => {
        seen.push(JSON.stringify(snapshot));
        if (ifMatch !== row.revision) return { ok: false, conflict: true, revision: row.revision, snapshot: row.payload };
        row.revision += 1; row.payload = JSON.parse(JSON.stringify(snapshot));
        return { ok: true, conflict: false, revision: row.revision, snapshot };
      },
      deleteRemote: async () => { row.revision = 0; row.payload = null; return { ok: true }; }
    }
  };
}

const secret = { ci: [{ d: "2026-11-17", mood: 2, note: "очень личная запись" }], p: { name: "Аня" } };

test("round trip: only ciphertext reaches the server; passphrase and recovery key both unlock", async () => {
  const vault = await Crypto.createVault(PASS, FAST);
  const envelope = await Crypto.encryptSnapshot(vault.dek, vault.wraps, secret);
  const wire = JSON.stringify(envelope);
  assert.doesNotMatch(wire, /личная|Аня|mood|"ci"/); // не искать голое "ci": оно случайно встречается в base64
  assert.equal(envelope.format, "opora-e2e");

  const viaPass = await Crypto.unlockWithPassphrase(envelope.wraps, PASS);
  assert.deepEqual(await Crypto.decryptSnapshot(viaPass, envelope), secret);
  const viaRecovery = await Crypto.unlockWithRecovery(envelope.wraps, vault.recoveryKey.toLowerCase().replace(/-/g, " "));
  assert.deepEqual(await Crypto.decryptSnapshot(viaRecovery, envelope), secret);
});

test("wrong passphrase, wrong recovery key, tampering and short passphrases are rejected", async () => {
  const vault = await Crypto.createVault(PASS, FAST);
  const envelope = await Crypto.encryptSnapshot(vault.dek, vault.wraps, secret);
  await assert.rejects(Crypto.unlockWithPassphrase(envelope.wraps, "another long phrase"), { code: "e2e-wrong-key" });
  await assert.rejects(Crypto.unlockWithRecovery(envelope.wraps, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA"), { code: "e2e-wrong-key" });
  await assert.rejects(Crypto.unlockWithRecovery(envelope.wraps, "short"), { code: "e2e-recovery-key-invalid" });
  await assert.rejects(Crypto.createVault("короткая", FAST), { code: "e2e-passphrase-too-short" });

  const tampered = JSON.parse(JSON.stringify(envelope));
  const bytes = Buffer.from(tampered.ct, "base64"); bytes[0] ^= 1; tampered.ct = bytes.toString("base64");
  await assert.rejects(Crypto.decryptSnapshot(vault.dek, tampered), { code: "e2e-wrong-key" });
  await assert.rejects(Crypto.decryptSnapshot(vault.dek, { format: "plain" }), { code: "e2e-not-encrypted" });
  await assert.rejects(Crypto.decryptSnapshot(vault.dek, { ...envelope, v: 2 }), { code: "e2e-unsupported-version" });

  const weak = JSON.parse(JSON.stringify(envelope.wraps));
  weak.find((w) => w.type === "passphrase").iter = 10;
  await assert.rejects(Crypto.unlockWithPassphrase(weak, PASS), { code: "e2e-kdf-out-of-range" });
});

test("each encryption uses a fresh IV, and swapping wraps between types does not unlock", async () => {
  const vault = await Crypto.createVault(PASS, FAST);
  const a = await Crypto.encryptSnapshot(vault.dek, vault.wraps, secret);
  const b = await Crypto.encryptSnapshot(vault.dek, vault.wraps, secret);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
  const swapped = vault.wraps.map((w) => ({ ...w, type: w.type === "passphrase" ? "recovery" : "passphrase" }));
  await assert.rejects(Crypto.unlockWithRecovery(swapped, vault.recoveryKey));
});

test("changing the passphrase re-wraps the key: old phrase stops working, recovery key and data keep working", async () => {
  const vault = await Crypto.createVault(PASS, FAST);
  const wraps = await Crypto.rewrapPassphrase(vault.dek, vault.wraps, "a completely new phrase", FAST);
  const envelope = await Crypto.encryptSnapshot(vault.dek, wraps, secret);
  await assert.rejects(Crypto.unlockWithPassphrase(envelope.wraps, PASS), { code: "e2e-wrong-key" });
  const dek = await Crypto.unlockWithPassphrase(envelope.wraps, "a completely new phrase");
  assert.deepEqual(await Crypto.decryptSnapshot(dek, envelope), secret);
  const viaRecovery = await Crypto.unlockWithRecovery(envelope.wraps, vault.recoveryKey);
  assert.deepEqual(await Crypto.decryptSnapshot(viaRecovery, envelope), secret);
});

test("transport: setup, sync through plain CloudSync, second device unlocks, server never sees plaintext", async () => {
  const server = fakeServer();
  const deviceA = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  const created = await deviceA.e2e.setup(PASS);
  assert.match(created.recoveryKey, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/);

  const syncA = CloudSync.create({ transport: deviceA });
  syncA.enable(true);
  const first = await syncA.sync(secret, null);
  assert.equal(first.ok, true);
  assert.equal(first.revision, 1);
  assert.ok(server.seen.every((wire) => !/личная|Аня/.test(wire)));

  const deviceB = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  assert.equal(deviceB.e2e.state(), "locked");
  await assert.rejects(deviceB.pull(), { code: "e2e-locked" });
  await assert.rejects(deviceB.e2e.unlock("wrong passphrase!!"), { code: "e2e-wrong-key" });
  await deviceB.e2e.unlock(PASS);
  const syncB = CloudSync.create({ transport: deviceB });
  syncB.enable(true);
  const conflict = await syncB.sync({ ci: [] }, null);
  assert.equal(conflict.error, "revision-conflict");
  assert.deepEqual(conflict.remoteSnapshot, secret, "remote copy is decrypted for the explicit restore step");
  const second = await syncB.sync({ ...secret, ci: [] }, 1);
  assert.equal(second.ok, true);
});

test("transport refuses plaintext remote data, setup over existing data, and push while locked", async () => {
  const server = fakeServer();
  server.row.revision = 3; server.row.payload = { ci: [{ note: "plain" }] };
  const device = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  await assert.rejects(device.e2e.setup(PASS), { code: "e2e-not-encrypted" });
  await assert.rejects(device.e2e.unlock(PASS), { code: "e2e-not-encrypted" });
  await assert.rejects(device.push({ snapshot: secret, ifMatch: 3 }), { code: "e2e-locked" });
  assert.equal(server.seen.length, 0, "nothing was sent");

  const clean = fakeServer();
  const d1 = E2ETransport.create({ transport: clean.transport, cryptoOptions: FAST });
  await d1.e2e.setup(PASS);
  await d1.push({ snapshot: secret, ifMatch: 0 });
  const d2 = E2ETransport.create({ transport: clean.transport, cryptoOptions: FAST });
  await assert.rejects(d2.e2e.setup("another long phrase"), { code: "e2e-already-initialized" });
  assert.equal(d1.e2e.lock().ok, true);
  assert.equal(d1.e2e.state(), "locked");
});

test("conflict response from a foreign key reports no content instead of failing", async () => {
  const server = fakeServer();
  const other = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  await other.e2e.setup("someone else entirely");
  await other.push({ snapshot: secret, ifMatch: 0 });
  const mine = E2ETransport.create({ transport: { ...server.transport, pull: async () => ({ revision: 0, snapshot: {} }) }, cryptoOptions: FAST });
  await mine.e2e.setup(PASS);
  const result = await mine.push({ snapshot: { ci: [] }, ifMatch: 0 });
  assert.equal(result.conflict, true);
  assert.equal(result.snapshot, null);
});

test("passphrase change reaches the server on the next push and the new phrase unlocks a fresh device", async () => {
  const server = fakeServer();
  const a = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  await a.e2e.setup(PASS);
  await a.push({ snapshot: secret, ifMatch: 0 });
  await a.e2e.changePassphrase("brand new passphrase");
  await a.push({ snapshot: secret, ifMatch: 1 });
  const b = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  await assert.rejects(b.e2e.unlock(PASS), { code: "e2e-wrong-key" });
  await b.e2e.unlock("brand new passphrase");
  assert.deepEqual((await b.pull()).snapshot, secret);
});

function fakeAuth() {
  const session = { user: { email: "person@example.com" } };
  return { getSession: () => session, sendMagicLink: async () => ({ ok: true }), signOut: async () => ({ ok: true }), getAccessToken: async () => "t" };
}

test("controller: enabling needs an unlocked vault and a confirmed recovery key; recovery key is shown once", async () => {
  const server = fakeServer();
  const transport = E2ETransport.create({ transport: server.transport, cryptoOptions: FAST });
  const controller = Controller.create({ config: {}, auth: fakeAuth(), transport });

  assert.equal(controller.status().e2e, "locked");
  assert.equal(controller.enable(true).error, "e2e-locked");
  assert.match(controller.render(), /Парольная фраза/);
  assert.doesNotMatch(controller.render(), /Синхронизировать сейчас/);

  assert.equal((await controller.e2eStart(PASS, "different")).error, "e2e-passphrase-mismatch");
  assert.equal((await controller.e2eStart("short", "short")).error, "e2e-passphrase-too-short");
  const started = await controller.e2eStart(PASS, PASS);
  assert.deepEqual(started, { ok: true, created: true });
  assert.equal(controller.status().recoveryKeyPending, true);
  assert.match(controller.render(), new RegExp(controller.recoveryKeyOnce()));
  assert.equal(controller.enable(true).error, "e2e-recovery-key-not-confirmed");

  controller.confirmRecoveryKey();
  assert.equal(controller.recoveryKeyOnce(), null);
  assert.doesNotMatch(controller.render(), /Ключ восстановления<\/b>/);
  assert.equal(controller.enable(true).ok, true);
  const synced = await controller.sync(secret, null);
  assert.equal(synced.ok, true);
  assert.match(controller.render(), /Синхронизировать сейчас/);
  assert.match(controller.render(), /Сменить парольную фразу/);

  controller.lockE2E();
  assert.equal(controller.status().e2e, "locked");
  assert.equal(controller.status().enabled, false);
  const again = await controller.e2eStart("wrong passphrase!!", "");
  assert.equal(again.error, "e2e-wrong-key");
  assert.deepEqual(await controller.e2eStart(PASS, ""), { ok: true, created: false });
});

test("controller: recovery key unlocks, then the passphrase can be replaced", async () => {
  const server = fakeServer();
  const first = Controller.create({ config: {}, auth: fakeAuth(), transport: E2ETransport.create({ transport: server.transport, cryptoOptions: FAST }) });
  await first.e2eStart(PASS, PASS);
  const key = first.recoveryKeyOnce();
  first.confirmRecoveryKey();
  first.enable(true);
  await first.sync(secret, null);

  const second = Controller.create({ config: {}, auth: fakeAuth(), transport: E2ETransport.create({ transport: server.transport, cryptoOptions: FAST }) });
  assert.equal((await second.e2eRecover("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA")).error, "e2e-wrong-key");
  assert.equal((await second.e2eRecover(key)).ok, true);
  assert.equal((await second.e2eChangePassphrase("new phrase for me", "typo phrase")).error, "e2e-passphrase-mismatch");
  assert.equal((await second.e2eChangePassphrase("new phrase for me", "new phrase for me")).ok, true);
  second.enable(true);
  const pushed = await second.sync(secret, 1); assert.equal(pushed.ok, true, JSON.stringify(pushed, (k, v) => v instanceof Error ? v.message : v));

  const third = Controller.create({ config: {}, auth: fakeAuth(), transport: E2ETransport.create({ transport: server.transport, cryptoOptions: FAST }) });
  assert.equal((await third.e2eStart("new phrase for me", "")).ok, true);
});

test("production default is encrypted: controller without an injected transport wraps Supabase in E2E", () => {
  global.OporaSupabaseTransport = require("../src/storage/supabase-transport.js");
  global.OporaSupabaseAuth = { create: () => ({ ...fakeAuth(), configured: () => true }) };
  const controller = Controller.create({ config: { url: "https://x.supabase.co", anonKey: "k" } });
  assert.equal(controller.status().e2e, "locked");
  assert.equal(controller.enable(true).error, "e2e-locked");
  delete global.OporaSupabaseTransport; delete global.OporaSupabaseAuth;
});
