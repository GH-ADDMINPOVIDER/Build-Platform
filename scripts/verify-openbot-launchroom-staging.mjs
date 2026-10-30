import assert from "node:assert/strict";

const base = "https://wave.ogenicchocolate.com";
const secret = String(process.env.OGENIC_OPS_KEY || "").trim();
const sha = String(process.env.GITHUB_SHA || "").trim();
assert.match(sha, /^[a-f0-9]{40}$/, "STAGING_SHA_REQUIRED");
assert.equal(process.env.GITHUB_REF_NAME, "Unified-on-Progress");
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
assert.equal(auth.user?.role, "owner", "SIGNED_OWNER_ROLE_REQUIRED");
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
assert.equal(codex?.room_adapter, "CODEX_READONLY_EXISTING_Unifiend", "CODEX_RUNTIME_ADAPTER_MUST_BE_EXISTING");
assert.ok((before.payload.providers || []).filter(x => x.id !== "codex").every(x => x.dispatchable !== true),
  "NO_UNVERIFIED_PROVIDER_MAY_BE_DISPATCHABLE");
// A successful unrelated Codex proof is only the prerequisite for this room test.
// OPENBOT E2E PASS is emitted by the existing Unifiend Command Consumer only after
// this exact room task's D1 result/checkpoint readback succeeds.
console.log("OPENBOT_LAUNCHROOM_READONLY_SCOPE=PASS");
console.log("OPENBOT_OWNER_AUTHORITY=SIGNED_OWNER_SESSION_YELLOW_STONE_READ_ONLY");
console.log("OPENBOT_CODEX_DOCUMENT=docs/YELLOW_EFFECT_CONTRACT.md");

const task = await call("/api/local-agent-team/tasks", {
  method: "POST",
  headers: { "Idempotency-Key": "openbot-room-" + sha },
  body: JSON.stringify({
    title: "OpenBot Owner READ audit: inspect docs/YELLOW_EFFECT_CONTRACT.md and package.json; report npm scripts and Yellow scope; no writes",
    description: "SIGNED OWNER, STAGING ONLY, wave-runner-01, Yellow Stone authority. Read docs/YELLOW_EFFECT_CONTRACT.md and package.json only; report the authority boundary, package name and npm script names. No writes, secret reads, external actions, production, schema changes, installs or Git changes.",
    permission: "READ", workspace_ref: "workspace:staging",
  }),
});
assert.ok(task.http === 202 || task.http === 200, "ROOM_TASK_CREATE_HTTP_" + task.http);
const taskId = String(task.payload.task?.id || "");
assert.match(taskId, /^localteam_[a-f0-9]{64}$/, "ROOM_TASK_ID_MISSING");

// Persist a bounded Owner note so the Launch Room conversation is proven too.
const note = await call("/api/local-agent-team/messages", {
  method: "POST",
  headers: { "Idempotency-Key": "openbot-room-message-" + sha },
  body: JSON.stringify({
    text: "Read-only verification of package.json: package name and npm script names only.",
    task_id: taskId,
  }),
});
assert.equal(note.http, 202, "ROOM_MESSAGE_WRITE_FAILED_" + note.http);
const conversation = await call("/api/local-agent-team/state");
assert.equal(conversation.http, 200, "ROOM_CONVERSATION_READ_FAILED");
assert.ok((conversation.payload.messages || []).some(row => row.task_id === taskId &&
  row.text === "Read-only verification of package.json: package name and npm script names only."),
  "ROOM_MESSAGE_D1_READBACK_MISSING");

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
assert.equal(roomTask.command_task_id, commandTaskId, "ROOM_UNIFIEND_TASK_LINK_NOT_READBACK");
assert.ok((linked.payload.events || []).some(event => event.task_id === taskId &&
  event.event_type === "LOCAL_TEAM_COMMAND_LINKED" && event.correlation_id === commandTaskId),
  "ROOM_COMMAND_LINK_D1_EVENT_MISSING");

console.log("OPENBOT_LAUNCHROOM_OWNER_SESSION=PASS");
console.log("OPENBOT_LAUNCHROOM_TASK_D1_READBACK=PASS");
console.log("OPENBOT_LAUNCHROOM_CONVERSATION_D1_READBACK=PASS");
console.log("OPENBOT_LAUNCHROOM_CODEX_READONLY_DISPATCH=PASS");
if (dispatch.payload.code === "COMMAND_ALREADY_DONE") {
  assert.equal(dispatch.payload.idempotent_replay, true, "TERMINAL_REPLAY_MUST_BE_IDEMPOTENT");
  assert.equal(dispatch.payload.execution?.status, "DONE", "TERMINAL_REPLAY_STATUS");
  assert.equal(dispatch.payload.execution?.consumer_proven, true, "TERMINAL_REPLAY_REQUIRES_REAL_RECEIPT");
  assert.match(String(dispatch.payload.receipt?.result_sha256 || ""), /^[a-f0-9]{64}$/, "TERMINAL_REPLAY_RECEIPT_SHA");
  console.log("OPENBOT_LAUNCHROOM_DONE_REPLAY_D1=PASS");
}
console.log("OPENBOT_LAUNCHROOM_ROOM_TASK=" + taskId);
console.log("OPENBOT_LAUNCHROOM_UNIFIEND_TASK=" + commandTaskId);
console.log("OPENBOT_LAUNCHROOM_COMPLETION=" +
  (dispatch.payload.code === "COMMAND_ALREADY_DONE" ? "DONE_VERIFIED_REUSED" : "PENDING_RUNNER_RECEIPT"));
