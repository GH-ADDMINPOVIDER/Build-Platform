import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const EXPECTED = Array.from({ length: 10 }, (_, i) => `runtime-${String(i + 1).padStart(2, "0")}`);
const REPOSITORY = "Wave-Runner-2/Build-Platform";
const BRANCH = "Unified-on-Progress";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
function sha(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === "result.json") out.push(full);
  }
  return out;
}

const input = resolve(arg("input", "flow-runtime-results"));
const output = resolve(arg("output", "docs/evidence/oge-62-flow-audit-latest.json"));
const rows = walk(input).map((file) => JSON.parse(readFileSync(file, "utf8")));
const byId = new Map();
const errors = [];
const audit = [];

for (const row of rows) {
  if (byId.has(row.runtime_id)) errors.push(`DUPLICATE_RUNTIME:${row.runtime_id}`);
  byId.set(row.runtime_id, row);
}

for (const id of EXPECTED) {
  const row = byId.get(id);
  if (!row) {
    errors.push(`MISSING_RUNTIME:${id}`);
    audit.push({ runtime_id: id, audit: "FAIL", next_state: "REWORK_REQUIRED", reason: "MISSING_RESULT" });
    continue;
  }

  const expectedWorkDigest = sha(JSON.stringify({
    runtime_id: row.runtime_id,
    execution_profile: row.execution_profile,
    revision: row.revision,
    task_fingerprint: row.task_fingerprint,
    repository: row.repository,
    branch: row.branch
  }));
  const expectedEvidenceDigest = sha(JSON.stringify({
    runtime_id: row.runtime_id,
    revision: row.revision,
    work_digest: expectedWorkDigest,
    self_verify: row.self_verify,
    checks: row.self_checks
  }));

  const checks = {
    schema: row.schema === "OGE62_FLOW_RUNTIME_RESULT_V1",
    scope: row.repository === REPOSITORY && row.branch === BRANCH,
    provisional_state: row.state === "PROVISIONAL_DONE" && row.provisional_done === true && row.final_done === false,
    self_verify: row.self_verify === "PASS",
    digest_work: row.work_digest === expectedWorkDigest,
    digest_evidence: row.evidence_digest === expectedEvidenceDigest,
    no_provider_call: row.provider_call_attempted === false && row.paid_call_performed === false,
    no_canonical_write: row.canonical_write_attempted === false,
    no_d1_schema_write: row.d1_schema_write_attempted === false,
    no_secret_flag: row.secret_values_included === false,
    no_auto_retry: row.policy?.auto_retry === false,
    one_attempt: row.policy?.attempt_budget === 1,
    clone_scope: row.policy?.clone_close_scope === "OWN_PROVISIONAL_RESULT_ONLY"
  };
  const pass = Object.values(checks).every(Boolean);
  if (!pass) errors.push(`AUDIT_FAIL:${id}`);

  audit.push({
    runtime_id: id,
    revision: row.revision,
    execution_profile: row.execution_profile,
    self_verify: row.self_verify,
    audit: pass ? "PASS" : "FAIL",
    next_state: pass ? "FINAL_DONE" : "REWORK_REQUIRED",
    rework_revision: pass ? null : Number(row.revision || 1) + 1,
    evidence_digest: row.evidence_digest,
    checks
  });
}

if (rows.length !== 10) errors.push(`EXPECTED_10_RESULTS:FOUND_${rows.length}`);
const taskFingerprints = new Set(rows.map((row) => row.task_fingerprint));
if (taskFingerprints.size !== 1) errors.push(`TASK_FINGERPRINT_MISMATCH:FOUND_${taskFingerprints.size}`);
const evidenceDigests = rows.map((row) => row.evidence_digest);
if (new Set(evidenceDigests).size !== evidenceDigests.length) errors.push("EVIDENCE_DIGEST_NOT_UNIQUE");

const allPass = errors.length === 0 && audit.length === 10 && audit.every((row) => row.audit === "PASS");
const final = {
  schema: "OGE62_FLOW_AUDIT_V1",
  ok: allPass,
  state: allPass ? "FINAL_DONE" : "AUDIT_FAIL",
  audit_provider: "GITHUB_ACTIONS_DETERMINISTIC",
  expected_runtime_count: 10,
  provisional_done_count: rows.filter((row) => row.state === "PROVISIONAL_DONE").length,
  final_done_count: allPass ? 10 : audit.filter((row) => row.audit === "PASS").length,
  commit_eligible: allPass,
  canonical: {
    repository: REPOSITORY,
    branch: BRANCH,
    conversation: "owner-main",
    session_line: "1LSS_OWNER_MAIN"
  },
  authority: {
    clones_close_provisional_only: true,
    github_recheck: "REQUIRED",
    yellow_commit_gate: "REQUIRED",
    ruby_semantic_gate: "OPTIONAL_NEXT_LAYER",
    green_retention: "FINAL_DONE_ONLY"
  },
  audit,
  errors,
  commit_manifest: allPass ? {
    type: "AUDITED_SUMMARY_COMMIT",
    path: "docs/evidence/oge-62-flow-audit-latest.json",
    allowed: true,
    reason: "10_OF_10_GITHUB_AUDIT_PASS"
  } : {
    type: "NO_COMMIT",
    allowed: false,
    reason: "AUDIT_FAILURE_REQUIRES_NEW_REVISION"
  },
  generated_at: new Date().toISOString()
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(final, null, 2) + "\n");
process.stdout.write(JSON.stringify(final, null, 2) + "\n");
if (!allPass) process.exitCode = 1;
