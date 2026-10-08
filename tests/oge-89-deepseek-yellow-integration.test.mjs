import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const source = (path) => readFileSync(path, "utf8");

const providers = json("config/providers.json");
const attestations = json("config/provider-readiness-attestations.json");
const resolver = source("worker/capability-resolver-api.ts");
const executor = source("worker/capability-execution-api.ts");
const directApi = source("worker/deepseek-api.ts");
const planner = source("worker/athena-command-planner.ts");

test("OGE-89 uses the existing Infisical key; active only with verified live evidence", () => {
  const p = providers.providers.find((item) => item.id === "deepseek");
  const a = attestations.providers.deepseek;
  assert.equal(p?.status, "active");
  assert.match(p?.role, /explicit_selection_only/);
  assert.equal(a.verification_state, "VERIFIED");
  assert.equal(a.http_status, 200);
  assert.equal(a.api, "REACHABLE");
  assert.equal(a.quota, "AVAILABLE");
  assert.equal(a.billing, "ACTIVE");
  assert.equal(a.evidence_ref, "github-actions://Ogenicchocolate21debug/Build-Platform/37727857716");
  assert.match(resolver, /DEEPSEEK_API_KEY/);
  assert.match(resolver, /attestation\?\.verification_state === "VERIFIED"/);
  assert.match(resolver, /attestation\.billing === "ACTIVE"/);
  assert.match(resolver, /!keyPresent/);
  assert.match(resolver, /!verified/);
  assert.match(resolver, /binding_environment: "staging"/);
});

test("OGE-89 DeepSeek is an explicitly selected, bounded READ-only Yellow adapter", () => {
  assert.match(executor, /async function runDeepSeekRead/);
  assert.match(executor, /descriptor\.provider_id === "deepseek"/);
  assert.match(executor, /request\.provider !== "deepseek"/);
  assert.match(executor, /!body\.input\?\.prompt/);
  assert.match(executor, /EXPLICIT_DEEPSEEK_SELECTION_AND_PROMPT_REQUIRED/);
  assert.match(executor, /boundedReadPrompt/);
  assert.doesNotMatch(executor, /boundedResult/);
  assert.match(executor, /model: "deepseek-flash"/);
  assert.equal(executor.includes("max_tokens: 256,"), false);
  assert.match(executor, /output_complete:/);
  assert.match(executor, /output_truncated_by_provider:/);
  assert.ok(executor.includes('typeof providerContent === "string"'));
  assert.ok(executor.includes("provider_output_complete: deepseek.output_complete"));
  assert.equal(directApi.includes("max_tokens: 4096,"), false);
  assert.match(directApi, /output_complete:/);
  assert.match(executor, /thinking: \{ type: "disabled" \}/);
  assert.match(executor, /automatic_retry: false/);
  assert.match(executor, /DEEPSEEK_CREDIT_EXHAUSTED/);
  assert.match(executor, /semantic_verification_required: "RUBY_STONE"/);
  assert.match(executor, /retention_eligible: false/);
  assert.match(executor, /descriptor\.permission_class !== "READ"/);
});

test("OGE-89 preserves Gemini as default and does not create or request another API key", () => {
  assert.match(resolver, /priority: id === "gemini" \? 5 : 50/);
  assert.match(planner, /provider: "gemini"/);
  assert.doesNotMatch(planner, /provider: "deepseek"/);
  assert.match(directApi, /DEEPSEEK_API_KEY\?: string/);
  assert.match(directApi, /hasOwnerSession/);
  assert.doesNotMatch(executor, /Api_deepseek_key_operate_1|DEEPSEEK_KEY/);
});
