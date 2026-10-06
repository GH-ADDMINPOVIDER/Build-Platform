import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const connector = read("worker/connector-app-api.ts");
const recovery = read("worker/session-recovery-api.ts");
const entry = read("worker/entry-connectors.ts");
const chat = read("src/UnifiedChat.tsx");

test("OGE-54 persists provider session metadata in existing chat_session_refs only", () => {
  assert.match(connector, /FROM chat_session_refs/);
  assert.match(connector, /source_surface = 'openai-agent'/);
  assert.match(connector, /INSERT INTO chat_session_refs/);
  assert.match(recovery, /"openai-agent"/);
  assert.doesNotMatch(connector, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("ordinary follow-up reuses the saved Agents session events API", () => {
  assert.match(connector, /latestStoredAgentSession/);
  assert.match(connector, /GET/);
  assert.match(connector, /\/agents\/sessions\/\$\{encodeURIComponent\(input\.sessionId\)\}\/events/);
  assert.match(connector, /agent\.session\.input\.message/);
  assert.match(connector, /"Idempotency-Key": input\.idempotencyKey/);
  assert.match(connector, /readAgentSessionStream\(streamResponse, input\.sessionId\)/);
});

test("reuse failure is fail-closed and never silently creates another provider session", () => {
  assert.match(connector, /AGENT_SESSION_RESET_REQUIRED/);
  assert.match(connector, /AGENT_SESSION_NOT_IDLE/);
  assert.match(connector, /AGENT_SESSION_SETTINGS_CHANGE_REQUIRES_NEW_SESSION/);
  assert.match(connector, /retry_policy: "NO_AUTO_RETRY"/);
  const handler = connector.slice(
    connector.indexOf('api.post("/api/chat/agent"'),
    connector.indexOf('api.post("/api/chat/functions"'),
  );
  const continuation = handler.indexOf("if (storedSession?.session_ref && !newSessionRequested)");
  const createPath = handler.indexOf("} else {", continuation);
  assert.ok(continuation >= 0 && createPath > continuation);
  assert.match(handler.slice(continuation, createPath), /return c\.json\(/);
});

test("canonical D1 context is replayed only on new provider-session creation", () => {
  const handler = connector.slice(
    connector.indexOf('api.post("/api/chat/agent"'),
    connector.indexOf('api.post("/api/chat/functions"'),
  );
  const continuation = handler.indexOf("if (storedSession?.session_ref && !newSessionRequested)");
  const createPath = handler.indexOf("} else {", continuation);
  const continuationBlock = handler.slice(continuation, createPath);
  const newSessionBlock = handler.slice(createPath);
  assert.doesNotMatch(continuationBlock, /readCanonicalD1Context/);
  assert.match(newSessionBlock, /readCanonicalD1Context/);
  assert.match(handler, /session_continuation: sessionContinuation/);
  assert.match(handler, /context_replayed: !sessionContinuation/);
});

test("fresh current/latest Agent questions still bypass provider session continuation", () => {
  const agentBlock = entry.slice(entry.indexOf('if (pathname === "/api/chat/agent")'));
  assert.ok(agentBlock.indexOf("freshAgentReadRequest(request)") < agentBlock.indexOf("cachedAgentReplay(request, env)"));
  assert.ok(agentBlock.indexOf("athenaChatApi.fetch") < agentBlock.indexOf("connectorApi.fetch"));
});

test("new provider session is explicit from New viewport and not automatic retry", () => {
  assert.match(chat, /new_session: newAgentSession/);
  assert.match(chat, /setNewAgentSession\(true\)/);
  assert.match(chat, /setNewAgentSession\(false\)/);
  assert.match(chat, /continued/);
});
