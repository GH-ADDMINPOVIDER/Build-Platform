import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("White Diamond is mounted behind the canonical Yellow Stone entry", async () => {
  const entry = await read("worker/entry-yellow-stone.ts");
  assert.match(entry, /createWhiteDiamondApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/white-diamond\/"\)/);
});

test("registry is bounded to 15 agents with safe runtime metadata", async () => {
  const registry = await read("worker/white-diamond-registry.ts");
  assert.match(registry, /MAX_AGENT_COUNT = 15/);
  assert.match(registry, /agent_id/);
  assert.match(registry, /capabilities/);
  assert.match(registry, /runtime/);
  assert.match(registry, /state/);
  assert.doesNotMatch(registry, /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY/);
});

test("routing modes are explicit and bounded", async () => {
  const api = await read("worker/white-diamond-api.ts");
  for (const mode of ["SOLO", "TEAM_3", "TEAM_5", "TEAM_10", "FULL_15"]) assert.match(api, new RegExp(mode));
  assert.match(api, /MAX_AGENT_COUNT/);
});

test("TEAM plans keep manager plus specialists and expose explicit handoff", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /white-diamond-manager/);
  assert.match(api, /specialists/);
  assert.match(api, /handoff/);
});

test("parallel fanout is read-only and direct execution bypass is rejected", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /READ/);
  assert.match(api, /DIRECT_EXECUTION_BYPASS_DENIED/);
});

test("all execution authority remains Yellow Stone only", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /YELLOW_STONE_ONLY/);
  assert.match(api, /\/api\/capabilities\/execute/);
  assert.match(api, /direct_execution_bypass: false/);
});

test("White Diamond reads canonical 1LSS context and creates no second memory store", async () => {
  const api = await read("worker/white-diamond-api.ts");
  assert.match(api, /owner-main/);
  assert.match(api, /1LSS_OWNER_MAIN/);
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

test("Violet Stone Agent Deck uses live identity telemetry with one brain and two interactive arms", async () => {
  const panel = await read("src/WhiteDiamondPanel.tsx");
  const violet = await read("worker/violet-stone-api.ts");

  assert.match(violet, /app: "OpenAI"[\s\S]*rank: "CEO"[\s\S]*position: "BRAIN"/);
  assert.match(violet, /app: "Codex"[\s\S]*rank: "CTO"[\s\S]*position: "LEFT_ARM"/);
  assert.match(violet, /app: "Manus"[\s\S]*rank: "COO"[\s\S]*position: "RIGHT_ARM"/);
  assert.match(violet, /visible_identity: `\$\{agent\.app\} • Agent • \$\{agent\.rank\}`/);

  assert.match(panel, /fetch\("\/api\/violet\/status"/);
  assert.match(panel, /agent\.visible_identity/);
  assert.match(panel, /agent\.position\.replaceAll\("_", " "\)/);
  assert.match(panel, /metric\(agent\.stats\.accuracy/);
  assert.match(panel, /accuracy_sample_size/);
  assert.match(panel, /N\/A \/ NOT_MEASURED/);
  assert.doesNotMatch(panel, /Agent #0?1/);
  assert.doesNotMatch(panel, /Tier|Tire/);
});
