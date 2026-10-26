import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digest, evaluateFinalIntake } from "../scripts/oge95-final-review-intake.mjs";
import { deriveStoneRunnerLearning, LEARNING_SCHEMA } from "../scripts/oge95-stone-runner-learning.mjs";

const historicalSource = JSON.parse(readFileSync("docs/evidence/oge-62-flow-audit-latest.json", "utf8"));
const historicalAudit = { ...historicalSource, canonical: { ...historicalSource.canonical, repository: "Wave-Runner-2/Build-Platform" } };
const sha = "a".repeat(40);
const audit = { ...historicalAudit, source_sha: sha, source_sha_attestation: { method: "CHECKED_OUT_GIT_HEAD_AND_GITHUB_SHA", exact_checkout_match: true,
  execution_mode: "SEQUENTIAL_TEN_PROCESS_REPLAY_ON_ONE_HOST", genuinely_parallel_runtime_jobs: false,
  independent_ai_provider_runs: false, authorization_to_commit_or_deploy: false },
  commit_manifest: { allowed: true, execution_approved: false } };
const make = (sourceSha = sha, reviewers = {}) => ({
  schema: "OGE95_FINAL_REVIEW_INTAKE_V1",
  source_sha: sourceSha,
  github_audit_sha256: digest(audit),
  github_audit: "PASS",
  reviewers: { manus: { state: "NOT_CONNECTED" }, openai: { state: "NOT_CONNECTED" }, ...reviewers },
  independent_ruby_verified: false,
  green_verified_promotion: false,
  yellow_commit_or_deploy_authority: "NOT_GRANTED"
});
const receipt = (provider, updates = {}) => ({
  schema: "OGE95_AGENT_REVIEW_V1", provider, source_sha: sha,
  audit_sha256: digest(audit), task_id: provider + "-independent-task",
  reviewer_actor: provider + "-reviewer", permission: "READ_ONLY",
  proof_ref: "https://example.org/proof/" + provider,
  result: "PASS", side_effects: false, ...updates
});

test("Runner keeps the existing 3-source final-fan-in placement, never becomes auto-authority", () => {
  const result = deriveStoneRunnerLearning({ sourceSha: sha, intake: make() });
  assert.equal(result.schema, LEARNING_SCHEMA);
  assert.match(result.placement, /RUNTIME_X10.*GITHUB_MANUS_OPENAI.*RUBY_YELLOW_GREEN/);
  assert.equal(result.observation_count, 1);
  assert.deepEqual([result.entries[0].github, result.entries[0].manus, result.entries[0].openai],
    ["PASS", "NOT_CONNECTED", "NOT_CONNECTED"]);
  assert.equal(result.permission_to_commit_or_deploy, "NOT_GRANTED");
  assert.equal(result.independent_ruby_verified, false);
  assert.equal(result.promoted_to_green_1lss, false);
  assert.equal(result.model_weights_updated, false);
  assert.ok(result.learning_candidates.every((x) => x.auto_execute === false));
});

test("Historic GitHub 10/10 does not become a current-SHA claim", () => {
  const input = evaluateFinalIntake({ audit: historicalAudit, sourceSha: sha });
  const result = deriveStoneRunnerLearning({ sourceSha: sha, intake: input });
  assert.equal(result.entries[0].github, "HISTORICAL_UNBOUND");
  assert.ok(result.learning_candidates.some((c) => c.code === "REQUIRE_CURRENT_SHA_GITHUB_AUDIT"));
});

test("Manus and OpenAI PASS become review evidence candidates, never learned truth", () => {
  const input = evaluateFinalIntake({
    audit, sourceSha: sha, writerActor: "independent-author",
    receipts: { manus: receipt("manus"), openai: receipt("openai") }
  });
  const result = deriveStoneRunnerLearning({ sourceSha: sha, intake: input });
  assert.equal(result.entries[0].manus, "PASS_UNATTESTED");
  assert.equal(result.entries[0].openai, "PASS_UNATTESTED");
  assert.ok(result.learning_candidates.some((x) => x.code === "VERIFY_PROVIDER_PROVENANCE_WITH_RUBY"));
  assert.equal(result.independent_ruby_verified, false);
});

test("Provider failure generates non-executing lesson, never green promotion", () => {
  const input = evaluateFinalIntake({
    audit, sourceSha: sha, receipts: { manus: receipt("manus", { result: "FAIL" }) }
  });
  const result = deriveStoneRunnerLearning({ sourceSha: sha, intake: input });
  assert.ok(result.learning_candidates.some((x) => x.code === "INVESTIGATE_REVIEW_CONFLICT"));
  assert.equal(result.permission_to_commit_or_deploy, "NOT_GRANTED");
});

test("Repeated observations dedupe; history strips untrusted prose and secret-like fields", () => {
  const first = deriveStoneRunnerLearning({ sourceSha: sha, intake: make() });
  const copied = structuredClone(first);
  copied.entries[0].private_prompt = "sk-please-do-not-retain";
  copied.entries[0].reason = "unsanitized full agent output";
  const second = deriveStoneRunnerLearning({ sourceSha: sha, intake: make(), previous: copied });
  assert.equal(second.entries.length, 1);
  assert.doesNotMatch(JSON.stringify(second), /sk-please-do-not-retain|unsanitized full agent/);
});

test("History is bounded to the newest 40 observations", () => {
  let previous = null;
  for (let i = 0; i < 50; i++) {
    const sourceSha = i.toString(16).padStart(40, "0");
    previous = deriveStoneRunnerLearning({ sourceSha, intake: make(sourceSha), previous });
  }
  assert.equal(previous.observation_count, 40);
  assert.equal(previous.entries[0].source_sha, (10).toString(16).padStart(40, "0"));
  assert.equal(previous.entries.at(-1).source_sha, (49).toString(16).padStart(40, "0"));
});

test("Rejects mismatched SHA, invalid reviewer state, forged approval and historical status", () => {
  for (const input of [
    { ...make(), source_sha: "b".repeat(40) },
    { ...make(), github_audit: "GITHUB_DID_EVERYTHING" },
    { ...make(), green_verified_promotion: true },
    { ...make(), independent_ruby_verified: true },
    { ...make(), yellow_commit_or_deploy_authority: "GRANTED" },
    { ...make(), reviewers: { manus: { state: "MAGIC_PASS" }, openai: { state: "NOT_CONNECTED" } } }
  ]) assert.throws(() => deriveStoneRunnerLearning({ sourceSha: sha, intake: input }));
});
