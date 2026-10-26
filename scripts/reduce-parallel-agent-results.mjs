import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const EXPECTED = ["linearcodex", "codex", "claude"];
const CANONICAL_REPOSITORY = "Wave-Runner-2/Build-Platform";
const CANONICAL_BRANCH = "phase-vi-provider-incentive-metering";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (name.isFile() && name.name === "result.json") out.push(full);
  }
  return out;
}

function secretLike(value) {
  return /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i.test(String(value ?? ""));
}

const inputDir = resolve(arg("input", "parallel-agent-results"));
const output = resolve(arg("output", "docs/evidence/oge-47-parallel-agent-runtime-latest.json"));
const mode = String(arg("mode", "dry-run")).toLowerCase();

const files = walk(inputDir);
const parsed = [];
for (const file of files) {
  try {
    parsed.push(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    parsed.push({ schema: "INVALID", worker: "unknown", state: "INVALID_JSON", source_file: file });
  }
}

const byWorker = new Map();
for (const row of parsed) {
  if (!byWorker.has(row.worker)) byWorker.set(row.worker, []);
  byWorker.get(row.worker).push(row);
}

const errors = [];
for (const worker of EXPECTED) {
  const rows = byWorker.get(worker) ?? [];
  if (rows.length !== 1) errors.push(`EXPECTED_ONE_RESULT:${worker}:FOUND_${rows.length}`);
}
for (const row of parsed) {
  if (row.schema !== "OGE47_PARALLEL_AGENT_RESULT_V1") errors.push(`INVALID_SCHEMA:${row.worker ?? "unknown"}`);
  if (row.repository !== CANONICAL_REPOSITORY) errors.push(`REPOSITORY_SCOPE_MISMATCH:${row.worker ?? "unknown"}`);
  if (row.branch !== CANONICAL_BRANCH) errors.push(`BRANCH_SCOPE_MISMATCH:${row.worker ?? "unknown"}`);
  if (row.canonical_write_attempted !== false) errors.push(`CANONICAL_WRITE_FROM_WORKER:${row.worker ?? "unknown"}`);
  if (row.d1_schema_write_attempted !== false) errors.push(`D1_SCHEMA_WRITE_FROM_WORKER:${row.worker ?? "unknown"}`);
  if (row.secret_values_included !== false) errors.push(`SECRET_FLAGGED:${row.worker ?? "unknown"}`);
  if (secretLike(JSON.stringify(row))) errors.push(`SECRET_LIKE_OUTPUT:${row.worker ?? "unknown"}`);
}

const proposed = new Map();
const conflicts = [];
for (const row of parsed) {
  for (const path of Array.isArray(row.proposed_paths) ? row.proposed_paths : []) {
    const key = String(path);
    if (proposed.has(key) && proposed.get(key) !== row.worker) {
      conflicts.push({ path: key, workers: [proposed.get(key), row.worker] });
    } else {
      proposed.set(key, row.worker);
    }
  }
}
if (conflicts.length) errors.push("PROPOSED_PATH_CONFLICT");

const dryRunReady = mode === "dry-run" && EXPECTED.every((worker) => {
  const row = (byWorker.get(worker) ?? [])[0];
  return row?.state === "PREPARED" && row?.provider_call_attempted === false;
});

const executeComplete = mode === "execute" && EXPECTED.every((worker) => {
  const row = (byWorker.get(worker) ?? [])[0];
  return row?.state === "COMPLETE";
});

const ok = errors.length === 0 && (dryRunReady || executeComplete);
const state = ok
  ? mode === "dry-run" ? "DRY_RUN_VERIFIED" : "EXECUTION_VERIFIED"
  : parsed.some((row) => row.state === "CONFIGURATION_REQUIRED")
    ? "CONFIGURATION_REQUIRED"
    : "BLOCKED";

const evidence = {
  schema: "OGE47_PARALLEL_AGENT_REDUCER_V1",
  ok,
  state,
  mode,
  canonical: {
    repository: CANONICAL_REPOSITORY,
    branch: CANONICAL_BRANCH,
    conversation: "owner-main",
    session_line: "1LSS_OWNER_MAIN",
  },
  policy: {
    worker_canonical_writes: "DENIED",
    worker_d1_schema_writes: "DENIED",
    reducer_is_serial: true,
    paid_readiness_probe: false,
  },
  workers: EXPECTED.map((worker) => {
    const row = (byWorker.get(worker) ?? [])[0] ?? null;
    return row ? {
      worker: row.worker,
      state: row.state,
      mode: row.mode,
      execution_surface: row.execution_surface ?? null,
      provider_call_attempted: row.provider_call_attempted === true,
      artifact_only: row.artifact_only === true,
      task_sha256: row.task_sha256 ?? null,
      commit: row.commit ?? null,
      reason: row.reason ?? null,
    } : { worker, state: "MISSING" };
  }),
  conflicts,
  errors,
  secret_values_included: false,
  generated_at: new Date().toISOString(),
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");

if (!ok) process.exitCode = 1;
