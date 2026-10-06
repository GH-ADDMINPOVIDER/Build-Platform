import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("worker/gemini-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const smoke = readFileSync("scripts/gemini-smoke.mjs", "utf8");
const bindings = JSON.parse(readFileSync("config/staging-runtime-bindings.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("OGE-60 normalizes Infisical Google key to canonical Gemini binding", () => {
  assert.ok(bindings.aliases.GEMINI_API_KEY.includes("GOOGLE_API_KEY"));
  assert.ok(bindings.aliases.GEMINI_API_KEY.includes("SECRET_GOOGLE"));
  assert.ok(bindings.provider_optional.includes("GEMINI_API_KEY"));
});

test("OGE-60 uses official Gemini generateContent and current stable Flash", () => {
  assert.match(api, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(api, /:generateContent/);
  assert.match(api, /"x-goog-api-key": apiKey/);
  assert.match(api, /const DEFAULT_MODEL = "gemini-3\.7-flash"/);
  assert.match(api, /gemini-3\.8-flash/);
  assert.match(api, /hasOwnerSession/);
  assert.match(api, /automatic_retry: false/);
  assert.match(api, /YELLOW_STONE_ONLY/);
  assert.doesNotMatch(api, /SECRET_GOOGLE|GOOGLE_API_KEY/);
});

test("OGE-60 routes Gemini through Yellow Stone", () => {
  assert.match(entry, /createGeminiApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/gemini\/"\)/);
  assert.equal(pkg.scripts["gemini:smoke"], "node scripts/gemini-smoke.mjs");
});

test("OGE-60 smoke is minimal and secret-safe", () => {
  assert.match(smoke, /gemini-3\.7-flash/);
  assert.match(smoke, /maxOutputTokens: 128/);
  assert.match(smoke, /content_present/);
  assert.doesNotMatch(smoke, /process\.stdout\.write\(key|console\.log\(key/);
});
