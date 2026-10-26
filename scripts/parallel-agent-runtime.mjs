import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CANONICAL_REPOSITORY = "Wave-Runner-2/Build-Platform";
const CANONICAL_BRANCH = "phase-vi-provider-incentive-metering";
const WORKERS = new Set(["linearcodex", "codex", "claude"]);

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function bool(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function safe(value, max = 240) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function taskHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function secretLike(value) {
  const text = String(value ?? "");
  return /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i.test(text);
}

function outputPath(worker) {
  return resolve(arg("output", `.ogenic-agent/${worker}/result.json`));
}

function writeResult(worker, patch = {}) {
  const task = process.env.OGENIC_AGENT_TASK || "";
  const repository = safe(process.env.GITHUB_REPOSITORY || CANONICAL_REPOSITORY, 220);
  const branch = safe(process.env.GITHUB_REF_NAME || CANONICAL_BRANCH, 220);
  const base = {
    schema: "OGE47_PARALLEL_AGENT_RESULT_V1",
    worker,
    repository,
    branch,
    conversation: "owner-main",
    session_line: "1LSS_OWNER_MAIN",
    run_id: safe(process.env.GITHUB_RUN_ID || "local", 120),
    run_attempt: safe(process.env.GITHUB_RUN_ATTEMPT || "1", 40),
    commit: safe(process.env.GITHUB_SHA || "unknown", 80),
    task_sha256: taskHash(task),
    artifact_only: true,
    canonical_write_attempted: false,
    d1_schema_write_attempted: false,
    secret_values_included: false,
    provider_call_attempted: false,
    created_at: new Date().toISOString(),
    ...patch,
  };

  if (repository !== CANONICAL_REPOSITORY || branch !== CANONICAL_BRANCH) {
    base.state = "SCOPE_MISMATCH";
    base.ok = false;
    base.reason = "CANONICAL_SCOPE_REQUIRED";
  }
  if (secretLike(JSON.stringify(base))) {
    throw new Error("SECRET_LIKE_RESULT_REJECTED");
  }

  const target = outputPath(worker);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(base, null, 2) + "\n");
  return base;
}

function requireWorker() {
  const worker = safe(arg("worker", process.env.AI_WORKER_NAME), 80).toLowerCase();
  if (!WORKERS.has(worker)) throw new Error(`UNKNOWN_WORKER:${worker || "missing"}`);
  return worker;
}

function prepare(worker) {
  const executeRequested = bool(process.env.OGENIC_PARALLEL_EXECUTE);
  const common = {
    ok: true,
    state: "PREPARED",
    mode: executeRequested ? "EXECUTE_REQUESTED" : "DRY_RUN",
    paid_call_performed: false,
  };

  if (worker === "linearcodex") {
    const contract = "workflows/linear-codex-draft-pr.v1.json";
    return writeResult(worker, {
      ...common,
      execution_surface: "LINEAR_CODEX_WORKFLOW_CONTRACT",
      contract_present: existsSync(contract),
      executable_from_github_runner: false,
      execute_gate: "CONFIGURATION_REQUIRED:LINEAR_CODEX_EXECUTION_ADAPTER",
    });
  }

  if (worker === "codex") {
    const runner = "scripts/openai-agent-full.mjs";
    return writeResult(worker, {
      ...common,
      execution_surface: "OPENAI_AGENT_SESSION_EXISTING_RUNNER",
      runner_present: existsSync(runner),
      executable_from_github_runner: existsSync(runner),
      credential_name: "OPENAI_API_KEY",
    });
  }

  return writeResult(worker, {
    ...common,
    execution_surface: "ANTHROPIC_CLAUDE_CODE_CLI",
    executable_from_github_runner: true,
    credential_names: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    model: "claude-sonnet-5",
    permission_mode: "plan",
  });
}

function configRequired(worker) {
  const missing = safe(arg("missing", "EXECUTION_ADAPTER"), 120);
  const result = writeResult(worker, {
    ok: false,
    state: "CONFIGURATION_REQUIRED",
    mode: "EXECUTE",
    reason: `CONFIGURATION_REQUIRED:${missing}`,
    provider_call_attempted: false,
    paid_call_performed: false,
  });
  process.stdout.write(JSON.stringify({ worker, state: result.state, reason: result.reason }) + "\n");
  process.exitCode = 2;
}

function record(worker) {
  const exitCode = Number(arg("exit-code", "1"));
  const runtime = safe(arg("runtime", "UNKNOWN_RUNTIME"), 160);
  const providerCallAttempted = bool(arg("provider-call-attempted", "1"));
  const state = exitCode === 0 ? "COMPLETE" : "FAILED";
  const result = writeResult(worker, {
    ok: exitCode === 0,
    state,
    mode: "EXECUTE",
    runtime,
    provider_call_attempted: providerCallAttempted,
    paid_call_performed: providerCallAttempted,
    exit_code: Number.isFinite(exitCode) ? exitCode : 1,
    diagnostic: exitCode === 0 ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED_SEE_PRIVATE_JOB_LOG",
  });
  process.stdout.write(JSON.stringify({ worker, state: result.state, runtime: result.runtime }) + "\n");
}

function inspectContract() {
  const path = "workflows/linear-codex-draft-pr.v1.json";
  if (!existsSync(path)) return { present: false };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return {
    present: true,
    id: safe(parsed.id, 120),
    version: Number(parsed.version ?? 0),
    has_codex_patch_node: JSON.stringify(parsed).includes("codex.patch@1"),
    has_linear_attach_node: JSON.stringify(parsed).includes("linear.attach_pr@1"),
  };
}

const action = safe(process.argv[2] || "prepare", 80).toLowerCase();
const worker = requireWorker();

if (process.env.OGENIC_AGENT_TASK && secretLike(process.env.OGENIC_AGENT_TASK)) {
  writeResult(worker, {
    ok: false,
    state: "REJECTED",
    mode: "NO_CALL",
    reason: "SECRET_LIKE_TASK_REJECTED",
    provider_call_attempted: false,
    paid_call_performed: false,
  });
  process.exit(3);
}

if (action === "prepare") {
  const result = prepare(worker);
  if (worker === "linearcodex") result.contract = inspectContract();
  process.stdout.write(JSON.stringify({ worker, state: result.state, mode: result.mode }) + "\n");
} else if (action === "config-required") {
  configRequired(worker);
} else if (action === "record") {
  record(worker);
} else {
  throw new Error(`UNKNOWN_ACTION:${action}`);
}
