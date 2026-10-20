import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";

const taskId = String(process.env.WAVE_TASK_ID || "").trim();
const waveUrl = String(process.env.WAVE_URL || "https://wave.ogenicchocolate.com").replace(/\/$/, "");
const opsKey = String(process.env.OGENIC_OPS_KEY || "");
const configuredCodexHome = String(process.env.WAVE_CODEX_HOME_ACCOUNT_1 || "").trim();
const existingCodexHome = join(String(process.env.HOME || "/home/wave"), ".codex");
let codexHome = configuredCodexHome;
if (!codexHome) {
  try {
    accessSync(join(existingCodexHome, "auth.json"), constants.R_OK);
    codexHome = existingCodexHome;
  } catch { /* fail closed below */ }
}
const evidenceRef = String(process.env.WAVE_EVIDENCE_REF || "").slice(0, 300);
const workspace = process.cwd();

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}
if (!/^wavecmd_[a-f0-9]{64}$/.test(taskId)) fail("INVALID_TASK_ID");
if (!opsKey) fail("CONFIGURATION_REQUIRED:OGENIC_OPS_KEY");
if (!codexHome.startsWith("/")) fail("CONFIGURATION_REQUIRED:CODEX_LOGIN_CONTEXT");
if (process.env.GITHUB_REF_NAME !== "phase-vi-provider-incentive-metering") fail("ENVIRONMENT_SCOPE_MISMATCH");

async function api(path, body) {
  const response = await fetch(waveUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ogenic-ops-key": opsKey },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(String(json.code || ("HTTP_" + response.status)));
  return json;
}

const claim = await api("/api/wave/command/claim", { task_id: taskId });
const intent = String(claim.task?.intent || "").trim();
if (!intent) fail("APPROVED_INTENT_UNAVAILABLE");

const proofReadOnly = intent.startsWith("OGE129 READONLY PROOF:");
const sandboxMode = proofReadOnly ? "read-only" : "workspace-write";
const guard = [
  "Operate only in the current OGENIC staging checkout.",
  ...(proofReadOnly ? ["This is a read-only proof. Never modify any files, run installation commands, or change Git state."] : []),
  "Never touch main, production, Candy, D1 schema, billing, authentication, or secret values.",
  "Do not print environment variables or credentials.",
  "Make the smallest reversible change; run relevant tests; report exact evidence.",
  "Owner-approved command:",
  intent,
].join("\n");

if (proofReadOnly) process.stdout.write("WAVE_CONSUMER_READ_ONLY_SANDBOX=ENFORCED\n");
const run = spawnSync("codex", ["exec", "--sandbox", sandboxMode, "--skip-git-repo-check", guard], {
  cwd: workspace,
  // Do not leak Infisical/GitHub/Cloudflare/Owner credentials to the coding child.
  // Parent alone retains OGENIC_OPS_KEY to submit the command result receipt.
  env: Object.fromEntries([
    ...["PATH","HOME","USER","LOGNAME","SHELL","LANG","LC_ALL","LC_CTYPE","TMPDIR","TERM",
        "SSL_CERT_FILE","SSL_CERT_DIR"].filter((name) => typeof process.env[name] === "string")
      .map((name) => [name, process.env[name]]),
    ["CODEX_HOME", codexHome],
    ["OGENIC_EXECUTION_SCOPE", "staging-only"]
  ]),
  encoding: "utf8",
  timeout: 15 * 60 * 1000,
  maxBuffer: 1024 * 1024,
});
const combined = String(run.stdout || "") + "\n" + String(run.stderr || "");
const secretLike = /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9_]{12,}|bearer\s+[a-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i;
const status = run.status === 0 && !secretLike.test(combined) ? "DONE" : secretLike.test(combined) ? "BLOCKED" : "FAILED";
const resultHash = createHash("sha256").update(combined.slice(0, 1_000_000)).digest("hex");
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" });
const gitSha = String(git.stdout || "").trim();
await api("/api/wave/command/result", {
  task_id: taskId,
  status,
  result_sha256: resultHash,
  git_sha: gitSha,
  evidence_ref: evidenceRef,
});
process.stdout.write(JSON.stringify({ ok: status === "DONE", task_id: taskId, status, result_sha256: resultHash, git_sha: gitSha }) + "\n");
if (status !== "DONE") process.exit(1);
