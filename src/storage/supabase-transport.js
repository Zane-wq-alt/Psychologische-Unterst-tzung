(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaSupabaseTransport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function create(options) {
    options = options || {};
    var baseUrl = String(options.url || "").replace(/\/$/, "");
    var anonKey = options.anonKey || "";
    var tokenSource = options.accessToken;
    var fetchImpl = options.fetch || (typeof fetch === "function" ? fetch.bind(typeof globalThis !== "undefined" ? globalThis : null) : null);

    function configured() {
      return /^https:\/\//i.test(baseUrl) && !!anonKey &&
        !!tokenSource && !!fetchImpl;
    }

    async function request(path, init) {
      if (!configured()) throw new Error("supabase-not-configured");
      var token = typeof tokenSource === "function" ? await tokenSource() : tokenSource;
      if (typeof token !== "string" || !token) throw new Error("supabase-auth-required");
      var headers = Object.assign({
        apikey: anonKey,
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }, init && init.headers || {});
      var response = await fetchImpl(baseUrl + path, Object.assign({}, init || {}, { headers: headers }));
      var body = await response.text();
      var parsed = null;
      if (body) {
        try { parsed = JSON.parse(body); }
        catch (_) { throw new Error("supabase-invalid-response"); }
      }
      if (!response.ok) {
        var error = new Error("supabase-http-" + response.status);
        error.status = response.status;
        error.details = parsed;
        throw error;
      }
      return parsed;
    }

    async function pull() {
      var rows = await request("/rest/v1/opora_snapshots?select=revision,payload&limit=1", { method: "GET" });
      if (!Array.isArray(rows)) throw new Error("supabase-invalid-response");
      if (!rows.length) return { revision: 0, snapshot: {} };
      var row = rows[0];
      if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 ||
          !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
        throw new Error("supabase-invalid-response");
      }
      return { revision: row.revision, snapshot: row.payload };
    }

    async function push(payload) {
      if (!payload || !Number.isSafeInteger(payload.ifMatch) || payload.ifMatch < 0 ||
          !payload.snapshot || typeof payload.snapshot !== "object" || Array.isArray(payload.snapshot)) {
        return { ok: false, error: "invalid-payload" };
      }
      var rows = await request("/rest/v1/rpc/opora_sync_push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_snapshot: payload.snapshot,
          p_expected_revision: payload.ifMatch
        })
      });
      var result = Array.isArray(rows) ? rows[0] : rows;
      if (!result || typeof result.ok !== "boolean" || typeof result.conflict !== "boolean" ||
          !Number.isSafeInteger(result.revision)) throw new Error("supabase-invalid-response");
      return {
        ok: result.ok,
        conflict: result.conflict,
        revision: result.revision,
        snapshot: result.snapshot || null
      };
    }

    async function deleteRemote() {
      var result = await request("/rest/v1/rpc/opora_sync_delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (result !== true && !(Array.isArray(result) && result[0] === true)) {
        throw new Error("supabase-delete-not-confirmed");
      }
      return { ok: true };
    }

    return {
      configured: configured,
      pull: pull,
      push: push,
      deleteRemote: deleteRemote
    };
  }

  return { create: create };
});
