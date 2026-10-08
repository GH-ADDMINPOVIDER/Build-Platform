import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (p) => readFileSync(p, "utf8");
const config = JSON.parse(file("config/pageindex-adapter.json"));
const entry = file("worker/entry-yellow-stone.ts");
const api = file("worker/pageindex-api.ts");
const bridge = file("integrations/pageindex/bridge.py");
const req = file("integrations/pageindex/requirements.txt");

test("PageIndex is the actual MIT Python SDK pinned only on optional runner", () => {
  assert.equal(config.name, "PageIndex");
  assert.equal(config.upstream_repository, "https://github.com/VectifyAI/PageIndex");
  assert.equal(config.upstream_license, "MIT");
  assert.equal(config.pinned_version, "0.2.10");
  assert.match(req, /^pageindex==0\.2\.10$/m);
  assert.equal(config.host, "OPTIONAL_PYTHON_RUNNER");
  assert.equal(config.cloudflare_worker_installs_python, false);
  assert.match(bridge, /importlib\.metadata\.version\("pageindex"\)/);
  assert.match(bridge, /from PyPDF2 import PdfReader/);
});

test("PageIndex is not silently activated, billed, routed or used as new memory", () => {
  assert.equal(config.registered, true);
  assert.equal(config.indexing_enabled, false);
  assert.equal(config.llm_calls_enabled, false);
  assert.equal(config.cloud_api_enabled, false);
  assert.equal(config.paid_provider_calls_allowed, false);
  assert.equal(config.autoroute, false);
  assert.equal(config.d1_schema_changes, false);
  assert.equal(config.green_memory_changes, false);
  assert.equal(config.capabilities.filter((a) => a.available).length, 2);
  assert.equal(config.capabilities.find((a) => a.key === "pageindex_reasoning_retrieval")?.available, false);
  assert.match(bridge, /PAGEINDEX_LLM_NOT_ENABLED/);
  assert.doesNotMatch(bridge, /submit_document\s*\(|\.chat\s*\(|https:\/\/api\.pageindex/);
});

test("Yellow exposes only authenticated discovery, no direct unapproved indexing", () => {
  assert.match(entry, /createPageIndexApi/);
  assert.match(entry, /pathname === "\/api\/pageindex\/status"/);
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /api\.get\("\/api\/pageindex\/status"/);
  assert.match(api, /indexing_enabled: false/);
  assert.match(api, /llm_calls_enabled: false/);
  assert.match(api, /cloudflare_worker_executes_python: false/);
  assert.doesNotMatch(api, /api\.post\(/);
});
