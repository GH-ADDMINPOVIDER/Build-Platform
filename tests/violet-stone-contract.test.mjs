import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

const violet = read("worker/violet-stone-api.ts");
const entry = read("worker/entry-yellow-stone.ts");
const schema4 = read("database/migrations/0004_agent_shared_state.sql");
const schema5 = read("database/migrations/0005_agent_lane_registry.sql");

test("Violet exposes only the real interactive executive Agent line", () => {
  for (const marker of [
    'app: "OpenAI"', 'rank: "CEO"',
    'app: "Codex"', 'rank: "CTO"',
    'app: "Manus"', 'rank: "COO"',
  ]) assert.match(violet, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(violet, /visible_identity: `\$\{agent\.app\} • Agent • \$\{agent\.rank\}`/);
  assert.doesNotMatch(violet, /Agent #\d+/);
});

test("Violet keeps execution under Yellow and canonical state under Green", () => {
  assert.match(violet, /execution_authority: "YELLOW_STONE_ONLY"/);
  assert.match(violet, /yellow_stone_route: "\/api\/capabilities\/execute"/);
  assert.match(violet, /direct_execution_bypass: false/);
  assert.match(violet, /CANONICAL_CONVERSATION = "owner-main"/);
  assert.match(violet, /CANONICAL_SESSION = "1LSS_OWNER_MAIN"/);
  assert.match(violet, /HUMAN_APPROVAL_REQUIRED/);
});

test("Violet forms deterministic parallel or sequential graphs and evidence merge", () => {
  assert.match(violet, /type Strategy = "parallel" \| "sequential"/);
  assert.match(violet, /role: "plan"/);
  assert.match(violet, /role: "specialist"/);
  assert.match(violet, /role: "merge_verified_results"/);
  assert.match(violet, /coverage_limited/);
  assert.match(violet, /verified_count/);
  assert.match(violet, /RUBY_EVIDENCE_ONLY/);
});

test("Accuracy is measured only from Ruby evaluation evidence", () => {
  assert.match(violet, /RUBY_EVAL_PASS/);
  assert.match(violet, /RUBY_EVAL_FAIL/);
  assert.match(violet, /accuracy_state: samples \? "MEASURED" : "NOT_MEASURED"/);
  assert.match(violet, /accuracy_sample_size: samples/);
  assert.match(violet, /NOT_MEASURED_UNTIL_RUBY_EVIDENCE/);
});

test("Violet reuses existing shared state instead of adding a schema", () => {
  for (const table of ["agent_tasks", "agent_events", "agent_checkpoints", "agent_locks"]) assert.match(schema4, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema5, /CREATE TABLE IF NOT EXISTS agent_lanes/);
  assert.match(violet, /FROM agent_tasks/);
  assert.match(violet, /FROM agent_events/);
  assert.match(violet, /FROM agent_lanes/);
  assert.match(violet, /schema_change: false/);
});

test("Violet API is mounted into the canonical Yellow Stone worker", () => {
  assert.match(entry, /createVioletStoneApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/violet\/"\)/);
  for (const route of ["/api/violet/health", "/api/violet/status", "/api/violet/plan", "/api/violet/handoff", "/api/violet/merge"]) {
    assert.match(violet, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
