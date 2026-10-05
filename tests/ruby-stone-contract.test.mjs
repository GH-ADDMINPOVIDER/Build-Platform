import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const ruby = read("worker/ruby-stone-api.ts");
const entry = read("worker/entry-yellow-stone.ts");
const violet = read("worker/violet-stone-api.ts");
const shared = read("database/migrations/0004_agent_shared_state.sql");

test("Ruby exposes a reusable scorecard and evaluation API", () => {
  for (const marker of [
    "RUBY_STONE_TEST_LAYER_V1",
    "/api/ruby/health",
    "/api/ruby/scorecard",
    "/api/ruby/evaluate",
    "started_at",
    "finished_at",
    "duration_ms",
    "evidence_ref",
    "measured_pass_rate",
  ]) assert.match(ruby, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Ruby covers the canonical system domains without fake PASS semantics", () => {
  for (const domain of ["continuity", "admission", "planning", "multi_agent", "routing", "approval", "evidence", "runtime", "security"]) {
    assert.match(ruby, new RegExp(`\\"${domain}\\"`));
  }
  assert.match(ruby, /type TestState = "PASS" \| "FAIL" \| "BLOCKED" \| "NOT_MEASURED"/);
  assert.match(ruby, /summary\.fail === 0/);
  assert.match(ruby, /scorecard\.summary\.fail \? 409 : 200/);
});

test("Ruby validates Green, Blue, ATHENA, Violet and Yellow governance", () => {
  assert.match(ruby, /CANONICAL_CONVERSATION = "owner-main"/);
  assert.match(ruby, /CANONICAL_SESSION = "1LSS_OWNER_MAIN"/);
  assert.match(ruby, /buildBlueDiamondRegistry/);
  assert.match(ruby, /planAthenaCommand/);
  assert.match(ruby, /buildVioletAgentRegistry/);
  assert.match(ruby, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(ruby, /YELLOW_STONE_ONLY/);
  assert.match(ruby, /direct_execution_bypass: false/);
  assert.match(ruby, /blue_admission_required: true/);
});

test("Ruby records Accuracy evidence into existing operational events only", () => {
  assert.match(ruby, /RUBY_EVAL_PASS/);
  assert.match(ruby, /RUBY_EVAL_FAIL/);
  assert.match(ruby, /INSERT INTO agent_events/);
  assert.match(ruby, /task_id, event_type, actor, correlation_id, external_ref/);
  assert.match(shared, /CREATE TABLE IF NOT EXISTS agent_events/);
  assert.match(violet, /RUBY_EVAL_PASS/);
  assert.match(violet, /RUBY_EVAL_FAIL/);
  assert.match(violet, /accuracy_sample_size: samples/);
});

test("Ruby keeps dangerous tests approval-gated and does not expose secrets", () => {
  assert.match(ruby, /dangerous_tests_approval_gated: true/);
  assert.match(ruby, /secrets_exposed: false/);
  assert.match(ruby, /schema_change: false/);
  assert.match(ruby, /BEGIN \(RSA\|OPENSSH\|EC\) PRIVATE KEY/);
  assert.doesNotMatch(ruby, /console\.log\([^)]*OGENIC_OPS_KEY/);
});

test("Ruby is mounted in the canonical Worker without a new schema migration", () => {
  assert.match(entry, /createRubyStoneApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/ruby\/"\)/);
  assert.doesNotMatch(ruby, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});

// Proof refresh: keep Stone VI live evidence on the current staging HEAD.
