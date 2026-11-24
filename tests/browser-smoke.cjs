"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png"
};

let server;
let origin;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = pathname === "/" ? path.join(root, "index.html") : path.resolve(root, "." + pathname);
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(target, (error, bytes) => {
      if (error) { response.writeHead(404).end("Not found"); return; }
      response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
      response.end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("browser app starts without runtime errors and import requires preview plus confirmation", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);
  assert.match(await page.title(), /Опора/);
  await page.evaluate(() => { localStorage.setItem("opora_cloud_consent_v1", "yes"); go("rep"); });
  await page.locator("#jd").fill(JSON.stringify({
    ci: [{ d: "2026-11-17", mood: 2, note: "browser round trip" }],
    p: { name: "Browser test", sens: [], trig: [] }
  }));
  await page.locator('[data-a="imp"]').click();
  await page.locator("#import-preview:not([hidden])").waitFor();
  assert.match(await page.locator("#import-preview").innerText(), /Копия прошла проверку/);
  assert.match(await page.locator("#import-preview").innerText(), /ci — 1/);
  await page.locator('[data-a="impconfirm"]').click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("opora_v2_data_v1");
    return raw && JSON.parse(raw).ci && JSON.parse(raw).ci[0].note === "browser round trip";
  });
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("opora_v2_backup_"))), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("opora_cloud_consent_v1")), null);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test("PWA installs its service worker and the app shell reloads from cache offline", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 }).catch(async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 });
  });
  await page.route("**/*", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#v").waitFor();
  assert.match(await page.locator("h1").innerText(), /Опора/);
  await context.close();
});


test("unconfigured cloud stays local-only and makes no external requests", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  // The repository config now holds the owner's public Supabase settings, so force the empty config here.
  await page.route("**/src/storage/supabase-config.js", (route) => route.fulfill({
    contentType: "text/javascript; charset=utf-8",
    body: 'window.OPORA_SUPABASE_CONFIG = { url: "", anonKey: "" };'
  }));
  const externalRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => go("rep"));
  await page.locator("#opora-cloud-title").waitFor();
  assert.match(await page.locator("#v").innerText(), /Backend не настроен/);
  assert.deepEqual(externalRequests, []);
});

test("configured cloud sends nothing to the network until the user signs in and consents", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const externalRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.match(await page.evaluate(() => window.OPORA_SUPABASE_CONFIG.url), /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  await page.evaluate(() => go("rep"));
  await page.locator("#opora-cloud-title").waitFor();
  assert.doesNotMatch(await page.locator("#v").innerText(), /Backend не настроен/);
  assert.deepEqual(externalRequests, []);
});

test("a stale tab stops saving after another tab changed the data and can reload fresh data", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const errors = [];
  first.on("pageerror", (error) => errors.push(error.message));
  second.on("pageerror", (error) => errors.push(error.message));
  second.on("dialog", (dialog) => dialog.accept());
  for (const page of [first, second]) {
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);
  }
  await first.evaluate(() => { flushLocal(); });

  await second.evaluate(() => { S.notes.push({ id: 1, tx: "written in the second tab" }); flushLocal(); });
  await first.waitForFunction(() => document.getElementById("ext") !== null, null, { timeout: 5000 });
  const rawBefore = await second.evaluate(() => localStorage.getItem("opora_v2_data_v1"));

  await first.evaluate(() => { S.notes.push({ id: 2, tx: "stale write" }); flushLocal(); });
  assert.equal(await first.evaluate(() => localStorage.getItem("opora_v2_data_v1")), rawBefore,
    "stale tab must not overwrite data from the other tab");

  await first.locator('[data-a="extreload"]').click();
  await first.waitForFunction(() => document.getElementById("ext") === null);
  assert.equal(await first.evaluate(() => S.notes.length), 1);
  await first.evaluate(() => { S.notes.push({ id: 3, tx: "after reload" }); flushLocal(); });
  assert.equal(await first.evaluate(() => JSON.parse(localStorage.getItem("opora_v2_data_v1")).notes.length), 2);
  assert.deepEqual(errors, []);
});

