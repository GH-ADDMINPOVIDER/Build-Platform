import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = JSON.parse(readFileSync("config/use-card-policy.json", "utf8"));
const core = readFileSync("worker/use-card-policy.ts", "utf8");
const api = readFileSync("worker/use-card-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const execution = readFileSync("worker/capability-execution-api.ts", "utf8");

test("OGE-78 defines expandable 50-in-1 USE CARD over MA-OP / Yellow", () => {
  assert.equal(policy.name, "50_IN_1_FOR_1LSS");
  assert.equal(policy.wrapper, "MA-OP");
  assert.equal(policy.execution_authority, "YELLOW_STONE_ONLY");
  assert.equal(policy.dynamic_slots, true);
  assert.equal(policy.slot_policy.fixed_slot_count, false);
  assert.equal(policy.slot_policy.add_without_card_redesign, true);
});

test("OGE-78 keeps raw source values out of agent-visible card surfaces", () => {
  assert.equal(policy.safety.raw_source_values_exposed_to_agents, false);
  assert.equal(policy.safety.raw_source_values_retained_in_1lss, false);
  assert.equal(policy.safety.raw_source_values_retained_in_logs, false);
  assert.match(core, /source_surface: "SERVER_SIDE_BROKER"/);
  assert.match(core, /direct_source_value_exposed: false/);
  assert.match(api, /raw_values_exposed: false/);
});

test("OGE-78 card lease is bounded, same-provider, and non-escalating", () => {
  assert.equal(policy.lease_policy.same_provider_only_v1, true);
  assert.equal(policy.lease_policy.cross_provider_hidden_fallback, false);
  assert.equal(policy.lease_policy.max_ttl_minutes, 30);
  assert.equal(policy.lease_policy.max_calls, 200);
  assert.equal(policy.lease_policy.permission_escalation, false);
  assert.match(core, /CROSS_PROVIDER_LEASE_DENIED_V1/);
  assert.match(core, /PERMISSION_ESCALATION_DENIED/);
  assert.match(core, /SOURCE_CARD_MUST_DIFFER/);
});

test("OGE-78 protects dangerous owner-only actions and requires Ruby return evidence", () => {
  assert.ok(policy.lease_policy.protected_operations.includes("PRODUCTION"));
  assert.ok(policy.lease_policy.protected_operations.includes("BILLING"));
  assert.ok(policy.lease_policy.protected_operations.includes("DELETE"));
  assert.ok(policy.lease_policy.protected_operations.includes("SECRET_REVEAL"));
  assert.ok(policy.lease_policy.protected_operations.includes("D1_SCHEMA"));
  assert.equal(policy.lease_policy.ruby_verification_required, true);
  assert.equal(policy.lease_policy.return_required, true);
  assert.match(core, /PROTECTED_OPERATION_REQUIRES_OWNER/);
  assert.match(api, /evidence_state: "RUBY_PENDING"/);
});

test("OGE-78 is wired into Yellow and existing capability execution emits USE CARD metadata", () => {
  assert.match(entry, /createUseCardApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/use-card\/"\)/);
  assert.match(execution, /wrapCapabilityAsUseCard/);
  assert.match(execution, /use_card: useCard/);
});

// canonical proof trigger
