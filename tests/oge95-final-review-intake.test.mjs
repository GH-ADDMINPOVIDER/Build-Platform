import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digest, evaluateFinalIntake } from "../scripts/oge95-final-review-intake.mjs";
const sha = "a".repeat(40);
const historicalAudit = JSON.parse(readFileSync("docs/evidence/oge-62-flow-audit-latest.json", "utf8"));
const audit = { ...historicalAudit, source_sha: sha };
const base = { audit, sourceSha: sha, writerActor: "codex-author" };
const proof = (provider, changes = {}) => ({
  schema: "OGE95_AGENT_REVIEW_V1", provider, source_sha: sha,
  audit_sha256: digest(audit), task_id: provider + "-real-task-01",
  reviewer_actor: provider + "-independent-reviewer", permission: "READ_ONLY",
  proof_ref: "https://example.org/proof/" + provider,
  result: "PASS", side_effects: false, usage: { credits: 0, total_tokens: 20 },
  ...changes
});
test("GitHub 10/10 remains valid with no paid provider call", () => {
  const out = evaluateFinalIntake(base);
  assert.equal(out.github_audit, "PASS");
  assert.equal(out.final_intake_state, "GITHUB_ONLY_NO_AGENT_REVIEW");
  assert.equal(out.reviewers.manus.state, "NOT_CONNECTED");
  assert.equal(out.reviewers.openai.state, "NOT_CONNECTED");
  assert.equal(out.yellow_commit_or_deploy_authority, "NOT_GRANTED");
});
test("Manus or OpenAI PASS never bypasses independent Ruby verification", () => {
  const out = evaluateFinalIntake({ ...base, receipts: { manus: proof("manus"), openai: proof("openai") } });
  assert.equal(out.final_intake_state, "AWAIT_RUBY_PROVENANCE");
  assert.equal(out.independent_ruby_verified, false);
  assert.equal(out.green_verified_promotion, false);
});
test("Mismatch SHA, audit hash, author=self and unauthorized review all reject", () => {
  for (const changes of [
    { source_sha: "b".repeat(40) }, { audit_sha256: "0".repeat(64) },
    { reviewer_actor: "codex-author" }, { permission: "WRITE" }, { side_effects: true }
  ]) {
    const out = evaluateFinalIntake({ ...base, receipts: { manus: proof("manus", changes) } });
    assert.equal(out.final_intake_state, "REWORK_REQUIRED");
  }
});
test("Review FAIL blocks and INCONCLUSIVE never converts to PASS", () => {
  assert.equal(evaluateFinalIntake({ ...base, receipts: { openai: proof("openai", { result: "FAIL" }) } }).final_intake_state, "REWORK_REQUIRED");
  assert.equal(evaluateFinalIntake({ ...base, receipts: { manus: proof("manus", { result: "INCONCLUSIVE" }) } }).final_intake_state, "REVIEW_INCONCLUSIVE");
});
test("Deterministic failure cannot be papered over by agent agreement", () => {
  const out = evaluateFinalIntake({ ...base, audit: { ...audit, commit_eligible: false }, receipts: { manus: proof("manus"), openai: proof("openai") } });
  assert.equal(out.github_audit, "BLOCKED");
  assert.equal(out.final_intake_state, "BLOCKED_GITHUB_AUDIT");
});

test("Historical OGE-62 audit without same-SHA attestation is not recertified for new commits", () => {
  const out = evaluateFinalIntake({ audit: historicalAudit, sourceSha: sha });
  assert.equal(out.github_audit, "HISTORICAL_UNBOUND");
  assert.equal(out.final_intake_state, "GITHUB_AUDIT_SHA_NOT_ATTESTED");
  assert.equal(out.green_verified_promotion, false);
});
