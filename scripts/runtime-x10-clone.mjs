import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const RUNTIME_IDS = new Set(Array.from({ length: 10 }, (_, i) => `runtime-${String(i + 1).padStart(2, "0")}`));
const PROFILES = new Set(["linearcodex", "codex", "claude"]);
const REPOSITORY = "GH-ADDMINPOVIDER/Build-Platform";
const BRANCH = "Unified-on-Progress";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
function clean(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

const runtimeId = clean(arg("runtime", process.env.OGENIC_RUNTIME_ID), 32).toLowerCase();
const profile = clean(arg("profile", process.env.OGENIC_RUNTIME_PROFILE), 32).toLowerCase();
if (!RUNTIME_IDS.has(runtimeId)) throw new Error(`UNKNOWN_RUNTIME:${runtimeId || "missing"}`);
if (!PROFILES.has(profile)) throw new Error(`UNKNOWN_PROFILE:${profile || "missing"}`);

const repository = clean(process.env.GITHUB_REPOSITORY || REPOSITORY, 220);
const branch = clean(process.env.GITHUB_REF_NAME || BRANCH, 220);
const task = process.env.OGENIC_AGENT_TASK || "";
const output = resolve(arg("output", `.ogenic-runtime/${runtimeId}/result.json`));

const result = {
  schema: "OGE61_RUNTIME_X10_RESULT_V1",
  ok: repository === REPOSITORY && branch === BRANCH,
  state: repository === REPOSITORY && branch === BRANCH ? "PREPARED" : "SCOPE_MISMATCH",
  runtime_id: runtimeId,
  execution_profile: profile,
  repository,
  branch,
  conversation: "owner-main",
  session_line: "1LSS_OWNER_MAIN",
  task_sha256: hash(task),
  run_id: clean(process.env.GITHUB_RUN_ID || "local", 120),
  run_attempt: clean(process.env.GITHUB_RUN_ATTEMPT || "1", 40),
  commit: clean(process.env.GITHUB_SHA || "unknown", 80),
  policy: {
    think_budget: 1,
    attempt_budget: 1,
    verify_budget: 1,
    auto_retry: false,
    self_repair: false,
    auto_strategy_switch: false,
    provider_fallback: "DENIED_WITHIN_ATTEMPT",
    canonical_write: "DENIED_FROM_CLONE",
    d1_schema_write: "DENIED",
    green_write: "SERIAL_REDUCER_AFTER_RUBY_ONLY"
  },
  artifact_only: true,
  provider_call_attempted: false,
  paid_call_performed: false,
  secret_values_included: false,
  created_at: new Date().toISOString()
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
process.stdout.write(JSON.stringify({ runtime_id: runtimeId, profile, state: result.state }) + "\n");
if (!result.ok) process.exitCode = 1;
