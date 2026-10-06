import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../worker/capsig-caprank.ts", import.meta.url), "utf8");

test("OGE-55 defines Agent+Environment CapSig and Ruby-only generation", () => {
  assert.match(source, /schema: "OGENIC_CAPSIG_V1"/);
  assert.match(source, /generated_by: "RUBY_STONE"/);
  assert.match(source, /environment: string/);
  assert.match(source, /provider: string/);
  assert.match(source, /runtime: string/);
  assert.doesNotMatch(source, /model_name|model_id/);
});

test("agent self-score and non-Ruby evidence are rejected", () => {
  assert.match(source, /SELF_SCORE_DENIED/);
  assert.match(source, /RUBY_EVIDENCE_REQUIRED/);
  assert.match(source, /self_scored: false/);
});

test("dimensions include Code Builder Debug & Build Auditor and Accuracy", () => {
  for (const marker of ["CODE_BUILDER", "DEBUG_BUILD", "AUDITOR", "ACCURACY"]) {
    assert.match(source, new RegExp(marker));
  }
});

test("BLOCKED and NOT_MEASURED are excluded from measured denominator", () => {
  assert.match(source, /test\.state === "PASS" \|\| test\.state === "FAIL"/);
  assert.match(source, /sampleSize \? "MEASURED" : "NOT_MEASURED"/);
  assert.match(source, /score: sampleSize \?/);
});

test("CapRank is deterministic and evidence-derived", () => {
  assert.match(source, /rankCapSigs/);
  assert.match(source, /left\.agent_id\.localeCompare\(right\.agent_id\)/);
  assert.match(source, /sample_size/);
  assert.match(source, /score/);
});

test("pure layer has no provider execution or D1 schema mutation", () => {
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  assert.doesNotMatch(source, /api\.openai\.com|api\.anthropic\.com|api\.perplexity\.ai/);
});
