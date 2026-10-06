import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clone = readFileSync("scripts/flow-runtime-clone.mjs", "utf8");
const audit = readFileSync("scripts/audit-flow-runtime-results.mjs", "utf8");
const workflow = readFileSync(".github/workflows/oge-62-flow-audit-commit.yml", "utf8");

test("OGE-62 lets each clone close only its own provisional result", () => {
  assert.match(clone, /self_verify: selfVerifyPass \? "PASS" : "FAIL"/);
  assert.match(clone, /state: selfVerifyPass \? "PROVISIONAL_DONE" : "SELF_VERIFY_FAILED"/);
  assert.match(clone, /provisional_done: selfVerifyPass/);
  assert.match(clone, /final_done: false/);
  assert.match(clone, /clone_close_scope: "OWN_PROVISIONAL_RESULT_ONLY"/);
  assert.match(clone, /canonical_write_attempted: false/);
  assert.match(clone, /d1_schema_write_attempted: false/);
});

test("OGE-62 GitHub audit independently recomputes digests and state", () => {
  assert.match(audit, /expectedWorkDigest = sha/);
  assert.match(audit, /expectedEvidenceDigest = sha/);
  assert.match(audit, /row\.work_digest === expectedWorkDigest/);
  assert.match(audit, /row\.evidence_digest === expectedEvidenceDigest/);
  assert.match(audit, /next_state: pass \? "FINAL_DONE" : "REWORK_REQUIRED"/);
  assert.match(audit, /rework_revision: pass \? null/);
});

test("OGE-62 requires 10 of 10 before commit eligibility", () => {
  assert.match(audit, /expected_runtime_count: 10/);
  assert.match(audit, /commit_eligible: allPass/);
  assert.match(audit, /10_OF_10_GITHUB_AUDIT_PASS/);
  assert.match(workflow, /max-parallel:\s*10/);
  assert.match(workflow, /GitHub audit \/ verify final summary/);
  assert.match(workflow, /Yellow commit gate \/ audited summary/);
});

test("OGE-62 separates clone permissions from final commit authority", () => {
  assert.match(workflow, /runtime-clones:[\s\S]*permissions:[\s\S]*contents:\s*read/);
  assert.match(workflow, /github-audit:[\s\S]*permissions:[\s\S]*contents:\s*read/);
  assert.match(workflow, /yellow-commit-gate:[\s\S]*permissions:[\s\S]*contents:\s*write/);
  assert.match(workflow, /commit_eligible == true/);
  assert.match(workflow, /git commit -m "chore\(oge-62\): retain audited 10\/10 flow evidence"/);
});

test("OGE-62 does not auto-retry failed audit", () => {
  assert.match(clone, /auto_retry: false/);
  assert.match(clone, /self_repair: false/);
  assert.match(audit, /AUDIT_FAILURE_REQUIRES_NEW_REVISION/);
  assert.doesNotMatch(workflow, /retry|rerun|re-run/i);
});
