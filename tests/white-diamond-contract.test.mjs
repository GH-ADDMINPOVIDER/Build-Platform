import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("White Diamond is mounted behind the canonical Yellow Stone entry", async () => {
  const entry = await read("worker/entry-yellow-stone.ts");
  assert.match(entry, /createWhiteDiamondApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/white-diamond\/"\)/);
  assert.match(entry, /createCapabilityResolverApi/);
  assert.match(entry, /createCapabilityExecutionApi/);
});

test("registry is bounded to 15 agents with safe runtime metadata", async () => {
  const registry = await read("worker/white-diamond-registry.ts");
  assert.match(registry, /return agents\.slice\(0, 15\)/);
  assert.match(registry, /white-diamond-manager/);
  assert.match(registry, /yellow-stone-router/);
  assert.match(registry, /codex-left-arm/);
  assert.match(registry, /CONFIGURATION_REQUIRED/);
  assert.match(registry, /SIMULATED/);
  assert.match(registry, /DEGRADED/);
  assert.match(registry, /auth_ref/);
  assert.doesNotMatch(registry, /sk-[A-Za-z0-9_-]{8,}/);
});

test("routing modes are explicit and bounded", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /SOLO/);
  assert.match(api, /TEAM_3/);
  assert.match(api, /TEAM_5/);
  assert.match(api, /TEAM_10/);
  assert.match(api, /FULL_15/);
  assert.match(api, /max_agents: 15/);
  assert.match(api, /specialist_as_tool/);
});

test("TEAM plans keep manager plus specialists and expose explicit handoff", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /agents: \[manager, \.\.\.specialists\.slice\(0, target - 1\)\]/);
  assert.match(api, /handoff_contract: "EXPLICIT_AGENT_ID_THEN_YELLOW_STONE_RESOLVE"/);
  assert.match(api, /\/api\/white-diamond\/handoff/);
  assert.match(api, /AGENT_NOT_FOUND/);
});

test("parallel fanout is read-only and direct execution bypass is rejected", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /parallel: wantsParallel && requestedPermission === "READ"/);
  assert.match(api, /wantsExecution \|\| requestedPermission !== "READ"/);
  assert.match(api, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(api, /direct_execution_rejected: true/);
  assert.match(api, /yellow_stone_required: true/);
  assert.match(api, /WHITE_DIAMOND_MAY_PLAN_BUT_CANNOT_BYPASS_OGE25_OGE26/);
});

test("all execution authority remains Yellow Stone only", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /execution_authority: "YELLOW_STONE_ONLY"/);
  assert.match(api, /next: "\/api\/capabilities\/resolve"/);
  assert.match(api, /NO_DIRECT_EXECUTION_BYPASS/);
});

test("White Diamond reads canonical 1LSS context and creates no second memory store", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /owner-main/);
  assert.match(api, /1LSS_OWNER_MAIN/);
  assert.match(api, /SELECT last_sequence FROM chat_conversations/);
  assert.match(api, /STAMP_VERIFIED_RESULTS_ONLY_TO_1LSS/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("unavailable specialist handoff fails closed instead of faking LIVE", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /\["CONFIGURATION_REQUIRED", "OFFLINE"\]\.includes\(target\.state\)/);
  assert.match(api, /fallback_agent_id/);
  assert.match(api, /CONFIGURATION_REQUIRED/);
});

test("owner or ops access is mandatory", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /REAUTH_REQUIRED/);
});
