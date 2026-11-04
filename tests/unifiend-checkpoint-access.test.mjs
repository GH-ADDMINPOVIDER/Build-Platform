import test from "node:test";
import assert from "node:assert/strict";
import { reconcileCanonicalCheckpoint } from "../scripts/unifiend-checkpoint-access.mjs";

const evidence = { source_sha: "a".repeat(40), infisical_login: "VERIFIED", host_access: { state: "BLOCKED" } };
function fixture({ sessionStatus = 200, taskExists = true, mismatch = false } = {}) {
  const calls = [];
  let payload;
  const request = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, "manual");
    if (url.endsWith("/api/session")) return Response.json({ authenticated: true, user: { role: "owner" } }, {
      status: sessionStatus, headers: { "set-cookie": "ogenic_owner_session=fixture-session; HttpOnly; Secure" },
    });
    if (url.endsWith("/api/blue-diamond/check-in")) return Response.json({ ok: true, canonical: {
      available: true, conversation_id: "owner-main", session_line: "1LSS_OWNER_MAIN", latest_sequence: 42,
    } });
    if (url.endsWith("/api/system/certificate-lincenc")) return Response.json({ ok: true,
      integrity: "D1_DOCUMENT_SHA256_MATCH", document_sha256: "b".repeat(64), certificate_id: "existing-certificate" });
    if (url.endsWith("/checkpoint")) {
      payload = JSON.parse(init.body);
      assert.equal(payload.agent_id, "unifiend-capability-access");
      assert.equal(payload.checkpoint_ref, "github-actions://1429580446/123");
      return Response.json({ ok: true, checkpoint: { persisted: true } });
    }
    if (url.includes("/d1/database/")) {
      const query = JSON.parse(init.body);
      assert.match(query.sql, /^SELECT /);
      assert.equal(url.includes("b4ac3a33-df80-47cf-8e75-7574e025b87b"), true);
      const results = query.sql.includes("FROM certificate_lincenc") ? [{ document_sha256: "b".repeat(64) }]
        : query.sql.includes("FROM agent_tasks") ? taskExists ? [{ id: query.params[0] }] : []
        : [{ checkpoint_ref: payload.checkpoint_ref, state_hash: mismatch ? "incorrect" : payload.state_hash }];
      return Response.json({ success: true, result: [{ success: true, results }] });
    }
    throw new Error("unexpected request fixture-secret");
  };
  const resolveSecret = async key => key === "CLOUDFLARE_ACCOUNT_ID" ? "a".repeat(32) : "fixture-secret";
  return { calls, request, resolveSecret };
}

test("canonical checkpoint uses authenticated application write and independent SELECT readback", async () => {
  const f = fixture();
  const report = await reconcileCanonicalCheckpoint({ ...f, evidence, runId: "123" });
  assert.equal(report.athena, "VERIFIED_CHECKIN");
  assert.equal(report.checkpoint_write, "VERIFIED");
  assert.equal(report.independent_readback, true);
  assert.equal(f.calls.filter(c => c.url.endsWith("/checkpoint")).length, 1);
  assert.equal(JSON.stringify(report).includes("fixture-secret"), false);
  assert.equal(JSON.stringify(report).includes("fixture-session"), false);
});

test("rejected Owner session does not proceed to a database or checkpoint write", async () => {
  const f = fixture({ sessionStatus: 401 });
  const report = await reconcileCanonicalCheckpoint({ ...f, evidence, runId: "123" });
  assert.equal(report.failure.stage, "owner_session");
  assert.equal(report.failure.http_status, 401);
  assert.equal(f.calls.length, 1);
  assert.equal(report.checkpoint_write, "NOT_PERFORMED");
});

test("missing existing task cannot create a replacement task", async () => {
  const f = fixture({ taskExists: false });
  const report = await reconcileCanonicalCheckpoint({ ...f, evidence, runId: "123" });
  assert.equal(report.failure.code, "EXISTING_TASK_NOT_FOUND");
  assert.equal(f.calls.some(c => c.url.endsWith("/checkpoint")), false);
});

test("checkpoint acknowledgement cannot substitute for exact independent readback", async () => {
  const f = fixture({ mismatch: true });
  const report = await reconcileCanonicalCheckpoint({ ...f, evidence, runId: "123" });
  assert.equal(report.checkpoint_write, "ACKNOWLEDGED");
  assert.equal(report.independent_readback, false);
  assert.equal(report.failure.code, "CHECKPOINT_READBACK_MISMATCH");
});
