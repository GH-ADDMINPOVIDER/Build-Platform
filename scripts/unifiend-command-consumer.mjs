import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";
import { bearerCredentialPattern } from "./unifiend-consumer-secret-guard.mjs";

const taskId = String(process.env.UNIFIEND_TASK_ID || "").trim();
const unifiendUrl = String(process.env.UNIFIEND_URL || "https://wave.ogenicchocolate.com").replace(/\/$/, "");
const opsKey = String(process.env.OGENIC_OPS_KEY || "");
// Owner route selection: GS is the ONLY Unifiend Terminal executor while the
// GT/Go Codex lane is parked. Retain TS/GT profiles; do not alter their auth.
// Ignore the legacy Infisical profile override for command execution; it could
// otherwise silently select a different signed-in account.
const codexHome = "/home/wave/.codex";
const expectedGsIdentityHash = "8bbd06e2d6ece81d6aa072621f55c87ccdac79f6108bf7f42b75eb4596aa3f53";
const evidenceRef = String(process.env.UNIFIEND_EVIDENCE_REF || "").slice(0, 300);
const workspace = process.cwd();

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}
if (!/^wavecmd_[a-f0-9]{64}$/.test(taskId)) fail("INVALID_TASK_ID");
if (!opsKey) fail("CONFIGURATION_REQUIRED:OGENIC_OPS_KEY");
if (!codexHome.startsWith("/")) fail("CONFIGURATION_REQUIRED:CODEX_LOGIN_CONTEXT");
// Confirm that the existing CLI profile still belongs to GPT_GS_CODEX; mere
// directory presence or paid-plan assumptions are not authentication.
try {
  const authPath = join(codexHome, "auth.json");
  accessSync(authPath, constants.R_OK);
  const auth = JSON.parse(readFileSync(authPath, "utf8"));
  const idToken = auth.tokens?.id_token;
  if (typeof idToken !== "string" || idToken.split(".").length !== 3) throw new Error("metadata");
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const identityHash = createHash("sha256").update(email).digest("hex");
  if (identityHash !== expectedGsIdentityHash) throw new Error("identity");
} catch {
  fail("CODEX_GS_PROFILE_NOT_VERIFIED");
}
process.stdout.write("UNIFIEND_CONSUMER_CODEX_IDENTITY=GPT_GS_CODEX\\n".replace("\\n", "\n"));
if (process.env.GITHUB_REF_NAME !== "Unified-on-Progress") fail("ENVIRONMENT_SCOPE_MISMATCH");

