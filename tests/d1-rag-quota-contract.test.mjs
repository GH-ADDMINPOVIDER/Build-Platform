import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("D1 canonical context is injected into chat", () => {
  const chat = read("worker/chat-model-api.ts");
  assert.match(chat, /readCanonicalD1Context/);
  assert.match(chat, /CANONICAL D1 READ-ONLY CONTEXT/);
  assert.match(chat, /allow_paid_fallback/);
});

test("RAG mode is deterministic and D1-backed", () => {
  const connector = read("worker/connector-app-api.ts");
  assert.match(connector, /tool_mode/);
  assert.match(connector, /d1_canonical/);
  assert.match(connector, /readCanonicalD1Context/);
});

test("direct chat usage participates in quota telemetry", () => {
  const provider = read("worker/provider-incentives.ts");
  const migration = read("database/migrations/0012_chat_usage_ledger.sql");
  assert.match(provider, /chat_usage_ledger/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS chat_usage_ledger/);
});

test("UI sends paid fallback intent explicitly", () => {
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /allow_paid_fallback/);
  assert.match(ui, /Paid fallback OFF/);
});
