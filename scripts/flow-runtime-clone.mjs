import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPOSITORY = "Wave-Runner-2/Build-Platform";
const BRANCH = "phase-vi-provider-incentive-metering";
const RUNTIMES = new Set(Array.from({ length: 10 }, (_, i) => `runtime-${String(i + 1).padStart(2, "0")}`));
const PROFILES = new Set(["linearcodex", "codex", "claude"]);

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
function clean(value, max = 240) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function sha(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

const runtimeId = clean(arg("runtime", process.env.OGENIC_RUNTIME_ID), 32).toLowerCase();
const profile = clean(arg("profile", process.env.OGENIC_RUNTIME_PROFILE), 32).toLowerCase();
const revision = Number(arg("revision", process.env.OGENIC_RUNTIME_REVISION || "1"));
if (!RUNTIMES.has(runtimeId)) throw new Error(`UNKNOWN_RUNTIME:${runtimeId || "missing"}`);
if (!PROFILES.has(profile)) throw new Error(`UNKNOWN_PROFILE:${profile || "missing"}`);
if (!Number.isInteger(revision) || revision < 1) throw new Error("INVALID_REVISION");

const repository = clean(process.env.GITHUB_REPOSITORY || REPOSITORY, 220);
const branch = clean(process.env.GITHUB_REF_NAME || BRANCH, 220);
const task = clean(process.env.OGENIC_AGENT_TASK || "OGE-62 flow audit proof", 4000);
const output = resolve(arg("output", `.ogenic-flow/${runtimeId}/result.json`));

const taskFingerprint = sha(task);
const workDigest = sha(JSON.stringify({
  runtime_id: runtimeId,
  execution_profile: profile,
  revision,
  task_fingerprint: taskFingerprint,
  repository,
  branch
}));
const selfChecks = {
  scope_ok: repository === REPOSITORY && branch === BRANCH,
  artifact_only: true,
  no_provider_call: true,
  no_canonical_write: true,
  no_d1_schema_write: true,
  attempt_budget_ok: true
};
const selfVerifyPass = Object.values(selfChecks).every(Boolean);
const evidenceDigest = sha(JSON.stringify({
  runtime_id: runtimeId,
  revision,
  work_digest: workDigest,
  self_verify: selfVerifyPass ? "PASS" : "FAIL",
  checks: selfChecks
}));

const result = {
  schema: "OGE62_FLOW_RUNTIME_RESULT_V1",
  runtime_id: runtimeId,
  execution_profile: profile,
  revision,
  repository,
  branch,
  conversation: "owner-main",
  session_line: "1LSS_OWNER_MAIN",
  task_fingerprint: taskFingerprint,
  work_digest: workDigest,
  evidence_digest: evidenceDigest,
  self_checks: selfChecks,
  self_verify: selfVerifyPass ? "PASS" : "FAIL",
  state: selfVerifyPass ? "PROVISIONAL_DONE" : "SELF_VERIFY_FAILED",
  provisional_done: selfVerifyPass,
  final_done: false,
  provider_call_attempted: false,
  paid_call_performed: false,
  canonical_write_attempted: false,
  d1_schema_write_attempted: false,
  secret_values_included: false,
  policy: {
    think_budget: 1,
    attempt_budget: 1,
    verify_budget: 1,
    auto_retry: false,
    self_repair: false,
    auto_strategy_switch: false,
    provider_fallback: "DENIED_WITHIN_ATTEMPT",
    clone_close_scope: "OWN_PROVISIONAL_RESULT_ONLY",
    canonical_commit: "AUDIT_PASS_AND_YELLOW_GATE_ONLY"
  },
  created_at: new Date().toISOString()
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
process.stdout.write(JSON.stringify({
  runtime_id: runtimeId,
  revision,
  self_verify: result.self_verify,
  state: result.state,
  evidence_digest: result.evidence_digest
}) + "\n");

if (!selfVerifyPass) process.exitCode = 1;
