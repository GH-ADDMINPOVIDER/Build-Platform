import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");
const onboarding = JSON.parse(source("config/provider-onboarding-policy.json"));
const helper = source("worker/provider-onboarding-policy.ts");
const api = source("worker/provider-readiness-api.ts");
const entry = source("worker/entry-yellow-stone.ts");
const registry = JSON.parse(source("config/providers.json"));
const context = JSON.parse(source("config/agent-context-policy.json"));

test("OGE-94 one 4-stage admission policy applies to future providers and never auto-promotes based on key", () => {
  assert.deepEqual(onboarding.stages, ["REGISTERED", "KEY_BOUND", "RUNTIME_VERIFIED", "ROUTE_ELIGIBLE"]);
  assert.equal(onboarding.runtime_preflight.paid_provider_calls, 0);
  assert.equal(onboarding.execution_flow.mode, "DIRECT_TO_YELLOW");
  assert.equal(onboarding.execution_flow.preflight_required, false);
  assert.equal(onboarding.execution_flow.route_check, "AT_EXECUTION_ONLY");
  assert.equal(onboarding.runtime_preflight.advisory_only, true);
  assert.equal(onboarding.runtime_preflight.local_attestation_only, true);
  assert.equal(onboarding.runtime_preflight.owner_or_ops_auth, true);
  assert.equal(onboarding.live_proof.requires_owner_authorization_for_paid_smoke, true);
  assert.equal(onboarding.hard_gates.forbid_auto_promote_on_key_only, true);
  assert.equal(onboarding.hard_gates.require_implemented_adapter, true);
  assert.equal(onboarding.hard_gates.non_read_requires_explicit_approval, false);
  assert.equal(onboarding.hard_gates.non_read_requires_signed_owner_session, true);
  assert.equal(onboarding.hard_gates.retention_requires_ruby_verification, true);
  assert.equal(onboarding.context_policy, "config/agent-context-policy.json");
  assert.equal(context.budgets.research_read_chars, 12000);
  assert.equal(context.hard_rules.hidden_retry, false);
});

test("OGE-94 keeps only currently proven READ adapters eligible, paid DeepSeek explicit", () => {
  assert.deepEqual(Object.keys(onboarding.verified_read_routes).sort(), ["deepseek", "gemini"]);
  assert.equal(onboarding.verified_read_routes.deepseek.selection, "EXPLICIT_ONLY");
  assert.equal(onboarding.verified_read_routes.gemini.selection, "AUTO_READ_EXISTING");
  assert.ok(registry.providers.find((p) => p.id === "deepseek" && p.status === "active"));
  assert.match(helper, /report\.readiness === "VERIFIED"/);
  assert.match(helper, /proof\.http_status === 200/);
  assert.match(helper, /proof\.evidence_ref/);
  assert.match(helper, /catalog\?\.status === "active"/);
  assert.match(helper, /report\.key_present/);
  assert.match(helper, /route\?\.permission_class === "READ"/);
  assert.doesNotMatch(helper, /fetch\s*\(|\.run\s*\(|\.execute\s*\(/);
});

test("OGE-94 returns actionable no-cost admission diagnostics without new routes bypassing auth", () => {
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /api\.get\("\/api\/provider-readiness\/onboarding"/);
  assert.match(api, /readProviderReadiness\(c\.env, \{ probe: false \}\)/);
  assert.match(api, /buildProviderOnboardingPreflight/);
  assert.match(api, /diagnostic_only: true/);
  assert.match(api, /requires_preflight_before_execution: false/);
  assert.match(api, /execution_authority: "\/api\/capabilities\/execute"/);
  assert.match(helper, /route_status: "NOT_CHECKED_YELLOW"/);
  assert.doesNotMatch(entry, /buildProviderOnboardingPreflight/);
  assert.match(api, /paid_completion_calls: false/);
  assert.match(entry, /pathname\.startsWith\("\/api\/provider-readiness"\)/);
  for (const action of onboarding.next_action_codes) assert.ok(helper.includes(action));
  assert.match(helper, /route_eligible: stage === "ROUTE_ELIGIBLE"/);
  assert.match(helper, /paid_preflight_calls: 0/);
});

test("OGE-94 does not weaken execution or storage controls", () => {
  const executor = source("worker/capability-execution-api.ts");
  assert.match(executor, /descriptor\.permission_class !== "READ"/);
  assert.match(executor, /hasOwnerSession/);
  assert.match(executor, /NO_IMPLEMENTED_NON_READ_ADAPTER/);
  assert.match(executor, /retention_eligible: false/);
  assert.match(executor, /semantic_verification_required: "RUBY_STONE"/);
  assert.equal(onboarding.hard_gates.no_unapproved_metered_auto_route, true);
  assert.equal(onboarding.hard_gates.secrets_in_infisical_only, true);
  assert.equal(onboarding.hard_gates.no_second_1lss_memory, true);
});
