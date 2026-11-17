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
  const page = await browser.newPage();
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