test("unhandled errors produce a local notice and a local journal entry without breaking the app", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await (await browser.newContext()).newPage();
  const requests = [];
  page.on("request", (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith("data:")) requests.push(request.url()); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);

  await page.evaluate(() => { setTimeout(() => { throw new Error("test-unhandled"); }, 0); });
  await page.waitForFunction(() => OporaErrors.count() === 1);
  assert.match(await page.locator("#toast").innerText(), /данные не потеряны/i);
  await page.evaluate(() => { Promise.reject(new Error("test-rejection")); });
  await page.waitForFunction(() => OporaErrors.count() === 2);

  await page.evaluate(() => { go("rep", 1); });
  assert.equal(await page.locator('[data-a="dlerr"]').count(), 1);
  assert.ok(await page.evaluate(() => typeof go === "function" && !!document.querySelector("#v").children.length));
  assert.deepEqual(requests, [], "error reporting must not use the network");
});

test("selective deletion removes only the chosen sections, keeps a restore point, and can purge local copies", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dialogs = [];
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); dialog.accept(); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);

  await page.evaluate(() => {
    S.ci.push({ d: "2026-11-17", mood: 2 }, { d: "2026-11-16", mood: 3 });
    S.notes.push({ t: "заметка", d: "2026-11-17" });
    S.chat.push({ r: "u", c: "старый диалог" });
    flushLocal();
    go("rep", 1);
  });
  await page.locator('input[data-sd="checkins"]').check();
  await page.locator('input[data-sd="archive"]').check();
  await page.locator('[data-a="sddo"]').click();
  await page.waitForFunction(() => S.ci.length === 0);

  assert.match(dialogs[0], /Чек-ины \(2\)/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("opora_v2_data_v1")));
  assert.equal(stored.ci.length, 0);
  assert.equal(stored.chat.length, 0);
  assert.equal(stored.notes.length, 1, "unselected sections are kept");
  const backups = await page.evaluate(() => STORAGE.listBackups());
  assert.ok(backups.some((item) => item.reason === "before-selective-delete"));

  await page.evaluate(() => go("rep", 1));
  await page.locator('input[data-sdpurge]').check();
  await page.locator('[data-a="sddo"]').click();
  await page.waitForFunction(() => STORAGE.listBackups().length === 0);
  assert.match(dialogs[1], /окончательно/);
  assert.deepEqual(await page.evaluate(() => STORAGE.localCopies()), { backups: 0, legacy: false });
  assert.equal(await page.evaluate(() => S.notes.length), 1);
  assert.deepEqual(errors, []);
});

test("browser WebCrypto round trip with production KDF settings and encrypted cloud controller panel", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);

  const result = await page.evaluate(async () => {
    const started = performance.now();
    const vault = await OporaE2ECrypto.createVault("correct horse battery");
    const envelope = await OporaE2ECrypto.encryptSnapshot(vault.dek, vault.wraps, { ci: [{ note: "секрет" }] });
    const dek = await OporaE2ECrypto.unlockWithPassphrase(envelope.wraps, "correct horse battery");
    const back = await OporaE2ECrypto.decryptSnapshot(dek, envelope);
    return { ms: performance.now() - started, iter: envelope.wraps[0].iter, leaked: JSON.stringify(envelope).includes("секрет"), note: back.ci[0].note };
  });
  assert.equal(result.iter, 600000);
  assert.equal(result.leaked, false);
  assert.equal(result.note, "секрет");
  assert.ok(result.ms < 15000, "KDF finishes in a reasonable time: " + result.ms);

  const html = await page.evaluate(() => {
    const auth = { getSession: () => ({ user: { email: "a@b.c" } }), getAccessToken: async () => "t" };
    const inner = { configured: () => true, pull: async () => ({ revision: 0, snapshot: {} }), push: async () => ({ ok: true, revision: 1 }) };
    return OporaCloudController.create({ config: {}, auth, transport: OporaE2ETransport.create({ transport: inner }) }).render();
  });
  assert.match(html, /data-a="cloudkey"/);
  assert.match(html, /шифруются на этом устройстве/);
  assert.doesNotMatch(html, /Синхронизировать сейчас/);
  assert.deepEqual(errors, []);
});

