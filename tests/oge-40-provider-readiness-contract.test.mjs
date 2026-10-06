import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile(new URL("../worker/provider-readiness.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../worker/provider-readiness-api.ts", import.meta.url), "utf8");
const entry = await readFile(new URL("../worker/entry-yellow-stone.ts", import.meta.url), "utf8");

test("OGE-40 covers all eight initial providers and never performs completion probes", () => {
  for (const id of ["openai", "codex", "anthropic", "manus", "perplexity", "deepseek", "gemini", "xai"]) {
    assert.match(core, new RegExp(`id: "${id}"`));
  }
  assert.match(core, /method: "GET"/);
  assert.doesNotMatch(core, /\/chat\/completions|\/responses|agents\/sessions/);
});

test("OGE-40 preserves NOT_MEASURED and routes VERIFIED only", () => {
  assert.match(core, /"NOT_MEASURED"/);
  assert.match(core, /report\.readiness === "VERIFIED"/);
  assert.match(core, /NO_VERIFIED_PROVIDER/);
  assert.match(core, /quota_state/);
  assert.match(core, /billing_state/);
});

test("OGE-40 exposes owner-guarded read-only readiness and route decision APIs", () => {
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /api\.get\("\/api\/provider-readiness"/);
  assert.match(api, /api\.post\("\/api\/provider-readiness\/route"/);
  assert.match(api, /READ_ONLY_ROUTE_DECISION_NO_EXECUTION/);
  assert.match(entry, /createProviderReadinessApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/provider-readiness"\)/);
});
