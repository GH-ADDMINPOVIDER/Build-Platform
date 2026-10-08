// OGE-95: bounded, read-only fan-in. An LLM receipt is NOT authority to commit/deploy.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const REPO = "Ogenicchocolate21debug/Build-Platform";
export const BRANCH = "phase-vi-provider-incentive-metering";
const HASH = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const PROVIDERS = ["manus", "openai"];

export function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function validGitHubAudit(audit) {
  return audit?.schema === "OGE62_FLOW_AUDIT_V1" &&
    audit.ok === true && audit.state === "FINAL_DONE" &&
    audit.expected_runtime_count === 10 &&
    audit.provisional_done_count === 10 &&
    audit.final_done_count === 10 &&
    audit.commit_eligible === true &&
    audit.canonical?.repository === REPO &&
    audit.canonical?.branch === BRANCH &&
    Array.isArray(audit.audit) && audit.audit.length === 10 &&
    new Set(audit.audit.map((row) => row.runtime_id)).size === 10 &&
    Array.from({ length: 10 }, (_, i) => `runtime-${String(i + 1).padStart(2, "0")}`).every((id) => audit.audit.some((row) => row.runtime_id === id)) &&
    audit.audit.every((row) => row.audit === "PASS" && row.next_state === "FINAL_DONE") &&
    audit.commit_manifest?.allowed === true && Array.isArray(audit.errors) && audit.errors.length === 0;
}
function evaluateReceipt(receipt, provider, sourceSha, auditDigest, writer) {
  if (receipt == null) return { provider, state: "NOT_CONNECTED" };
  const fieldsValid = receipt.schema === "OGE95_AGENT_REVIEW_V1" &&
    receipt.provider === provider &&
    receipt.source_sha === sourceSha &&
    receipt.audit_sha256 === auditDigest &&
    typeof receipt.task_id === "string" && receipt.task_id.length > 3 &&
    typeof receipt.reviewer_actor === "string" && receipt.reviewer_actor.length > 2 &&
    receipt.reviewer_actor !== writer &&
    receipt.permission === "READ_ONLY" &&
    typeof receipt.proof_ref === "string" &&
    /^https:\/\/[^\s]+$/.test(receipt.proof_ref) &&
    (receipt.result === "PASS" || receipt.result === "FAIL" || receipt.result === "INCONCLUSIVE") &&
    receipt.side_effects === false &&
    (receipt.usage?.credits == null || (Number.isFinite(receipt.usage.credits) && receipt.usage.credits >= 0)) &&
    (receipt.usage?.total_tokens == null || (Number.isFinite(receipt.usage.total_tokens) && receipt.usage.total_tokens >= 0));
  if (!fieldsValid) return { provider, state: "REJECTED_INVALID_OR_MISMATCHED" };
  return {
    provider,
    state: receipt.result === "PASS" ? "PASS_UNATTESTED"
      : receipt.result === "FAIL" ? "REVIEW_FAIL" : "INCONCLUSIVE",
    task_id: receipt.task_id,
    proof_ref: receipt.proof_ref,
    note: "A matching self-reported receipt is not provider-attested or Ruby-verified."
  };
}
export function evaluateFinalIntake({ audit, sourceSha, writerActor = "unknown", receipts = {} }) {
  const validSha = typeof sourceSha === "string" && GIT_SHA.test(sourceSha);
  const structurallyValid = validGitHubAudit(audit) && validSha;
  // OGE-62 historical evidence lacks source_sha: never assign current SHA by assumption.
  // A free-floating source_sha string is not proof. Only accept the bounded
  // replay attestation generated after GitHub checks out and verifies HEAD.
  // The artifact remains reviewer evidence; Ruby still validates provenance.
  const attestation = audit?.source_sha_attestation;
  const exactShaBound = audit?.source_sha === sourceSha &&
    attestation?.method === "CHECKED_OUT_GIT_HEAD_AND_GITHUB_SHA" &&
    attestation?.exact_checkout_match === true &&
    attestation?.execution_mode === "SEQUENTIAL_TEN_PROCESS_REPLAY_ON_ONE_HOST" &&
    attestation?.genuinely_parallel_runtime_jobs === false &&
    attestation?.independent_ai_provider_runs === false &&
    attestation?.authorization_to_commit_or_deploy === false &&
    audit.commit_manifest?.execution_approved === false;
  const github = !structurallyValid ? "BLOCKED"
    : exactShaBound ? "PASS" : "HISTORICAL_UNBOUND";
  const auditSha = digest(audit);
  const reviewers = Object.fromEntries(PROVIDERS.map((p) =>
    [p, evaluateReceipt(receipts[p], p, sourceSha, auditSha, writerActor)]
  ));
  const results = Object.values(reviewers).map((x) => x.state);
  const state = github === "HISTORICAL_UNBOUND" ? "GITHUB_AUDIT_SHA_NOT_ATTESTED"
    : github !== "PASS" ? "BLOCKED_GITHUB_AUDIT"
    : results.some((s) => s === "REJECTED_INVALID_OR_MISMATCHED" || s === "REVIEW_FAIL")
      ? "REWORK_REQUIRED"
    : results.some((s) => s === "INCONCLUSIVE") ? "REVIEW_INCONCLUSIVE"
    : results.some((s) => s === "PASS_UNATTESTED") ? "AWAIT_RUBY_PROVENANCE"
    : "GITHUB_ONLY_NO_AGENT_REVIEW";
  return {
    schema: "OGE95_FINAL_REVIEW_INTAKE_V1",
    issue: "OGE-95",
    source_sha: validSha ? sourceSha : null,
    github_audit_sha256: auditSha,
    github_audit: github,
    reviewers,
    final_intake_state: state,
    independent_ruby_verified: false,
    yellow_commit_or_deploy_authority: "NOT_GRANTED",
    green_verified_promotion: false,
    note: "Read-only evidence intake. No provider invocation, approval, push, deploy, or D1 mutation."
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (name, fallback = "") => process.argv.find((s) => s.startsWith("--" + name + "="))?.slice(name.length + 3) ?? fallback;
  const audit = JSON.parse(readFileSync(arg("audit", "docs/evidence/oge-62-flow-audit-latest.json"), "utf8"));
  const receipts = {};
  for (const provider of PROVIDERS) {
    const path = arg(provider);
    if (path) receipts[provider] = JSON.parse(readFileSync(path, "utf8"));
  }
  const result = evaluateFinalIntake({
    audit, sourceSha: arg("sha", process.env.GITHUB_SHA ?? ""),
    writerActor: arg("writer", "unknown"), receipts
  });
  const json = JSON.stringify(result, null, 2) + "\n";
  const output = arg("output");
  if (output) writeFileSync(output, json);
  process.stdout.write(json);
  if (result.github_audit === "BLOCKED" || result.final_intake_state === "REWORK_REQUIRED") process.exitCode = 1;
}