test("cloud sync merges a concurrent change from another device instead of reporting a conflict", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);

  const out = await page.evaluate(async () => {
    const row = { revision: 0, payload: {} };
    const pushes = [];
    const transport = {
      configured: () => true,
      pull: async () => ({ revision: row.revision, snapshot: JSON.parse(JSON.stringify(row.payload)) }),
      push: async ({ snapshot, ifMatch }) => {
        if (ifMatch !== row.revision) return { ok: false, conflict: true, revision: row.revision, snapshot: row.payload };
        row.revision += 1; row.payload = JSON.parse(JSON.stringify(snapshot)); pushes.push(row.payload);
        return { ok: true, conflict: false, revision: row.revision, snapshot };
      }
    };
    const auth = { getSession: () => ({ user: { email: "a@b.c" } }), getAccessToken: async () => "t" };
    window.CLOUD = OporaCloudController.create({ config: {}, auth, transport });
    CLOUD.enable(true);

    S.ci.push({ d: "2026-11-16", mood: 3, note: "общая" });
    S.notes.push({ t: "удалю позже", d: "2026-11-16" });
    await ACT.cloudsync();
    const first = { revision: S.cloudRevision, hasBase: !!S.cloudBase };

    // «другое устройство» добавило чек-ин и удалило заметку, это устройство добавило эпизод
    row.revision += 1;
    row.payload = Object.assign(JSON.parse(JSON.stringify(row.payload)), {
      ci: row.payload.ci.concat([{ d: "2026-11-17", mood: 1, note: "с другого устройства" }]), notes: []
    });
    S.ep.push({ t: 1, d: "2026-11-17", ty: "перегруз" }); sv();
    await ACT.cloudsync();

    return {
      first, revision: S.cloudRevision,
      ci: S.ci.map((x) => x.note), notes: S.notes.length, ep: S.ep.length,
      remoteCi: row.payload.ci.length, remoteEp: row.payload.ep.length,
      leaked: pushes.some((p) => "cloudBase" in p || "cloudRevision" in p),
      exported: STORAGE.exportText(S).includes("cloudBase"),
      backups: STORAGE.listBackups().map((b) => b.reason),
      stored: JSON.parse(localStorage.getItem("opora_v2_data_v1")).ci.length
    };
  });
  assert.deepEqual(out.first, { revision: 1, hasBase: true });
  assert.deepEqual(out.ci, ["общая", "с другого устройства"]);
  assert.equal(out.notes, 0, "deletion from the other device propagated");
  assert.equal(out.ep, 1);
  assert.equal(out.remoteCi, 2);
  assert.equal(out.remoteEp, 1, "merged result was pushed back");
  assert.equal(out.leaked, false);
  assert.equal(out.exported, false);
  assert.ok(out.backups.includes("before-cloud-merge"));
  assert.equal(out.stored, 2);
  assert.deepEqual(errors, []);
});

test("stickers load from files and are served from the offline cache", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const failed = [];
  page.on("response", (response) => { if (response.url().includes("/assets/stickers/") && !response.ok()) failed.push(response.url()); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#v") && document.querySelector("#v").children.length > 0);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true));
  const shown = await page.evaluate(() => Promise.all(Array.from(document.querySelectorAll("img.stk")).map((img) =>
    img.complete ? img.naturalWidth > 0 : new Promise((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); }))));
  assert.ok(shown.length > 0, "at least one sticker is visible on the first screen");
  assert.ok(shown.every(Boolean), "all visible stickers decode");
  assert.deepEqual(failed, []);

  const cached = await page.evaluate(async () => {
    const names = Object.values(STK);
    const cache = await caches.open((await caches.keys()).find((key) => key.startsWith("opora-")));
    const hits = await Promise.all(names.map((name) => cache.match(name)));
    return { total: names.length, cached: hits.filter(Boolean).length };
  });
  assert.equal(cached.cached, cached.total, "all stickers are in the offline cache");
});
