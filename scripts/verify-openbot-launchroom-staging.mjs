import assert from "node:assert/strict";

const base = "https://wave.ogenicchocolate.com";
const secret = String(process.env.OGENIC_OPS_KEY || "").trim();
const sha = String(process.env.GITHUB_SHA || "").trim();
assert.match(sha, /^[a-f0-9]{40}$/, "STAGING_SHA_REQUIRED");
assert.equal(process.env.GITHUB_REF_NAME, "phase-vi-provider-incentive-metering");
assert.equal(process.env.RUNNER_NAME, "wave-runner-01");
assert.ok(secret, "STAGING_OWNER_SECRET_FROM_INFISICAL_REQUIRED");

const authResponse = await fetch(base + "/api/session", {
  method: "POST", headers: { "content-type": "application/json", "x-ogenic-client": "native" },
  body: JSON.stringify({ owner_key: secret }),
  redirect: "error",
});
const auth = await authResponse.json().catch(() => ({}));
assert.equal(authResponse.status, 200, "SIGNED_OWNER_SESSION_UNAVAILABLE");
assert.equal(auth.authenticated, true);
const bearer = typeof auth.session_token === "string" ? auth.session_token : "";
assert.ok(bearer, "SIGNED_OWNER_BEARER_UNAVAILABLE");
const headers = { authorization: "Bearer " + bearer, "content-type": "application/json" };

async function call(path, opts = {}) {
  const response = await fetch(base + path, { redirect: "error", ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  return { http: response.status, payload };
}
const before = await call("/api/local-agent-team/state");
assert.equal(before.http, 200, "ROOM_STATE_READ_FAILED");
assert.equal(before.payload.ok, true);
assert.equal(before.payload.canonical_session, "owner-main/1LSS_OWNER_MAIN");
assert.ok(before.payload.storage?.canonical?.includes("Cloudflare D1"));
const codex = (before.payload.providers || []).find(x => x.id === "codex");
assert.equal(codex?.dispatchable, true, "CODEX_ROOM_READONLY_ADAPTER_NOT_VERIFIED");
assert.equal(codex?.smoke_test, "READONLY_E2E_PASS");

const task = await call("/api/local-agent-team/tasks", {
  method: "POST",
  headers: { "Idempotency-Key": "openbot-room-" + sha },
  body: JSON.stringify({
    title: "Read-only inspect current WAVE staging architecture and summarize system boundaries",
    description: "Read-only inspect existing staging source and report findings. No file modification, no production.",
    permission: "READ", workspace_ref: "workspace:staging",
  }),
});
assert.ok(task.http === 202 || task.http === 200, "ROOM_TASK_CREATE_HTTP_" + task.http);
const taskId = String(task.payload.task?.id || "");
assert.match(taskId, /^localteam_[a-f0-9]{64}$/, "ROOM_TASK_ID_MISSING");

const dispatch = await call("/api/local-agent-team/tasks/" + encodeURIComponent(taskId) + "/dispatch", {
  method: "POST", body: JSON.stringify({ agent_id: "codex" }),
});
assert.ok(dispatch.http === 202 || dispatch.http === 200, "ROOM_DISPATCH_HTTP_" + dispatch.http + "_" + (dispatch.payload.code || "unknown"));
assert.equal(dispatch.payload.ok, true);
assert.ok(["COMMAND_DISPATCHED","COMMAND_ALREADY_QUEUED","COMMAND_ALREADY_LINKED","COMMAND_ALREADY_DONE"].includes(dispatch.payload.code),
  "ROOM_DISPATCH_NOT_AUTOMATIC_" + String(dispatch.payload.code || "unknown"));
const commandTaskId = String(dispatch.payload.command_task_id || "");
assert.match(commandTaskId, /^wavecmd_[a-f0-9]{64}$/, "ROOM_COMMAND_TASK_ID_MISSING");

const linked = await call("/api/local-agent-team/state");
assert.equal(linked.http, 200);
const roomTask = (linked.payload.tasks || []).find(x => x.id === taskId);
assert.ok(roomTask, "ROOM_TASK_NOT_READBACK");
assert.equal(roomTask.command_task_id, commandTaskId, "ROOM_WAVE_TASK_LINK_NOT_READBACK");

console.log("OPENBOT_LAUNCHROOM_OWNER_SESSION=PASS");
console.log("OPENBOT_LAUNCHROOM_TASK_D1_READBACK=PASS");
console.log("OPENBOT_LAUNCHROOM_CODEX_READONLY_DISPATCH=PASS");
console.log("OPENBOT_LAUNCHROOM_ROOM_TASK=" + taskId);
console.log("OPENBOT_LAUNCHROOM_WAVE_TASK=" + commandTaskId);
console.log("OPENBOT_LAUNCHROOM_COMPLETION=PENDING_RUNNER_RECEIPT");
