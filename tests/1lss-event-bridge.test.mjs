import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("1LSS bridge accepts owner session or server-side ops key without exposing the key", () => {
  const auth = read("worker/app-auth.ts");
  const api = read("worker/unified-chat-api.ts");
  assert.match(auth, /hasOwnerOrOpsAccess/);
  assert.match(auth, /x-ogenic-ops-key/);
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /SECRET_LIKE_CONTENT_REJECTED/);
});

test("1LSS exposes an incremental ordered event cursor", () => {
  const api = read("worker/unified-chat-api.ts");
  const entry = read("worker/entry-connectors.ts");
  assert.match(api, /GET|api\.get\("\/api\/1lss\/events"/);
  assert.match(api, /after_sequence/);
  assert.match(api, /ORDER BY sequence_no ASC/);
  assert.match(entry, /\/api\/1lss\/events/);
});

test("UnifiedChat follows the 1LSS event cursor near-real-time without skipping backlog pages", () => {
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /eventCursorRef/);
  assert.match(ui, /after_sequence=/);
  assert.doesNotMatch(ui, /Math\.max\([\s\S]{0,200}body\.latest_sequence/);
  assert.match(ui, /setInterval\(\(\) => \{ void poll1LSS\(\); \}, 3000\)/);
  assert.match(ui, /LIVE ≤3s/);
});


test("1LSS exposes a read-only cross-surface status probe", () => {
  const api = read("worker/unified-chat-api.ts");
  const entry = read("worker/entry-connectors.ts");
  const ui = read("src/UnifiedChat.tsx");
  assert.match(api, /\/api\/1lss\/status/);
  assert.match(api, /cross_surface_ready/);
  assert.match(api, /caught_up_to_pair_latest/);
  assert.match(api, /freshness_ms/);
  assert.match(api, /chat_session_refs/);
  assert.match(entry, /\/api\/1lss\/status/);
  assert.match(ui, /loadBridgeStatus/);
  assert.match(ui, /WEB✓#/);
  assert.match(ui, /APP✓#/);
});

test("1LSS external-agent bridge accepts only canonical surfaces and requires retry-safe idempotency", () => {
  const api = read("worker/unified-chat-api.ts");
  for (const surface of ["chatgpt-app", "chatgpt-dev", "manus", "external-harness"]) {
    assert.match(api, new RegExp(`"${surface}"`));
  }
  assert.match(api, /INVALID_SOURCE_SURFACE/);
  assert.match(api, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(api, /idempotency-key/);
  assert.match(api, /conversation_id = \? AND idempotency_key = \?/);
  assert.match(api, /source_surface, idempotency_key/);
  assert.match(api, /replayed_count/);
});

test("existing App\/Web bridge emits idempotency keys and consumes canonical cursor events", () => {
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /Idempotency-Key/);
  assert.match(ui, /\/api\/1lss\/event/);
  assert.match(ui, /\/api\/1lss\/events\?after_sequence=/);
  assert.match(ui, /eventCursorRef/);
});

test("staging deploy performs a one-time external-agent runtime proof using build identity", () => {
  const api = read("worker/unified-chat-api.ts");
  const entry = read("worker/entry-connectors.ts");
  const pkg = JSON.parse(read("package.json"));
  const proof = read("scripts/runtime-proof.mjs");
  assert.match(api, /\/api\/1lss\/runtime-proof/);
  assert.match(api, /1LSS_EXTERNAL_AGENT_RUNTIME_VERIFIED/);
  assert.match(api, /external-harness/);
  assert.match(api, /replayedCount !== 1/);
  assert.match(api, /readEventPage\(db, cursor, 40\)/);
  assert.match(entry, /\/api\/1lss\/runtime-proof/);
  assert.match(pkg.scripts["cf:deploy:staging"], /runtime-proof\.mjs/);
  assert.match(proof, /WORKERS_CI_BUILD_UUID/);
  assert.match(proof, /observed_via_event_feed/);
});

