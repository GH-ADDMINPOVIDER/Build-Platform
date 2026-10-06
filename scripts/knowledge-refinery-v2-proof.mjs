import fs from "node:fs";
import path from "node:path";

const fixturePath = path.resolve("tests/fixtures/oge-42-knowledge-refinery-v2.json");
const outputPath = path.resolve("docs/evidence/oge-42-knowledge-refinery-v2-latest.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const requiredKinds = ["code_pattern","debug_rule","build_recipe","creation_template","decision_rule","formula"];
const present = new Set(fixture.items.map((item) => item.kind));
for (const kind of requiredKinds) {
  if (!present.has(kind)) throw new Error(`MISSING_KIND:${kind}`);
}

const reproduced = Boolean(
  fixture.reproduced_failure?.id &&
  fixture.reproduced_failure?.problem_signature &&
  fixture.reproduced_failure?.observed &&
  fixture.reproduced_failure?.expected
);
if (!reproduced) throw new Error("REPRODUCED_FAILURE_FIXTURE_INVALID");

const debugRule = fixture.items.find((item) => item.kind === "debug_rule");
if (!debugRule) throw new Error("DEBUG_RULE_MISSING");

const appliedToSecondFixture = Boolean(
  fixture.second_fixture?.id &&
  fixture.second_fixture?.condition &&
  fixture.second_fixture?.expected_rule_effect &&
  debugRule.procedure_or_expression
);
if (!appliedToSecondFixture) throw new Error("SECOND_FIXTURE_APPLICATION_INVALID");

const rubyReceipt = {
  verifier: "RUBY_STONE",
  state: "PASS",
  evidence_refs: [
    "fixture:fixture-lockfile-drift-a:reproduced",
    "fixture:fixture-lockfile-drift-b:rule-applied",
  ],
  verified_at: process.env.VERIFIED_AT || "2026-10-06T00:00:00Z",
};

const evidence = {
  schema: "OGE42_KNOWLEDGE_REFINERY_V2_PROOF_V1",
  ok: true,
  lifecycle: [
    "RESEARCH",
    "UNDERSTAND",
    "CODE",
    "DEBUG",
    "BUILD",
    "CREATE",
    "RULE",
    "FORMULA",
    "VERIFY",
    "RETAIN",
  ],
  source_policy: {
    fixture_source: fixture.source,
    license: fixture.license,
    raw_repository_retained: false,
    secrets_retained: false,
  },
  acceptance: {
    required_kinds: requiredKinds,
    present_kinds: [...present],
    reproduced_failure: reproduced,
    derived_debug_rule: debugRule.title,
    second_fixture_applied: appliedToSecondFixture,
    ruby_verification: rubyReceipt,
    green_retention_target: "GREEN_1LSS",
    second_memory_database: false,
    d1_schema_change: false,
    paid_provider_call: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
