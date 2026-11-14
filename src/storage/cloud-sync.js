(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OporaCloudSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /*
   * Optional cloud-sync contract.
   * No provider, network request, credentials, or automatic sync is bundled here.
   * A host application must inject a trusted transport and receive explicit consent.
   */
  function create(options) {
    options = options || {};
    var transport = options.transport || null;
    var enabled = false;

    function configured() {
      return !!transport &&
        typeof transport.pull === "function" &&
        typeof transport.push === "function";
    }

    function status() {
      return {
        enabled: enabled,
        configured: configured(),
        mode: enabled ? "enabled" : "local-only"
      };
    }

    function enable(consent) {
      if (consent !== true) return { ok: false, error: "explicit-consent-required" };
      if (!configured()) return { ok: false, error: "backend-not-configured" };
      enabled = true;
      return { ok: true, status: status() };
    }

    function disable() {
      enabled = false;
      return { ok: true, status: status() };
    }

    async function sync(localSnapshot, localRevision) {
      if (!enabled) return { ok: false, error: "sync-disabled" };
      if (!configured()) return { ok: false, error: "backend-not-configured" };

      var remote;
      try {
        remote = await transport.pull();
      } catch (error) {
        return { ok: false, error: "remote-read-failed", detail: error };
      }

      var remoteRevision = remote && remote.revision != null ? remote.revision : null;
      if (remoteRevision !== localRevision) {
        return {
          ok: false,
          conflict: true,
          error: "revision-conflict",
          localRevision: localRevision == null ? null : localRevision,
          remoteRevision: remoteRevision,
          remoteSnapshot: remote && remote.snapshot
        };
      }

      try {
        var result = await transport.push({
          snapshot: localSnapshot,
          ifMatch: remoteRevision
        });
        if (!result || result.ok !== true) {
          return { ok: false, error: "remote-write-rejected", detail: result || null };
        }
        return {
          ok: true,
          revision: result.revision == null ? null : result.revision
        };
      } catch (error) {
        return { ok: false, error: "remote-write-failed", detail: error };
      }
    }

    async function deleteRemote() {
      if (!enabled) return { ok: false, error: "sync-disabled" };
      if (!transport || typeof transport.deleteRemote !== "function") {
        return { ok: false, error: "remote-delete-not-supported" };
      }
      try {
        var result = await transport.deleteRemote();
        if (!result || result.ok !== true) {
          return { ok: false, error: "remote-delete-rejected" };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: "remote-delete-failed", detail: error };
      }
    }

    return {
      status: status,
      enable: enable,
      disable: disable,
      sync: sync,
      deleteRemote: deleteRemote
    };
  }

  return { create: create };
});
