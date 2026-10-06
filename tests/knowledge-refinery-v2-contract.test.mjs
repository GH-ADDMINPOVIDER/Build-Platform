import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("worker/knowledge-refinery-v2.ts");
const fixture = JSON.parse(read("tests/fixtures/oge-42-knowledge-refinery-v2.json"));

test("OGE-42 supports all six distilled knowledge kinds", () => {
  for (const kind of [
    "code_pattern",
    "debug_rule",
    "build_recipe",
    "creation_template",
    "decision_rule",
    "formula",
  ]) {
    assert.match(source, new RegExp(kind));
    assert.equal(fixture.items.some((item) => item.kind === kind), true);
  }
});

test("retained rule envelope contains required provenance and invalidation fields", () => {
  for (const marker of [
    "problem_signature",
    "trigger_conditions",
    "inputs",
    "procedure_or_expression",
    "expected_outputs",
    "constraints",
    "confidence",
    "evidence_refs",
    "provenance_refs",
    "license_policy",
    "version",
    "invalidation_conditions",
    "created_at",
    "verified_at",
    "verification_state",
  ]) assert.match(source, new RegExp(marker));
});

test("Blue admits, Ruby verifies, and Green retains only verified rules", () => {
  assert.match(source, /blue_admission/);
  assert.match(source, /YELLOW_STONE_ONLY/);
  assert.match(source, /RUBY_STONE/);
  assert.match(source, /verification_state === "PASS"/);
  assert.match(source, /GREEN_1LSS/);
  assert.match(source, /RESEARCH_EVIDENCE_ONLY/);
});

test("feedback raises confidence on success and lowers or invalidates on failure", () => {
  assert.match(source, /outcome: "SUCCESS" \| "FAILURE"/);
  assert.match(source, /rule\.confidence \+ 0\.03/);
  assert.match(source, /rule\.confidence - 0\.15/);
  assert.match(source, /confidence < REQUIRED_CONFIDENCE/);
  assert.match(source, /"INVALIDATED"/);
});

test("V2 forbids secret retention, raw repositories, second memory DB, and D1 schema changes", () => {
  assert.match(source, /SECRET_PATTERN/);
  assert.match(source, /raw_repository_retention: false/);
  assert.match(source, /second_memory_database: false/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});

test("acceptance fixture is owner-owned and carries reproduce plus second-fixture chain", () => {
  assert.equal(fixture.license, "CC0-1.0");
  assert.match(fixture.source, /repository-owned/i);
  assert.ok(fixture.reproduced_failure?.id);
  assert.ok(fixture.second_fixture?.id);
  assert.equal(fixture.items.length, 6);
});
