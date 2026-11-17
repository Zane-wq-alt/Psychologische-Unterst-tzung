"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SupabaseTransport = require("../src/storage/supabase-transport.js");

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body == null ? "" : JSON.stringify(body) };
}

test("Supabase transport refuses incomplete or insecure configuration", async () => {
  const missing = SupabaseTransport.create({ url: "http://example.test", anonKey: "public", accessToken: "jwt", fetch: async () => response(200, []) });
  assert.equal(missing.configured(), false);
  await assert.rejects(missing.pull(), /supabase-not-configured/);
});

test("pull returns an empty revision for a new account and validates stored snapshots", async () => {
  const calls = [];
  const transport = SupabaseTransport.create({
    url: "https://project.supabase.co", anonKey: "public-anon", accessToken: () => "user-jwt",
    fetch: async (url, init) => { calls.push({ url, init }); return response(200, []); }
  });
  assert.deepEqual(await transport.pull(), { revision: 0, snapshot: {} });
  assert.match(calls[0].url, /opora_snapshots/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer user-jwt");
  assert.equal(calls[0].init.headers.apikey, "public-anon");
});

test("push uses the SQL compare-and-swap RPC and returns revision conflicts", async () => {
  let sent;
  const transport = SupabaseTransport.create({
    url: "https://project.supabase.co", anonKey: "public-anon", accessToken: "user-jwt",
    fetch: async (url, init) => {
      sent = { url, init };
      return response(200, [{ ok: false, conflict: true, revision: 4, snapshot: { remote: true } }]);
    }
  });
  const result = await transport.push({ ifMatch: 3, snapshot: { local: true } });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.revision, 4);
  assert.deepEqual(result.snapshot, { remote: true });
  assert.match(sent.url, /rpc\/opora_sync_push$/);
  assert.deepEqual(JSON.parse(sent.init.body), { p_snapshot: { local: true }, p_expected_revision: 3 });
});

test("push rejects malformed snapshots and revisions before network access", async () => {
  let calls = 0;
  const transport = SupabaseTransport.create({
    url: "https://project.supabase.co", anonKey: "public-anon", accessToken: "user-jwt",
    fetch: async () => { calls++; return response(200, []); }
  });
  assert.equal((await transport.push({ ifMatch: -1, snapshot: {} })).error, "invalid-payload");
  assert.equal((await transport.push({ ifMatch: 0, snapshot: [] })).error, "invalid-payload");
  assert.equal(calls, 0);
});

test("delete uses the authenticated owner-only RPC and requires confirmation", async () => {
  let sent;
  const transport = SupabaseTransport.create({
    url: "https://project.supabase.co", anonKey: "public-anon", accessToken: "user-jwt",
    fetch: async (url, init) => { sent = { url, init }; return response(200, true); }
  });
  assert.deepEqual(await transport.deleteRemote(), { ok: true });
  assert.match(sent.url, /rpc\/opora_sync_delete$/);
  assert.equal(sent.init.method, "POST");
});

test("HTTP and invalid JSON errors are not treated as successful sync", async () => {
  const denied = SupabaseTransport.create({
    url: "https://project.supabase.co", anonKey: "public-anon", accessToken: "user-jwt",
    fetch: async () => response(401, { message: "unauthorized" })
  });
  await assert.rejects(denied.pull(), /supabase-http-401/);
  const invalid = SupabaseTransport.create({
    url: "https://project.supabase.co", anonKey: "public-anon", accessToken: "user-jwt",
    fetch: async () => ({ ok: true, status: 200, text: async () => "not-json" })
  });
  await assert.rejects(invalid.pull(), /supabase-invalid-response/);
});