async function api(path, body) {
  const response = await fetch(unifiendUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ogenic-ops-key": opsKey },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(String(json.code || ("HTTP_" + response.status)));
  return json;
}

const claim = await api("/api/unifiend/command/claim", { task_id: taskId });
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

if (proofReadOnly) process.stdout.write("UNIFIEND_CONSUMER_READ_ONLY_SANDBOX=ENFORCED\n");
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
// Reject actual credential patterns, not ordinary words ending in "sk-" such
// as "task-identifiers". Never print matched text or protected CLI output.
const protectedMarkers = [
  ["openai_key", /(?:^|[^a-z0-9_])sk-[a-z0-9_-]{12,}/i],
  ["github_token", /(?:^|[^a-z0-9_])gh[pousr]_[a-z0-9_]{12,}/i],
  ["bearer_token", bearerCredentialPattern],
  ["pem_private_key", /BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY/i],
];
// Distinguish the Codex answer channel from CLI diagnostics before considering
// any filter change. Only classes are logged; never token values or output.
const stdoutText = String(run.stdout || "");
const stderrText = String(run.stderr || "");
const stdoutGuardClasses = protectedMarkers.filter(([, expression]) => expression.test(stdoutText)).map(([label]) => label);
const stderrGuardClasses = protectedMarkers.filter(([, expression]) => expression.test(stderrText)).map(([label]) => label);
// Only stdout is the Codex result channel. CLI stderr is captured internally,
// never emitted or persisted as plaintext; do not fail a completed command
// because internal CLI authentication diagnostics contain Bearer-shaped text.
// Protected stdout still fails closed, regardless of the Codex exit code.
const guardClasses = stdoutGuardClasses;
const guarded = guardClasses.length !== 0;
const status = guarded ? "BLOCKED" : run.status === 0 ? "DONE" : "FAILED";
if (guarded || stderrGuardClasses.length) process.stdout.write("UNIFIEND_CONSUMER_GUARD_CHANNELS=" +
  JSON.stringify({ stdout_classes: stdoutGuardClasses, stderr_classes: stderrGuardClasses }) + "\n");
if (stderrGuardClasses.length) process.stdout.write("UNIFIEND_CONSUMER_INTERNAL_STDERR_REDACTED=YES\n");
if (status !== "DONE") {
  // Only category and numeric exit status are safe to expose as diagnostics.
  process.stderr.write("UNIFIEND_CONSUMER_SAFE_FAILURE=" +
    JSON.stringify({ code: run.status, signal: run.signal, guard_classes: guardClasses }) + "\n");
}
const resultHash = createHash("sha256").update(combined.slice(0, 1_000_000)).digest("hex");
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" });
const gitSha = String(git.stdout || "").trim();
await api("/api/unifiend/command/result", {
  task_id: taskId,
  status,
  result_sha256: resultHash,
  git_sha: gitSha,
  evidence_ref: evidenceRef,
});
// A success is accepted only after the SAME D1 receipt has been read back
// through an authenticated signed Owner Session; submitting a result is not proof.
if (proofReadOnly && status === "DONE") {
  const signed = await fetch(unifiendUrl + "/api/session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ogenic-client": "native" },
    body: JSON.stringify({ owner_key: opsKey }),
    redirect: "error",
  }).catch(() => null);
  const session = signed?.status === 200 ? await signed.json().catch(() => ({})) : {};
  const token = typeof session.session_token === "string" && session.authenticated === true ? session.session_token : "";
  if (!token) fail("OWNER_SIGNED_RESULT_READBACK_AUTH_FAILED");
  let readbackProven = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(unifiendUrl + "/api/unifiend/command/status?task_id=" + encodeURIComponent(taskId), {
      headers: { authorization: "Bearer " + token }, redirect: "error",
    }).catch(() => null);
    const receipt = response?.status === 200 ? await response.json().catch(() => ({})) : {};
    const evidence = receipt.evidence || {};
    if (receipt.ok === true && receipt.task?.status === "DONE" &&
        receipt.execution?.consumer_proven === true && receipt.last_event === "COMMAND_RESULT_DONE" &&
        evidence.result_sha256 === resultHash && evidence.git_sha === gitSha &&
        evidence.evidence_ref === evidenceRef) {
      readbackProven = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!readbackProven) fail("D1_COMMAND_RESULT_DONE_READBACK_UNVERIFIED");
  // Existing Unifiend Command consumer is the only executor. Verify a linked
  // OpenBot-mode task returned all the way to the EXISTING D1 room records.
  const roomMatch = /^OGE129 READONLY PROOF: OpenBot Launch Room (localteam_[a-f0-9]{64})/.exec(intent);
  if (roomMatch) {
    let roomProven = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(unifiendUrl + "/api/local-agent-team/state", {
        headers: { authorization: "Bearer " + token }, redirect: "error",
      }).catch(() => null);
      const room = response?.status === 200 ? await response.json().catch(() => ({})) : {};
      const task = (room.tasks || []).find(x => x.id === roomMatch[1]);
      const checkpoint = (room.checkpoints || []).find(x => x.task_id === roomMatch[1] &&
        x.agent_id === "codex-selfhost:wave-runner-01" && x.state_hash === resultHash &&
        x.checkpoint_ref === evidenceRef);
      if (task?.status === "DONE" && task?.command_task_id === taskId &&
          task?.runtime_receipt?.status === "DONE" && checkpoint) {
        roomProven = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!roomProven) fail("OPENBOT_ROOM_D1_RESULT_CHECKPOINT_READBACK_FAILED");
    process.stdout.write("OPENBOT_LAUNCHROOM_CODEX_D1_E2E=PASS\n");
  }
  process.stdout.write("OGE129_SIGNED_OWNER_TO_RUNNER_CODEX_D1_E2E=PASS\\n".replace("\\n","\n"));
}
process.stdout.write(JSON.stringify({ ok: status === "DONE", task_id: taskId, status, result_sha256: resultHash, git_sha: gitSha }) + "\n");
if (status !== "DONE") process.exit(1);
