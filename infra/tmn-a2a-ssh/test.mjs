import assert from "node:assert/strict";
import test from "node:test";
import { makeServer } from "./server.mjs";

const token = "ci-fixture-only-no-provider-credential";
function fixture() {
  return {
    version: "wave.task.envelope.v1",
    task_id: "waveenv_" + "a".repeat(64),
    idempotency_key: "docker-a2a-smoke-20261023",
    title: "Bounded private Docker runtime proof",
    instruction: "tmn.runtime.probe",
    context: { context_ref: "cp055/context/docker-staging", context_revision: 1 },
    scope: {
      environment: "staging", target_zone: "TMN", capability: "tmn.runtime.probe",
      permission: "READ", workspace_ref: "workspace:staging", no_production: true
    },
    authorization: {
      owner_session: "owner-main/1LSS_OWNER_MAIN",
      authority_ref: "TEST_FIXTURE_NOT_AN_OWNER_SIGNATURE",
      signed_gate: "ATHENA_YELLOW", signed_execution_required: true,
      secret_material_in_payload: false
    },
    execution: { state: "TASK_IN", executor: "TMN", attempt: 0, max_attempts: 1 },
    fallback: { mode: "HOLD_FOR_OWNER", allowed: false, reason: "No fallback" }
  };
}

const bodyFor = (e = fixture(), text = "tmn.runtime.probe") => ({
  jsonrpc: "2.0", id: 1, method: "message/send",
  params: {
    message: {
      kind: "message", messageId: "m1", role: "user",
      contextId: e.context.context_ref, parts: [{ kind: "text", text }],
      metadata: { wave_task_envelope: e }
    }
  }
});

test("SSH-bound Docker A2A: health, auth, actual probe, replay, get, reject writes", async () => {
  let server;
  let base;
  if (process.env.WAVE_A2A_REMOTE_URL) {
    base = process.env.WAVE_A2A_REMOTE_URL;
  } else {
    server = makeServer(token);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    base = "http://127.0.0.1:" + server.address().port;
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + (process.env.WAVE_A2A_REMOTE_URL ? process.env.WAVE_TMN_A2A_TOKEN : token)
  };
  const call = async (body, useAuth = true) => {
    const h = useAuth ? headers : { "Content-Type": "application/json" };
    const res = await fetch(base + "/a2a", { method: "POST", headers: h, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  try {
    assert.equal((await fetch(base + "/healthz")).status, 200);
    const unauth = await call(bodyFor(), false);
    assert.equal(unauth.status, 401);
    assert.equal(unauth.data.code, "A2A_AUTH_REQUIRED");
    assert.equal((await fetch(base + "/.well-known/agent-card.json")).status, 401);
    const card = await fetch(base + "/.well-known/agent-card.json", { headers });
    assert.equal(card.status, 200);
    const agentCard = await card.json();
    assert.equal(agentCard.skills[0].id, "tmn.runtime.probe");
    assert.equal(agentCard.supportedInterfaces[0].protocolBinding, "JSONRPC");
    const a = await call(bodyFor());
    assert.equal(a.status, 200);
    assert.equal(a.data.id, 1);
    assert.equal(a.data.result.status.state, "completed");
    assert.equal(a.data.result.artifacts[0].parts[0].data.probe, "PASS");
    assert.equal(a.data.result.artifacts[0].parts[0].data.canonical_d1_receipt, false);
    assert.equal(a.data.result.artifacts[0].parts[0].data.tmn_command_executed, false);
    assert.match(a.data.result.artifacts[0].parts[0].data.result_sha256, /^[0-9a-f]{64}$/);
    const replay = await call(bodyFor());
    assert.deepEqual(replay.data.result, a.data.result);
    const get = await call({ jsonrpc: "2.0", id: 2, method: "tasks/get", params: { id: fixture().task_id } });
    assert.equal(get.data.result.id, fixture().task_id);
    const invalid = fixture();
    invalid.instruction = "deploy production";
    const denied = await call(bodyFor(invalid, "deploy production"));
    assert.match(denied.data.error.message, /EXECUTION_NOT_AUTHORIZED/);
    const unsafe = fixture();
    unsafe.scope.permission = "EXECUTE";
    assert.match((await call(bodyFor(unsafe))).data.error.message, /EXECUTION_NOT_AUTHORIZED/);
    const secret = fixture();
    secret.instruction = "Bearer " + "z".repeat(20);
    assert.match((await call(bodyFor(secret, secret.instruction))).data.error.message, /SECRET_LIKE_INPUT_REJECTED/);
    const unknown = await call({jsonrpc:"2.0",id:3,method:"tasks/cancel",params:{id:fixture().task_id}});
    assert.equal(unknown.data.error.code, -32601);
    console.log("A2A_DOCKER_SSH_STAGING_PROBE=PASS; TMN_COMMAND_EXECUTED=FALSE; D1_E2E=NOT_CLAIMED");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
  }
});
