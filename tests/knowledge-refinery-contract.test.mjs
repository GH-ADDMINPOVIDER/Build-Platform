import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const refinery = read("worker/knowledge-refinery.ts");
const blue = read("worker/blue-diamond-registry.ts");
const violet = read("worker/violet-stone-api.ts");
const ruby = read("worker/ruby-stone-api.ts");
const dockerfile = read("infra/knowledge-sandbox/Dockerfile");
const smoke = read("scripts/knowledge-sandbox-smoke.mjs");
const workflow = read(".github/workflows/oge-39-knowledge-refinery-proof.yml");

test("Knowledge Refinery locks the owner-approved lifecycle", () => {
  for (const marker of [
    "KNOWLEDGE_REFINERY_V1",
    '"SOURCE"',
    '"DISTILL"',
    '"REPRODUCE"',
    '"FIX"',
    '"SPECIALIST_REVIEW"',
    '"VERIFY"',
    '"RETAIN"',
    "owner-main",
    "1LSS_OWNER_MAIN",
  ]) assert.match(refinery, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("DeepSeek is an Agent and Docker stays a non-Agent worker", () => {
  assert.match(refinery, /deepseek-code-intelligence/);
  assert.match(refinery, /DeepSeek • Agent • Chief Reasoning Officer/);
  assert.match(refinery, /docker-sandbox-worker/);
  assert.match(refinery, /Docker • Worker • Sandbox/);
  assert.match(refinery, /actor_class: "worker"/);
  assert.match(refinery, /agent: false/);
  assert.doesNotMatch(refinery, /Docker • Agent/);
  assert.match(blue, /deepseek-candidate/);
});

test("Codex is primary fix and Cursor is an on-demand hard-debug specialist", () => {
  assert.match(refinery, /Codex • Agent • CTO/);
  assert.match(refinery, /PRIMARY_CODE_FIX/);
  assert.match(refinery, /Cursor • Agent • Build Director/);
  assert.match(refinery, /HARD_DEBUG_SPECIALIST/);
  assert.match(refinery, /activation: "ON_DEMAND"/);
  assert.match(refinery, /confidence < 0\.65/);
  assert.match(refinery, /repeated >= 2/);
  assert.match(refinery, /crossFiles >= 8/);
  assert.match(blue, /cursor-candidate/);
});

test("Idle research is read-only and budget gated", () => {
  assert.match(refinery, /mode: "BUDGET_GATED"/);
  assert.match(refinery, /budget_authorized/);
  assert.match(refinery, /permission_class: "READ"/);
  assert.match(refinery, /side_effects: false/);
  assert.match(refinery, /BUDGET_APPROVAL_REQUIRED/);
});

test("Source governance supports learning without blind third-party copying", () => {
  assert.match(refinery, /FULL_CONTEXT/);
  assert.match(refinery, /DISTILL_ONLY/);
  assert.match(refinery, /SOURCE_NOT_ALLOWED/);
  assert.match(refinery, /REFERENCE_AND_DISTILL_ONLY/);
  assert.match(refinery, /reuse_permission/);
  assert.match(refinery, /provenance_ref/);
});

test("Ruby verification gates Green retention and no new D1 schema is introduced", () => {
  assert.match(refinery, /ruby_verification_required: true/);
  assert.match(refinery, /GREEN_1LSS/);
  assert.match(refinery, /verification_state === "PASS"/);
  assert.match(refinery, /ruby_evidence_ref/);
  assert.doesNotMatch(refinery, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  assert.match(violet, /RUBY_EVAL_PASS/);
  assert.match(ruby, /YELLOW_STONE_ONLY/);
});

test("Docker proof runs isolated with no network and a read-only filesystem", () => {
  assert.match(dockerfile, /FROM node:22-alpine/);
  assert.match(smoke, /runtime: "DOCKER_WORKER"/);
  assert.match(smoke, /agent: false/);
  assert.match(workflow, /--network=none/);
  assert.match(workflow, /--read-only/);
  assert.match(workflow, /--cap-drop=ALL/);
  assert.match(workflow, /no-new-privileges/);
});
