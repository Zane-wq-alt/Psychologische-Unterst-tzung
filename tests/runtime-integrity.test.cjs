"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("storage-unavailable warning never claims that data is saved to a cloud", () => {
  const navigation = read("src/ui/20-navigation.js");
  assert.match(navigation, /Облачное сохранение не настроено и не является резервной копией/);
  assert.doesNotMatch(navigation, /они сохраняются в облаке/);
});

test("README describes the actual script entrypoint", () => {
  const readme = read("README.md");
  const html = read("index.html");
  assert.match(html, /src\/legacy\/10-state\.js/);
  assert.match(readme, /упорядоченные classic-script файлы/);
  assert.match(readme, /src\/legacy\/app\.js.*не является точкой входа и не загружается/);
});

test("all local scripts and styles referenced by index.html are precached", () => {
  const html = read("index.html");
  const sw = read("sw.js");
  const filesMatch = sw.match(/const FILES = (\[[\s\S]*?\]);/);
  assert.ok(filesMatch, "Service Worker FILES list must be present");
  const precache = new Set(JSON.parse(filesMatch[1]));

  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  for (const asset of [...scripts, ...styles]) {
    assert.ok(fs.existsSync(path.join(root, asset)), "Referenced asset exists: " + asset);
    assert.ok(precache.has("./" + asset.replace(/^\.\//, "")), "Asset is precached: " + asset);
  }
});


test("active runtime contains no Claude, generative-AI SDKs, or model API endpoints", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0, "runtime scripts must be discoverable from index.html");
  for (const script of scripts) {
    assert.ok(!/^https?:\/\//i.test(script), "runtime script must be local: " + script);
    assert.doesNotMatch(read(script),
      /window\.claude|@anthropic-ai|api\.anthropic\.com|anthropic\.com\/v1|api\.openai\.com|openai\.com\/v1|generativelanguage\.googleapis\.com|@google\/generative-ai|\bclaude\b/i,
      "AI provider or model endpoint reference found in active runtime file: " + script);
  }
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i, "no third-party runtime script may be loaded");
});

test("runtime has no remote font or stylesheet dependency", () => {
  const html = read("index.html");
  const css = read("src/ui/legacy.css");
  assert.doesNotMatch(html, /<link[^>]+(?:stylesheet|preconnect)[^>]+https?:\/\//i);
  assert.doesNotMatch(css, /@import\s+url\s*\(\s*["']?https?:/i);
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\/fonts\.googleapis\.com/i);
});
