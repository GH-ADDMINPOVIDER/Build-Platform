import assert from "node:assert/strict";
import test from "node:test";
import { probeProviderReadiness } from "../scripts/oge95-provider-readiness.mjs";
test("empty key environment makes no calls", async () => {
  let calls = 0;
  const out = await probeProviderReadiness({}, async () => { calls++; throw Error("should not call"); });
  assert.equal(calls, 0);
  assert.equal(out.manus.state, "NOT_CONFIGURED");
  assert.equal(out.openai.state, "NOT_CONFIGURED");
});
test("probe only does GET and reports statuses without returning identity/session body", async () => {
  const requests = [];
  const out = await probeProviderReadiness({ MANUS_API_KEY: "test-manus", OPENAI_API_KEY: "test-openai" }, async (url, opts) => {
    requests.push({ url, method: opts.method, headers: opts.headers });
    return { status: url.includes("manus") ? 200 : 403, body: { async cancel() {} } };
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.method === "GET"));
  assert.equal(out.manus.state, "READ_ACCESS_OK");
  assert.equal(out.openai.state, "AUTH_DENIED");
  assert.equal(out.model_inference_calls, 0);
  assert.equal(out.paid_agent_tasks_created, false);
  assert.doesNotMatch(JSON.stringify(out), /test-manus|test-openai/);
});
test("API transport errors do not become fake readiness", async () => {
  const out = await probeProviderReadiness({ MANUS_API_KEY: "placeholder" }, async () => { throw Error("offline"); });
  assert.equal(out.manus.state, "NETWORK_UNAVAILABLE");
});
