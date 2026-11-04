import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resolverApi = readFileSync("worker/capability-resolver-api.ts", "utf8");
const executionApi = readFileSync("worker/capability-execution-api.ts", "utf8");
const planner = readFileSync("worker/athena-command-planner.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const providers = JSON.parse(readFileSync("config/providers.json", "utf8"));
const attestations = JSON.parse(readFileSync("config/provider-readiness-attestations.json", "utf8"));

test("OGE-71 promotes Gemini only from verified checked-in readiness", () => {
  const gemini = providers.providers.find((provider) => provider.id === "gemini");
  assert.equal(gemini?.status, "active");
  assert.equal(attestations.providers.gemini.verification_state, "VERIFIED");
  assert.equal(attestations.providers.gemini.api, "REACHABLE");
  assert.equal(attestations.providers.gemini.quota, "AVAILABLE");
  assert.equal(attestations.providers.gemini.billing, "ACTIVE");
  assert.match(resolverApi, /supplementalConfigCandidates/);
  assert.match(resolverApi, /GEMINI_API_KEY/);
  assert.match(resolverApi, /capability_id: "context_load"/);
  assert.match(resolverApi, /\["gemini", "deepseek"\]/);
  assert.match(resolverApi, /provider_id: id/);
  assert.match(resolverApi, /priority: id === "gemini" \? 5 : 50/);
});

test("OGE-71 executes Gemini through Yellow without hidden retry or Green bypass", () => {
  assert.match(executionApi, /async function runGeminiRead/);
  assert.match(executionApi, /gemini-3\.7-flash/);
  assert.match(executionApi, /descriptor\.provider_id === "gemini"/);
  assert.match(executionApi, /capability_id === "context_load"/);
  assert.match(executionApi, /automatic_retry: false/);
  assert.match(executionApi, /provider_fallback: "DENIED_WITHIN_ATTEMPT"/);
  assert.match(executionApi, /semantic_verification_required: "RUBY_STONE"/);
  assert.match(executionApi, /retention_eligible: false/);
});

test("OGE-71 ATHENA can auto-route bounded analysis to Gemini", () => {
  assert.match(planner, /GEMINI_READ_WORD/);
  assert.match(planner, /capability: "context_load"/);
  assert.match(planner, /provider: "gemini"/);
  assert.match(entry, /prompt\?: unknown/);
  assert.match(entry, /inputPrompt/);
});

test("OGE-71 keeps code mutation on Codex and unavailable specialists fail closed by policy", () => {
  const roster = JSON.parse(readFileSync("config/unifiend-phase-ii-agent-roster.json", "utf8"));
  const codex = roster.core_team.find((actor) => actor.id === "codex");
  assert.equal(codex.role, "canonical_repo_code_test_build_fix");
  assert.ok(roster.routing_rules.includes("Do not route to candidates or billing-blocked providers automatically."));
  assert.ok(roster.routing_rules.includes("Codex owns canonical repo mutation unless explicitly overridden by a verified adapter."));
});
