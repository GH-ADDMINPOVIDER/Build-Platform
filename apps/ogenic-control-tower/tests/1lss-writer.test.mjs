import assert from "node:assert/strict";
import test from "node:test";
import { append1LssEvent } from "../server.js";

test("sync writer preserves payload and server-side auth without exposing the key", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      ok: true,
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      source_surface: "plugin-harness",
      sequences: [91],
      replayed_count: 0,
    }), { status: 201, headers: { "content-type": "application/json" } });
  };

  const result = await append1LssEvent({
    turnId: "turn-fixed-001",
    role: "assistant",
    content: "runtime writer proof",
    sourceSurface: "plugin-harness",
    model: "gpt-5.6-sol",
  }, {
    fetchImpl,
    baseUrl: "https://staging.example",
    opsKey: "server-only-test-key",
  });

  assert.equal(result.sequence_no, 91);
  assert.equal(result.source_surface, "plugin-harness");
  assert.equal(result.replayed, false);
  assert.equal(JSON.stringify(result).includes("server-only-test-key"), false);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://staging.example/api/1lss/event");
  assert.equal(calls[0].init.headers["x-ogenic-ops-key"], "server-only-test-key");
  assert.equal(calls[0].init.headers["idempotency-key"], "mcp:plugin-harness:turn-fixed-001");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    source_surface: "plugin-harness",
    events: [{
      role: "assistant",
      content: "runtime writer proof",
      model: "gpt-5.6-sol",
    }],
  });
});

test("retry reuses one idempotency key and accepts the same canonical sequence", async () => {
  const keys = [];
  let count = 0;
  const fetchImpl = async (_url, init) => {
    keys.push(init.headers["idempotency-key"]);
    count += 1;
    return new Response(JSON.stringify({
      ok: true,
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      source_surface: "chatgpt-app",
      sequences: [105],
      replayed_count: count === 1 ? 0 : 1,
    }), { status: count === 1 ? 201 : 200, headers: { "content-type": "application/json" } });
  };

  const input = {
    turnId: "turn-fixed-retry-105",
    role: "user",
    content: "same immutable turn",
    sourceSurface: "chatgpt-app",
    model: "gpt-5.6-sol",
  };
  const options = { fetchImpl, baseUrl: "https://staging.example", opsKey: "server-only-test-key" };

  const first = await append1LssEvent(input, options);
  const second = await append1LssEvent(input, options);

  assert.equal(first.sequence_no, 105);
  assert.equal(second.sequence_no, 105);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(keys, [
    "mcp:chatgpt-app:turn-fixed-retry-105",
    "mcp:chatgpt-app:turn-fixed-retry-105",
  ]);
});

test("writer rejects a bridge response that is not owner-main canonical contract", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    ok: true,
    conversation_id: "wrong-session",
    session_line: "1LSS_OWNER_MAIN",
    source_surface: "plugin-harness",
    sequences: [9],
    replayed_count: 0,
  }), { status: 201, headers: { "content-type": "application/json" } });

  await assert.rejects(
    append1LssEvent({
      turnId: "turn-fixed-contract",
      role: "user",
      content: "contract check",
      sourceSurface: "plugin-harness",
    }, {
      fetchImpl,
      baseUrl: "https://staging.example",
      opsKey: "server-only-test-key",
    }),
    /1LSS_BRIDGE_CONTRACT_MISMATCH/,
  );
});
