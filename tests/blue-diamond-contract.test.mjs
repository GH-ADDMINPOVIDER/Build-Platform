import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Blue Diamond is mounted as Stone IV behind the canonical entry", async () => {
  const entry = await read("worker/entry-yellow-stone.ts");
  const api = await read("worker/blue-diamond-api.ts");
  assert.match(entry, /createBlueDiamondApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/blue-diamond\/"\)/);
  assert.match(api, /stone: 4/);
  assert.match(api, /identity: "ATHENA"/);
});

test("registry separates real agent candidates from tools and runtimes", async () => {
  const registry = await read("worker/blue-diamond-registry.ts");
  assert.match(registry, /chatgpt-main-controller/);
  assert.match(registry, /athena-command/);
  assert.match(registry, /codex-execution-agent/);
  assert.match(registry, /github-evidence-arm/);
  assert.match(registry, /linear-task-arm/);
  assert.match(registry, /agent_eligible: false/);
  assert.match(registry, /maturity: "COMMANDER_CANDIDATE"/);
  assert.match(registry, /maturity: "CANDIDATE"/);
  assert.match(registry, /return actors\.slice\(0, 15\)/);
  assert.doesNotMatch(registry, /sk-[A-Za-z0-9_-]{8,}/);
});

test("primary controller checks in only on context boundaries while workers preflight every run", async () => {
  const registry = await read("worker/blue-diamond-registry.ts");
  const api = await read("worker/blue-diamond-api.ts");
  assert.match(registry, /CHECKIN_ON_CONTEXT_BOUNDARY/);
  assert.match(registry, /EVERY_RUN/);
  assert.match(api, /NEW_CHAT/);
  assert.match(api, /RESUME_SESSION/);
  assert.match(api, /CONTEXT_SHIFT/);
  assert.match(api, /AGENT_PRE_RUN/);
  assert.match(api, /PRIMARY_CONTROLLER_CHECKS_IN_ONLY_ON_CONTEXT_BOUNDARY/);
  assert.match(api, /PREFLIGHT_REQUIRED/);
});

test("ATHENA cannot self-approve and all execution authority remains Yellow Stone", async () => {
  const api = await read("worker/blue-diamond-api.ts");
  assert.match(api, /YELLOW_STONE_ONLY/);
  assert.match(api, /ATHENA_CANNOT_SELF_APPROVE_OR_BYPASS_YELLOW_STONE/);
  assert.match(api, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(api, /direct_execution_rejected: true/);
  assert.match(api, /\/api\/capabilities\/resolve/);
});

test("Blue Diamond reads canonical 1LSS state and creates no second memory store", async () => {
  const api = await read("worker/blue-diamond-api.ts");
  assert.match(api, /owner-main/);
  assert.match(api, /1LSS_OWNER_MAIN/);
  assert.match(api, /SELECT last_sequence FROM chat_conversations/);
  assert.match(api, /STAMP_VERIFIED_RESULTS_ONLY_TO_1LSS/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("check-in and preflight never fake fresh GitHub or Linear verification", async () => {
  const api = await read("worker/blue-diamond-api.ts");
  assert.match(api, /PENDING_FRESH_TOOL_READS/);
  assert.match(api, /fresh_verification_claimed: false/);
  assert.match(api, /authoritative_sources: \["1LSS", "GitHub", "Linear", "runtime-evidence-as-needed"\]/);
});

test("owner or ops access is mandatory", async () => {
  const api = await read("worker/blue-diamond-api.ts");
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /REAUTH_REQUIRED/);
});
