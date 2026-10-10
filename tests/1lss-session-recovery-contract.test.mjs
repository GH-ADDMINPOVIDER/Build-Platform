import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("1LSS session recovery keeps owner-main as the only canonical line", () => {
  const migration = read("database/migrations/0011_1lss_session_refs.sql");
  const api = read("worker/session-recovery-api.ts");
  const chat = read("worker/chat-model-api.ts");
  const entry = read("worker/entry-connectors.ts");
  const ui = read("src/UnifiedChat.tsx");

  assert.match(migration, /UNIQUE \(conversation_id, source_surface, session_ref\)/);
  assert.match(api, /const CONVERSATION_ID = "owner-main"/);
  assert.match(api, /\/api\/1lss\/history-page/);
  assert.match(api, /\/api\/1lss\/sessions/);
  assert.match(chat, /x-ogenic-session-ref/);
  assert.match(chat, /rememberSessionRef/);
  assert.match(entry, /createSessionRecoveryApi/);
  assert.match(ui, /Load older 1LSS/);
  assert.match(ui, /RECENT DOORS/);
  assert.match(ui, /session_ref: viewportSessionRef/);
  assert.match(ui, /type MemoryPersistenceReceipt/);
  assert.match(ui, /function memoryPersistenceNotice/);
  assert.match(ui, /X-OGENIC-1LSS-PERSISTENCE/);
  assert.match(ui, /1LSS SAVED/);
  assert.match(ui, /1LSS UNAVAILABLE/);
  assert.match(ui, /NOT CONFIRMED/);
});

test("stored session URLs are sanitized before persistence", () => {
  const api = read("worker/session-recovery-api.ts");
  const chat = read("worker/chat-model-api.ts");
  assert.match(api, /return `\$\{url\.origin\}\$\{url\.pathname\}`/);
  assert.match(chat, /return `\$\{url\.origin\}\$\{url\.pathname\}`/);
});
