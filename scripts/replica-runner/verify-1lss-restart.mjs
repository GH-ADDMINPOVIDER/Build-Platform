// OGE-96 / Stone Runner — actual workerd restart with the SAME disposable local D1.
// Run only after verify-1lss.mjs and a full stop/start of workerd using the same --persist-to dir.
// No remote D1 access, no real user message, no provider calls, no new schema.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const base = process.env.REPLICA_URL || "http://127.0.0.1:8787";
const key = process.env.REPLICA_TEST_OPS_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(base)) throw Error("LOCAL_LOOPBACK_RUNTIME_REQUIRED");
if (key.length < 32) throw Error("EPHEMERAL_TEST_ACCESS_KEY_REQUIRED");
const source = JSON.parse(readFileSync("replica-1lss-evidence.json", "utf8"));
assert.equal(source.status, "LOCAL_1LSS_PASS", "PRE_RESTART_PROOF_REQUIRED");
assert.equal(source.mode, "LOCAL_WORKER_DISPOSABLE_D1");
assert.equal(source.remote_d1_access, false);
assert.equal(source.source_sha, process.env.GITHUB_SHA || "local");
const start = source.message_sequence_start;
const after = source.message_sequence_after;
assert.ok(Number.isSafeInteger(start) && after === start + 3, "INVALID_PRE_RESTART_SEQUENCES");
const run = String(process.env.GITHUB_RUN_ID || "local").slice(0, 60);
const evidence = {
  schema_version: "STONE_RUNNER_1LSS_RESTART_V1",
  source_sha: source.source_sha,
  mode: "SAME_DISPOSABLE_D1_AFTER_WORKERD_RESTART",
  pre_restart_proof: source.status,
  remote_d1_access: false,
  provider_calls: 0,
  expected_sequence: after,
  checks: {},
  status: "LOCAL_1LSS_RESTART_NOT_PROVEN",
};
function check(name, ok, detail) {
  evidence.checks[name] = Boolean(ok);
  assert.ok(ok, name + ": " + String(detail).slice(0, 180));
}
async function request(path, options = {}) {
  const r = await fetch(base + path, {...options, signal: AbortSignal.timeout(9000)});
  return {status: r.status, body: await r.json().catch(() => ({}))};
}
const headers = {"x-ogenic-ops-key": key};
try {
  // Restart readiness is not guaranteed immediate; bounded probe ONLY for the local process.
  let restored;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      restored = await request("/api/1lss/events?after_sequence=" + start + "&limit=10", {headers});
      if (restored.status === 200) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  check("authenticated_read_after_restart", restored?.status === 200, restored?.status || "NO_LOCAL_RUNTIME");
  const b = restored.body;
  check("canonical_session_unchanged", b.conversation_id === "owner-main" && b.session_line === "1LSS_OWNER_MAIN", b.conversation_id);
  check("sequence_persisted_across_restart", b.latest_sequence === after && b.messages?.length === 3, b.latest_sequence);
  const msgs = b.messages;
  check("content_and_surface_persisted", msgs[0].source_surface === "chatgpt-app" &&
    msgs[1].source_surface === "chatgpt-app" &&
    msgs[2].source_surface === "ogenic-web" &&
    msgs[0].text === "synthetic OGE95 local cross-surface input " + run &&
    msgs[1].text === "synthetic OGE95 local reply " + run &&
    msgs[2].text === "synthetic OGE95 web turn " + run, "MESSAGE_MISMATCH");
  check("cursor_persisted", msgs.map(m => m.sequence_no).join(",") ===
    [start + 1, start + 2, start + 3].join(",") && b.cursor === after, b.cursor);
  const id = "oge95-stone-runner-fixture-" + run;
  const events = [
    {role: "user", content: "synthetic OGE95 local cross-surface input " + run},
    {role: "assistant", content: "synthetic OGE95 local reply " + run, model: "replica-fixture"},
  ];
  const replay = await request("/api/1lss/event", {
    method: "POST",
    headers: {...headers, "Content-Type": "application/json", "Idempotency-Key": id},
    body: JSON.stringify({source_surface: "chatgpt-app", events}),
  });
  check("idempotent_replay_survives_restart", replay.status === 200 &&
    replay.body.replayed_count === 2 &&
    JSON.stringify(replay.body.sequences) === JSON.stringify([start + 1, start + 2]), replay.status);
  const final = await request("/api/1lss/events?after_sequence=" + start + "&limit=10", {headers});
  check("restart_replay_writes_no_duplicates", final.status === 200 &&
    final.body.latest_sequence === after && final.body.messages?.length === 3, final.status);
  const denied = await request("/api/1lss/events?after_sequence=" + start);
  check("unauthorized_read_still_denied", denied.status === 401 && denied.body.code === "REAUTH_REQUIRED", denied.status);
  evidence.status = "LOCAL_1LSS_RESTART_PASS";
} catch (error) {
  evidence.status = "LOCAL_1LSS_RESTART_FAIL";
  evidence.error = String(error?.message || error).slice(0, 250);
  process.exitCode = 1;
} finally {
  evidence.checks_passed = Object.values(evidence.checks).filter(Boolean).length;
  evidence.checks_total = Object.keys(evidence.checks).length;
  writeFileSync("replica-1lss-restart-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({status: evidence.status, checks: evidence.checks_passed + "/" + evidence.checks_total,
    remote_d1: false, artifact: "replica-1lss-restart-evidence.json", error: evidence.error || null}));
}
