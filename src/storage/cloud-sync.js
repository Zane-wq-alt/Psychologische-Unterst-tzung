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
    var lastRevision = options.revision == null ? null : options.revision;

    function configured() {
      return !!transport &&
        typeof transport.pull === "function" &&
        typeof transport.push === "function";
    }

    function status() {
      return {
        enabled: enabled,
        configured: configured(),
        mode: enabled ? "enabled" : "local-only",
        lastRevision: lastRevision
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
      if (localRevision === undefined) localRevision = lastRevision;
      if (!configured()) return { ok: false, error: "backend-not-configured" };

      var remote;
      try {
        remote = await transport.pull();
      } catch (error) {
        return { ok: false, error: "remote-read-failed", detail: error };
      }

      if (!remote || typeof remote !== "object" || remote.revision === null || remote.revision === undefined) {
        return { ok: false, error: "invalid-remote-response" };
      }
      if (localSnapshot === null || typeof localSnapshot !== "object" || Array.isArray(localSnapshot)) {
        return { ok: false, error: "invalid-local-snapshot" };
      }
      var remoteRevision = remote.revision;
      var remoteSnapshot = remote.snapshot;
      if (!remoteSnapshot || typeof remoteSnapshot !== "object" || Array.isArray(remoteSnapshot)) {
        return { ok: false, error: "invalid-remote-snapshot" };
      }
      if (localRevision === null || localRevision === undefined) {
        if (remoteRevision !== 0) {
          var localEmpty = Object.keys(localSnapshot).length === 0;
          return {
            ok: false, conflict: !localEmpty,
            error: localEmpty ? "remote-available" : "revision-conflict",
            localRevision: null, remoteRevision: remoteRevision, remoteSnapshot: remoteSnapshot
          };
        }
        if (Object.keys(localSnapshot).length === 0) {
          lastRevision = 0;
          return { ok: true, unchanged: true, revision: 0 };
        }
      } else if (remoteRevision !== localRevision) {
        return {
          ok: false, conflict: true, error: "revision-conflict",
          localRevision: localRevision, remoteRevision: remoteRevision, remoteSnapshot: remoteSnapshot
        };
      }

      try {
        var result = await transport.push({
          snapshot: localSnapshot,
          ifMatch: remoteRevision
        });
        if (result && result.conflict === true) {
          return {
            ok: false,
            conflict: true,
            error: "revision-conflict",
            remoteRevision: result.revision == null ? null : result.revision
          };
        }
        if (!result || result.ok !== true) {
          return { ok: false, error: "remote-write-rejected", detail: result || null };
        }
        if (result.revision === null || result.revision === undefined) {
          return { ok: false, error: "invalid-remote-response" };
        }
        lastRevision = result.revision;
        return { ok: true, revision: result.revision, bootstrapped: remoteRevision === 0 };
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
