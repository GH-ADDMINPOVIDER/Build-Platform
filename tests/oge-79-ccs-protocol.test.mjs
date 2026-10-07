import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync("config/capability-card-stone.json", "utf8"));
const core = readFileSync("worker/capability-card-stone.ts", "utf8");
const api = readFileSync("worker/capability-card-stone-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const execution = readFileSync("worker/capability-execution-api.ts", "utf8");

test("OGE-79 defines CCS as the facade over existing USE CARD / MA-OP", () => {
  assert.equal(config.protocol, "CAPABILITY_CARD_STONE");
  assert.equal(config.schema_version, "CCS/1.0");
  assert.equal(config.facade_for, "OGENIC_USE_CARD_V1");
  assert.equal(config.compatibility.use_card_v1, true);
  assert.equal(config.compatibility.maop_wrapper, true);
  assert.equal(config.policy.direct_execution_bypass, false);
});

test("OGE-79 locks the Card Stone protocol verbs and fail-closed transition model", () => {
  assert.deepEqual(config.verbs, ["INSERT", "VERIFY", "USE", "LEASE", "RETURN", "REVOKE"]);
  assert.match(core, /CCS_TRANSITION_DENIED/);
  assert.match(core, /ABSENT: \{ INSERT: "INSERTED" \}/);
  assert.match(core, /VERIFIED: \{ USE: "IN_USE", LEASE: "LEASED", REVOKE: "REVOKED" \}/);
  assert.match(core, /LEASED: \{ RETURN: "RETURNED", REVOKE: "REVOKED" \}/);
});

test("OGE-79 public CCS API uses only Card Stone orchestration language", () => {
  assert.match(api, /\/api\/ccs\/status/);
  assert.match(api, /\/api\/ccs\/envelope/);
  assert.match(api, /\/api\/ccs\/lease/);
  assert.doesNotMatch(api, /\btoken\b/i);
  assert.doesNotMatch(api, /\bcredential\b/i);
  assert.doesNotMatch(api, /\bvault\b/i);
});

test("OGE-79 delegates lease authority to the completed USE CARD policy", () => {
  assert.match(api, /createUseCardApi/);
  assert.match(api, /\/api\/use-card\/lease\/evaluate/);
  assert.match(api, /direct_execution_bypass: false/);
});

test("OGE-79 is routed by Yellow and capability execution emits CCS metadata", () => {
  assert.match(entry, /createCapabilityCardStoneApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/ccs\/"\)/);
  assert.match(execution, /toCcsCardView/);
  assert.match(execution, /ccs_card: ccsCard/);
});
