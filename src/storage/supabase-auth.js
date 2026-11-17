(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaSupabaseAuth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function create(options) {
    options = options || {};
    var url = String(options.url || "").replace(/\/$/, "");
    var anonKey = options.anonKey || "";
    var redirectTo = options.redirectTo || "";
    var store = options.storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    var fetchImpl = options.fetch || (typeof fetch === "function" ? fetch.bind(typeof globalThis !== "undefined" ? globalThis : null) : null);
    var memorySession = null;
    var SESSION_KEY = "opora_supabase_session_v1";

    function configured() {
      return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url) && !!anonKey && !!fetchImpl && !!store;
    }

    function readSession() {
      try {
        var raw = store && store.getItem(SESSION_KEY);
        if (!raw) return memorySession;
        var value = JSON.parse(raw);
        return value && typeof value.access_token === "string" ? value : null;
      } catch (_) { return memorySession; }
    }

    function writeSession(value) {
      if (!value || typeof value.access_token !== "string" || typeof value.refresh_token !== "string") {
        throw new Error("supabase-invalid-session");
      }
      var expiresAt = Number(value.expires_at) || Math.floor(Date.now() / 1000) + (Number(value.expires_in) || 3600);
      memorySession = {
        access_token: value.access_token,
        refresh_token: value.refresh_token,
        expires_at: expiresAt,
        user: value.user && typeof value.user === "object" ? { id: value.user.id || null, email: value.user.email || null } : null
      };
      try { store.setItem(SESSION_KEY, JSON.stringify(memorySession)); }
      catch (_) { throw new Error("supabase-session-storage-failed"); }
      return memorySession;
    }

    function clearSession() {
      memorySession = null;
      try { if (store) store.removeItem(SESSION_KEY); } catch (_) {}
    }

    async function request(path, body, token) {
      if (!configured()) throw new Error("supabase-not-configured");
      var headers = { apikey: anonKey, Accept: "application/json", "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      var response = await fetchImpl(url + path, {
        method: "POST", headers: headers, body: JSON.stringify(body || {})
      });
      var raw = await response.text();
      var parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); }
        catch (_) { throw new Error("supabase-invalid-response"); }
      }
      if (!response.ok) {
        var error = new Error("supabase-auth-http-" + response.status);
        error.status = response.status;
        error.details = parsed;
        throw error;
      }
      return parsed;
    }

    async function sendMagicLink(email) {
      email = String(email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "invalid-email" };
      if (!configured()) return { ok: false, error: "supabase-not-configured" };
      try {
        var query = redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : "";
        await request("/auth/v1/otp" + query, { email: email, create_user: true });
        return { ok: true };
      } catch (error) { return { ok: false, error: "magic-link-failed", detail: error }; }
    }

    async function handleCallback(locationLike, historyLike) {
      if (!configured()) return { ok: false, error: "supabase-not-configured" };
      var params;
      try { params = new URLSearchParams((locationLike && locationLike.search) || ""); }
      catch (_) { return { ok: false, error: "invalid-callback" }; }
      var tokenHash = params.get("token_hash");
      var type = params.get("type");
      var fragment = new URLSearchParams(String((locationLike && locationLike.hash) || "").replace(/^#/, ""));
      var accessToken = fragment.get("access_token");
      var refreshToken = fragment.get("refresh_token");
      if (!tokenHash && accessToken && refreshToken) {
        if (["email", "magiclink"].indexOf(fragment.get("type")) < 0) return { ok: false, error: "invalid-callback-type" };
        try {
          writeSession({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: Number(fragment.get("expires_in")) || 3600,
            user: null
          });
          if (historyLike && typeof historyLike.replaceState === "function" && locationLike) {
            historyLike.replaceState({}, "", (locationLike.pathname || "/") + (params.toString() ? "?" + params.toString() : ""));
          }
          return { ok: true, session: readSession() };
        } catch (error) { return { ok: false, error: "callback-session-failed", detail: error }; }
      }
      if (!tokenHash) return { ok: true, skipped: true };
      if (["email", "magiclink"].indexOf(type) < 0) return { ok: false, error: "invalid-callback-type" };
      try {
        var result = await request("/auth/v1/verify", { token_hash: tokenHash, type: type });
        writeSession(result);
        if (historyLike && typeof historyLike.replaceState === "function" && locationLike) {
          var cleanParams = new URLSearchParams(params.toString());
          cleanParams.delete("token_hash"); cleanParams.delete("type");
          historyLike.replaceState({}, "", (locationLike.pathname || "/") + (cleanParams.toString() ? "?" + cleanParams.toString() : ""));
        }
        return { ok: true, session: readSession() };
      } catch (error) { return { ok: false, error: "callback-verification-failed", detail: error }; }
    }

    async function getAccessToken() {
      var session = readSession();
      if (!session) throw new Error("supabase-auth-required");
      if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session.access_token;
      if (!session.refresh_token) { clearSession(); throw new Error("supabase-auth-required"); }
      try {
        var refreshed = await request("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
        return writeSession(refreshed).access_token;
      } catch (error) { clearSession(); throw error; }
    }

    async function signOut() {
      var session = readSession();
      if (!session) { clearSession(); return { ok: true }; }
      try {
        var token = await getAccessToken();
        await request("/auth/v1/logout", {}, token);
        clearSession();
        return { ok: true };
      } catch (error) {
        clearSession();
        return { ok: false, error: "signout-failed", detail: error };
      }
    }

    return {
      configured: configured,
      sendMagicLink: sendMagicLink,
      handleCallback: handleCallback,
      getAccessToken: getAccessToken,
      getSession: readSession,
      signOut: signOut
    };
  }

  return { create: create };
});
