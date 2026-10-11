import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const api = read("worker/web-cafe-connector-api.ts");
const entry = read("worker/entry-yellow-stone.ts");
const placement = JSON.parse(read("config/external-resource-placement.json"));
const capabilities = JSON.parse(read("config/external-resource-capabilities.json"));

test("OGE-124 mounts the owner-gated connector in the existing WAVE staging Worker", () => {
  assert.match(entry, /createWebCafeConnectorApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/web-cafe\/"\)/);
  assert.match(api, /api\.use\("\/api\/web-cafe\/\*"/);
  assert.match(api, /hasOwnerOrOpsAccess\(c\.req\.raw, c\.env\)/);
  assert.match(api, /api\.get\("\/api\/web-cafe\/status"/);
  assert.match(api, /api\.get\("\/api\/web-cafe\/read"/);
});

test("the source map is fixed to the known Candy/OGENIC sites and approved public deployment notes", () => {
  assert.match(api, /https:\/\/candybaked\.ogenicchocolate\.com\//);
  assert.match(api, /https:\/\/ogenicchocolate\.com\//);
  assert.match(api, /Ogenicchocolate21debug\/ogenic-chocolate\/main\/README_DEPLOY_TH\.txt/);
  assert.match(api, /Ogenicchocolate21debug\/ogenic-chocolate\/main\/README_MOBILE_TH\.txt/);
  assert.match(api, /Object\.hasOwn\(SOURCES, sourceId\)/);
  assert.match(api, /SOURCE_NOT_ALLOWED/);
  assert.doesNotMatch(api, /c\.req\.query\("url"\)|c\.req\.param\("url"\)/);
  assert.doesNotMatch(api, /OGENIC_DELIVERY_APP_SECRET_MAP/);
});

test("the adapter has no mutation/deploy routes and explicitly reports read-only status", () => {
  assert.doesNotMatch(api, /api\.(post|put|patch|delete)\(/i);
  assert.match(api, /writes_enabled: false/);
  assert.match(api, /deployment_enabled: false/);
  assert.match(api, /primary_runtime: "cloudflare_pages"/);
  assert.match(api, /canonical_product_media_and_A1_A6_data: "Google Drive \+ canonical Google Docs"/);
  assert.match(api, /canonical_product_data: false/);
});

test("all outbound requests are HTTPS GETs with bounded body, timeout, and no credential forwarding", () => {
  assert.match(api, /method: "GET"/);
  assert.match(api, /TIMEOUT_MS = 6_000/);
  assert.match(api, /MAX_READ_BYTES = 140_000/);
  assert.match(api, /redirect: "follow"/);
  assert.match(api, /allowedRedirectTarget/);
  assert.match(api, /final\.protocol !== "https:"/);
  assert.match(api, /final\.hostname === "ogenic-chocolate\.pages\.dev"/);
  assert.doesNotMatch(api, /headers:\s*\{\s*Authorization:/);
  assert.doesNotMatch(api, /headers:\s*\{[^}]*cookie:/i);
});

test("read endpoint strips executable HTML content and returns text/references, not raw HTML", () => {
  assert.match(api, /function htmlToText/);
  assert.match(api, /script\|style\|noscript\|svg\|iframe\|template/);
  assert.match(api, /sourceUrls\(bounded\.text, finalUrl, "href", 100\)/);
  assert.match(api, /sourceUrls\(bounded\.text, finalUrl, "src", 100\)/);
  assert.match(api, /content_is_untrusted_input: true/);
  assert.match(api, /url\.search = ""/);
  assert.match(api, /url\.hash = ""/);
});

test("Candy web resources stay optional and fail-closed; Vercel cannot auto-promote production", () => {
  const resource = placement.resources.find((item) => item.id === "candybaked_web");
  assert.ok(resource);
  assert.equal(resource.critical_path, false);
  assert.equal(resource.routing_mode, "owner_explicit_read_only");
  assert.equal(resource.canonical_source, "Google Drive + canonical Google Docs for Candy A1-A6; this connector does not replace or query those sources.");
  const registered = capabilities.resources.candybaked_web;
  assert.ok(registered);
  assert.equal(registered.provider_status, "optional");
  assert.equal(registered.canonical, false);
  assert.equal(registered.fail_closed, true);
  assert.ok(registered.capabilities.every((item) => item.auto_route === false));
  const deploy = registered.capabilities.find((item) => item.id === "deploy_preview");
  assert.equal(deploy.permission_class, "EXECUTE");
  assert.equal(deploy.production_promotion, false);
});
