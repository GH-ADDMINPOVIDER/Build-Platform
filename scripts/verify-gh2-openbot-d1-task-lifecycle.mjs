// GH_ADDMIN_POVIDER: bounded OpenBot Launch Room task lifecycle smoke.
// Staging only. This script does NOT dispatch to GH1, Codex, OpenBot or GT.
// True cross-account execution needs a separately authenticated receiver + D1 result.
import assert from "node:assert/strict";

const base = process.env.STAGING_URL || "https://wave.ogenicchocolate.com";
const ownerKey = String(process.env.OGENIC_OPS_KEY || "").trim();
const run = String(process.env.GITHUB_RUN_ID || "").trim();
const attempt = String(process.env.GITHUB_RUN_ATTEMPT || "1").trim();
assert.match(base, /^https:\/\/[a-z0-9.-]+\/?$/i, "STAGING_HTTPS_URL_REQUIRED");
assert.match(run, /^\d+$/, "CI_RUN_ID_REQUIRED");
assert.match(attempt, /^\d+$/, "CI_RUN_ATTEMPT_REQUIRED");
assert.ok(ownerKey, "OWNER_STAGING_SECRET_BINDING_REQUIRED");

async function api(path, init = {}) {
  const response = await fetch(new URL(path, base), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({}));
  return { http: response.status, payload };
}
const session = await api("/api/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-ogenic-client": "native" },
  body: JSON.stringify({ owner_key: ownerKey }),
});
assert.equal(session.http, 200, "OWNER_SESSION_HTTP");
assert.equal(session.payload.authenticated, true, "OWNER_SESSION_AUTH");
assert.equal(session.payload.user?.role, "owner", "OWNER_ROLE");
const bearer = String(session.payload.session_token || "");
assert.ok(bearer, "SIGNED_OWNER_BEARER_REQUIRED");
const headers = { authorization: "Bearer " + bearer, "Content-Type": "application/json" };
const key = "gh2-openbot-owner-d1-" + run + "-" + attempt;
const taskBody = {
  title: "GH_ADDMIN_POVIDER staging OpenBot D1 lifecycle " + run,
  description: "Read-only Owner→D1 mailbox proof. This task must not be dispatched to a runner, external OpenBot or GT. No code, secret or production changes.",
  workspace_ref: "workspace:staging",
  permission: "READ",
};
const first = await api("/api/local-agent-team/tasks", {
  method: "POST", headers: { ...headers, "Idempotency-Key": key },
  body: JSON.stringify(taskBody),
});
assert.ok([200, 202].includes(first.http), "TASK_CREATE_HTTP_" + first.http);
const taskId = String(first.payload.task?.id || "");
assert.match(taskId, /^localteam_[a-f0-9]{64}$/, "TASK_ID_REQUIRED");
assert.notEqual(first.payload.execution?.state, "DONE", "TASK_NOT_EXECUTED");
const second = await api("/api/local-agent-team/tasks", {
  method: "POST", headers: { ...headers, "Idempotency-Key": key },
  body: JSON.stringify(taskBody),
});
assert.equal(second.http, 200, "IDEMPOTENT_REPLAY_HTTP");
assert.equal(second.payload.idempotent_replay, true, "IDEMPOTENT_REPLAY_REQUIRED");
assert.equal(second.payload.task?.id, taskId, "DUPLICATE_TASK_ID");

const message = "GH_ADDMIN_POVIDER read-only evidence: accepted into D1; no GT ACK or execution requested. CI " + run;
const posted = await api("/api/local-agent-team/messages", {
  method: "POST", headers: { ...headers, "Idempotency-Key": key + "-message" },
  body: JSON.stringify({ text: message, task_id: taskId }),
});
assert.equal(posted.http, 202, "OWNER_MESSAGE_HTTP");
assert.match(String(posted.payload.message_id || ""), /^event-localteam-message-[a-f0-9]{64}$/, "MESSAGE_ID_REQUIRED");

let verified = null;
for (let attemptIndex = 0; attemptIndex < 5; attemptIndex++) {
  const response = await api("/api/local-agent-team/state", { headers });
  assert.equal(response.http, 200, "STATE_HTTP");
  assert.equal(response.payload.canonical_session, "owner-main/1LSS_OWNER_MAIN");
  assert.ok(String(response.payload.storage?.canonical || "").includes("Cloudflare D1"), "D1_CANONICAL_REQUIRED");
  const task = (response.payload.tasks || []).find(row => row.id === taskId);
  const note = (response.payload.messages || []).find(row => row.task_id === taskId && row.text === message);
  if (task && note) {
    assert.equal(task.capability, "local_agent_team");
    assert.equal(task.permission, "READ");
    assert.equal(task.command_task_id, null, "NO_DISPATCH_ALLOWED_IN_THIS_SMOKE");
    assert.notEqual(task.status, "DONE", "NO_EXECUTION_MUST_OCCUR");
    verified = { task, note };
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 700));
}
assert.ok(verified, "TASK_AND_MESSAGE_INDEPENDENT_D1_READBACK_REQUIRED");
console.log("GH2_OPENBOT_OWNER_SESSION=PASS");
console.log("GH2_OPENBOT_D1_TASK_CREATE=PASS");
console.log("GH2_OPENBOT_D1_IDEMPOTENCY=PASS");
console.log("GH2_OPENBOT_D1_MESSAGE_READBACK=PASS");
console.log("GH2_OPENBOT_TASK_ID=" + taskId);
console.log("GH2_OPENBOT_MESSAGE_ID=" + posted.payload.message_id);
console.log("GH2_OPENBOT_DISPATCH=NOT_ATTEMPTED");
console.log("GH2_OPENBOT_GT_ACK=NOT_CONNECTED");
console.log("GH2_OPENBOT_EXECUTION_DONE=NOT_PROVEN");
