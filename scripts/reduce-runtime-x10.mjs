import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const EXPECTED = Array.from({ length: 10 }, (_, i) => `runtime-${String(i + 1).padStart(2, "0")}`);
const REPOSITORY = "GH-ADDMINPOVIDER/Build-Platform";
const BRANCH = "Unified-on-Progress";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
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

const input = resolve(arg("input", "runtime-x10-results"));
const output = resolve(arg("output", "docs/evidence/oge-61-runtime-x10-latest.json"));
const rows = walk(input).map((file) => JSON.parse(readFileSync(file, "utf8")));
const byId = new Map(rows.map((row) => [row.runtime_id, row]));
const errors = [];

for (const id of EXPECTED) {
  const row = byId.get(id);
  if (!row) {
    errors.push(`MISSING:${id}`);
    continue;
  }
  if (row.schema !== "OGE61_RUNTIME_X10_RESULT_V1") errors.push(`SCHEMA:${id}`);
  if (row.repository !== REPOSITORY || row.branch !== BRANCH) errors.push(`SCOPE:${id}`);
  if (row.state !== "PREPARED" || row.ok !== true) errors.push(`STATE:${id}`);
  if (row.provider_call_attempted !== false || row.paid_call_performed !== false) errors.push(`PROVIDER_CALL:${id}`);
  if (row.artifact_only !== true) errors.push(`ARTIFACT_POLICY:${id}`);
  if (row.policy?.canonical_write !== "DENIED_FROM_CLONE") errors.push(`CANONICAL_WRITE:${id}`);
  if (row.policy?.d1_schema_write !== "DENIED") errors.push(`D1_WRITE:${id}`);
  if (row.secret_values_included !== false) errors.push(`SECRET_FLAG:${id}`);
}

if (rows.length !== 10) errors.push(`EXPECTED_10_RESULTS:FOUND_${rows.length}`);
if (new Set(rows.map((row) => row.runtime_id)).size !== 10) errors.push("RUNTIME_ID_NOT_UNIQUE");

const evidence = {
  schema: "OGE61_RUNTIME_X10_REDUCER_V1",
  ok: errors.length === 0,
  state: errors.length === 0 ? "RUNTIME_X10_VERIFIED" : "BLOCKED",
  expected_runtime_count: 10,
  verified_runtime_count: EXPECTED.filter((id) => byId.has(id)).length,
  max_parallel_target: 10,
  canonical: {
    repository: REPOSITORY,
    branch: BRANCH,
    conversation: "owner-main",
    session_line: "1LSS_OWNER_MAIN"
  },
  authority: {
    clone_canonical_write: "DENIED",
    yellow_execution_authority: "SOLE",
    ruby_verify_before_green: true
  },
  runtimes: EXPECTED.map((id) => {
    const row = byId.get(id);
    return row ? {
      runtime_id: id,
      execution_profile: row.execution_profile,
      state: row.state,
      provider_call_attempted: row.provider_call_attempted,
      artifact_only: row.artifact_only,
      commit: row.commit
    } : { runtime_id: id, state: "MISSING" };
  }),
  errors,
  generated_at: new Date().toISOString()
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
if (!evidence.ok) process.exitCode = 1;
