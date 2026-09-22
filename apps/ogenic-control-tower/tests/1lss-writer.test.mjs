import assert from "node:assert/strict";
import test from "node:test";
import { append1LssEvent, get1LssStatus, read1LssContext } from "../server.js";

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


test("context reader uses server-side auth and returns canonical ordered context", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      ok: true,
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      after_sequence: 100,
      cursor: 102,
      latest_sequence: 105,
      messages: [
        { id: "m101", role: "user", text: "hello", model: null, created_at: 1, sequence_no: 101, source_surface: "chatgpt-app" },
        { id: "m102", role: "assistant", text: "world", model: "gpt-5.6-sol", created_at: 2, sequence_no: 102, source_surface: "plugin-harness" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await read1LssContext({ afterSequence: 100, limit: 2 }, {
    fetchImpl,
    baseUrl: "https://staging.example/",
    opsKey: "server-only-reader-key",
  });

  assert.equal(result.conversation_id, "owner-main");
  assert.equal(result.session_line, "1LSS_OWNER_MAIN");
  assert.equal(result.cursor, 102);
  assert.equal(result.latest_sequence, 105);
  assert.deepEqual(result.messages.map((m) => m.sequence_no), [101, 102]);
  assert.equal(JSON.stringify(result).includes("server-only-reader-key"), false);
  assert.equal(calls[0].url, "https://staging.example/api/1lss/events?after_sequence=100&limit=2");
  assert.equal(calls[0].init.headers["x-ogenic-ops-key"], "server-only-reader-key");
});

test("status reader returns canonical cross-surface state without exposing auth", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      ok: true,
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      latest_sequence: 105,
      pair_latest_sequence: 104,
      checked_at: 123456,
      freshness_ms: 120000,
      cross_surface_ready: false,
      surfaces: [
        {
          source_surface: "ogenic-web",
          message_count: 8,
          last_message_sequence: 104,
          door_last_sequence: 104,
          door_last_seen_at: 123000,
          door_seen: true,
          fresh: true,
          persisted: true,
          caught_up_to_pair_latest: true,
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await get1LssStatus({
    fetchImpl,
    baseUrl: "https://staging.example",
    opsKey: "server-only-status-key",
  });

  assert.equal(result.latest_sequence, 105);
  assert.equal(result.cross_surface_ready, false);
  assert.equal(result.surfaces[0].source_surface, "ogenic-web");
  assert.equal(JSON.stringify(result).includes("server-only-status-key"), false);
  assert.equal(calls[0].url, "https://staging.example/api/1lss/status");
  assert.equal(calls[0].init.headers["x-ogenic-ops-key"], "server-only-status-key");
});
