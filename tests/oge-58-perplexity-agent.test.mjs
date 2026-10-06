import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("worker/perplexity-agent-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const smoke = readFileSync("scripts/perplexity-agent-smoke.mjs", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("OGE-58 uses the official Perplexity SDK and server-side env binding", () => {
  assert.equal(pkg.dependencies["@perplexity-ai/perplexity_ai"], "0.38.6");
  assert.match(api, /from "@perplexity-ai\/perplexity_ai"/);
  assert.match(api, /PERPLEXITY_API_KEY\?: string/);
  assert.match(api, /hasOwnerSession/);
  assert.doesNotMatch(api, /pplx-[A-Za-z0-9_-]{8,}/);
});

test("OGE-58 is Agent API web-grounded and one-pass", () => {
  assert.match(api, /client\.responses\.create/);
  assert.match(api, /preset: "low"/);
  assert.match(api, /type: "web_search"/);
  assert.match(api, /response\.output_text/);
  assert.match(api, /previous_response_id/);
  assert.match(api, /maxRetries: 0/);
  assert.match(api, /PERPLEXITY_RATE_LIMITED/);
  assert.match(api, /retry_after/);
  assert.match(api, /automatic_retry: false/);
});

test("OGE-58 is routed from Yellow Stone and has a safe smoke command", () => {
  assert.match(entry, /createPerplexityAgentApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/perplexity\/"\)/);
  assert.equal(pkg.scripts["perplexity:smoke"], "node scripts/perplexity-agent-smoke.mjs");
  assert.match(smoke, /PERPLEXITY_API_KEY/);
  assert.match(smoke, /preset: "fast"/);
  assert.match(smoke, /maxRetries: 0/);
  assert.doesNotMatch(smoke, /console\.log\(key\)|process\.stdout\.write\(key/);
});
