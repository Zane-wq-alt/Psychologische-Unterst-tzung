"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function stickerMap() {
  const match = read("src/legacy/00-assets-and-helpers.js").match(/^var STK=(\{[^\n]*\});$/m);
  assert.ok(match, "STK map must be a single-line object of file paths");
  return JSON.parse(match[1]);
}

test("every sticker is a real WebP file, referenced by path, and precached for offline use", () => {
  const map = stickerMap();
  const names = Object.keys(map);
  assert.ok(names.length >= 50, "stickers are present");
  const sw = read("sw.js");
  const precache = new Set(JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1]));
  for (const name of names) {
    assert.match(map[name], /^assets\/stickers\/[A-Za-z0-9_-]+\.webp$/, "path is local and plain: " + name);
    const bytes = fs.readFileSync(path.join(root, map[name]));
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF", name + " is a RIFF container");
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP", name + " is WebP");
    assert.ok(precache.has("./" + map[name]), "precached: " + map[name]);
  }
});

test("the main helper script no longer carries embedded image data", () => {
  const script = read("src/legacy/00-assets-and-helpers.js");
  assert.doesNotMatch(script, /data:image\/[a-z]+;base64,/);
  assert.ok(script.length < 50000, "script is small: " + script.length);
});

test("service worker precache lists only files that exist and has no duplicates", () => {
  const sw = read("sw.js");
  const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  assert.equal(new Set(files).size, files.length, "no duplicate precache entries");
  for (const file of files) {
    if (file === "./") continue;
    assert.ok(fs.existsSync(path.join(root, file)), "exists: " + file);
  }
});
