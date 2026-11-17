"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Auth = require("../src/storage/supabase-auth.js");

function memoryStore() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}
function response(status, value) {
  return { ok: status >= 200 && status < 300, status, text: async () => value == null ? "" : JSON.stringify(value) };
}

test("Supabase auth remains inert without public project configuration", async () => {
  let calls = 0;
  const auth = Auth.create({ storage: memoryStore(), fetch: async () => { calls++; return response(200, {}); } });
  assert.equal(auth.configured(), false);
  assert.equal((await auth.sendMagicLink("test@example.com")).error, "supabase-not-configured");
  assert.equal(calls, 0);
});

test("magic-link request uses the configured redirect and public key only", async () => {
  let request;
  const auth = Auth.create({
    url: "https://example.supabase.co", anonKey: "public-key",
    redirectTo: "https://app.example.test/index.html", storage: memoryStore(),
    fetch: async (url, init) => { request = { url, init }; return response(200, {}); }
  });
  assert.deepEqual(await auth.sendMagicLink("person@example.com"), { ok: true });
  assert.match(request.url, /auth\/v1\/otp\?redirect_to=/);
  assert.equal(request.init.headers.apikey, "public-key");
  assert.deepEqual(JSON.parse(request.init.body), { email: "person@example.com", create_user: true });
  assert.equal(request.init.headers.Authorization, undefined);
});

test("callback verifies the one-time token and stores a short-lived session in session storage", async () => {
  const storage = memoryStore();
  let request, cleaned;
  const auth = Auth.create({
    url: "https://example.supabase.co", anonKey: "public-key", storage,
    fetch: async (url, init) => {
      request = { url, init };
      return response(200, { access_token: "access", refresh_token: "refresh", expires_in: 3600, user: { id: "u1", email: "person@example.com" } });
    }
  });
  const result = await auth.handleCallback(
    { search: "?token_hash=one-time&type=email", pathname: "/index.html", hash: "" },
    { replaceState: (_state, _title, url) => { cleaned = url; } }
  );
  assert.equal(result.ok, true);
  assert.equal(request.url, "https://example.supabase.co/auth/v1/verify");
  assert.deepEqual(JSON.parse(request.init.body), { token_hash: "one-time", type: "email" });
  assert.equal(cleaned, "/index.html");
  assert.equal(auth.getSession().user.email, "person@example.com");
  assert.match(storage.getItem("opora_supabase_session_v1"), /refresh/);
  assert.equal(await auth.getAccessToken(), "access");
});

test("expired sessions refresh once and sign-out clears local session", async () => {
  const storage = memoryStore();
  let requests = [];
  const auth = Auth.create({
    url: "https://example.supabase.co", anonKey: "public-key", storage,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url.includes("grant_type=refresh_token") || url.endsWith("/auth/v1/verify")) return response(200, {
        access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600,
        user: { id: "u1", email: "person@example.com" }
      });
      return response(200, {});
    }
  });
  await auth.handleCallback(
    { search: "?token_hash=one-time&type=magiclink", pathname: "/", hash: "" },
    null
  );
  const stored = JSON.parse(storage.getItem("opora_supabase_session_v1"));
  stored.expires_at = 1;
  storage.setItem("opora_supabase_session_v1", JSON.stringify(stored));
  assert.equal(await auth.getAccessToken(), "new-access");
  assert.match(requests[1].url, /grant_type=refresh_token/);
  assert.deepEqual(await auth.signOut(), { ok: true });
  assert.equal(auth.getSession(), null);
  assert.equal(storage.getItem("opora_supabase_session_v1"), null);
  assert.equal(requests[2].url, "https://example.supabase.co/auth/v1/logout");
});


test("Supabase confirmation URL fragment is accepted and sensitive tokens are removed from the address", async () => {
  const storage = memoryStore();
  let cleaned;
  const auth = Auth.create({
    url: "https://example.supabase.co", anonKey: "public-key", storage,
    fetch: async () => { throw new Error("fragment callback must not require another token exchange"); }
  });
  const result = await auth.handleCallback(
    { search: "", pathname: "/index.html", hash: "#access_token=fragment-access&refresh_token=fragment-refresh&expires_in=3600&type=magiclink" },
    { replaceState: (_state, _title, url) => { cleaned = url; } }
  );
  assert.equal(result.ok, true);
  assert.equal(auth.getSession().access_token, "fragment-access");
  assert.equal(cleaned, "/index.html");
  assert.doesNotMatch(cleaned, /access_token|refresh_token/);
});


test("new-account signup confirmation callback is accepted", async () => {
  const auth = Auth.create({
    url: "https://example.supabase.co", anonKey: "public-key", storage: memoryStore(),
    fetch: async () => response(200, {
      access_token: "signup-access", refresh_token: "signup-refresh", expires_in: 3600,
      user: { id: "new-user", email: "new@example.com" }
    })
  });
  const result = await auth.handleCallback(
    { search: "?token_hash=signup-token&type=signup", pathname: "/", hash: "" },
    null
  );
  assert.equal(result.ok, true);
  assert.equal(auth.getSession().user.email, "new@example.com");
});
