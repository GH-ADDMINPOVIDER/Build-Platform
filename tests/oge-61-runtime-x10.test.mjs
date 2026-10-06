import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/oge-61-runtime-x10-proof.yml", "utf8");
const clone = readFileSync("scripts/runtime-x10-clone.mjs", "utf8");
const reducer = readFileSync("scripts/reduce-runtime-x10.mjs", "utf8");

test("OGE-61 declares ten unique clones and max-parallel ten", () => {
  assert.match(workflow, /max-parallel:\s*10/);
  for (let i = 1; i <= 10; i += 1) {
    const id = `runtime-${String(i).padStart(2, "0")}`;
    assert.match(workflow, new RegExp(`runtime_id: ${id}`));
  }
  assert.equal((workflow.match(/runtime_id: runtime-/g) || []).length, 10);
});

test("OGE-61 clones cannot write canonical state or spend provider tokens", () => {
  assert.match(clone, /canonical_write: "DENIED_FROM_CLONE"/);
  assert.match(clone, /d1_schema_write: "DENIED"/);
  assert.match(clone, /provider_call_attempted: false/);
  assert.match(clone, /paid_call_performed: false/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /git\s+push/i);
  assert.doesNotMatch(workflow, /wrangler\s+deploy/i);
});

test("OGE-61 reducer requires exactly ten unique runtime results", () => {
  assert.match(reducer, /expected_runtime_count: 10/);
  assert.match(reducer, /verified_runtime_count/);
  assert.match(reducer, /EXPECTED_10_RESULTS/);
  assert.match(reducer, /RUNTIME_ID_NOT_UNIQUE/);
  assert.match(reducer, /RUNTIME_X10_VERIFIED/);
});

test("OGE-61 preserves one-pass authority boundaries", () => {
  assert.match(clone, /attempt_budget: 1/);
  assert.match(clone, /auto_retry: false/);
  assert.match(clone, /provider_fallback: "DENIED_WITHIN_ATTEMPT"/);
  assert.match(clone, /green_write: "SERIAL_REDUCER_AFTER_RUBY_ONLY"/);
  assert.match(reducer, /yellow_execution_authority: "SOLE"/);
  assert.match(reducer, /ruby_verify_before_green: true/);
});
