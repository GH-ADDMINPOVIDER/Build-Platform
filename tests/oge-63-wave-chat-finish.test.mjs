import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync("src/UnifiedChat.tsx", "utf8");
const css = readFileSync("src/unified-chat.css", "utf8");
const api = readFileSync("worker/chat-message-action-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");

test("OGE-63 gives user and WAVE messages distinct acrylic depth", () => {
  assert.match(css, /\.ucMessage\.user\{/);
  assert.match(css, /#5dffbe/);
  assert.match(css, /\.ucMessage\.assistant\{/);
  assert.match(css, /#8f82ff/);
  assert.match(css, /backdrop-filter:blur\(18px\)/);
  assert.match(chat, /message\.role === "user" \? "YOU"/);
  assert.match(chat, /message\.created_at \? new Date\(message\.created_at\)\.toLocaleString\(\)/);
});

test("OGE-63 action bar controls have real browser behavior", () => {
  assert.match(chat, /navigator\.clipboard\?\.writeText/);
  assert.match(chat, /navigator\.share/);
  assert.match(chat, /SpeechSynthesisUtterance/);
  assert.match(chat, /speechSynthesis\.speak/);
  assert.match(chat, /Retry queued in composer/);
  assert.match(chat, /setDraft\(priorUser\.text\)/);
  assert.match(chat, />Copy<\/button>/);
  assert.match(chat, />Share<\/button>/);
  assert.match(chat, /"Stop" : "Listen"/);
  assert.match(chat, />Retry<\/button>/);
  assert.match(chat, />Evidence<\/button>/);
  assert.match(chat, />More<\/button>/);
});

test("retry is user-mediated and does not silently spend provider tokens", () => {
  const retry = chat.slice(chat.indexOf("async function retryMessage"), chat.indexOf("async function reactToMessage"));
  assert.match(retry, /setDraft\(priorUser\.text\)/);
  assert.match(retry, /composerInput\.current\?\.focus/);
  assert.doesNotMatch(retry, /runChat\(|runAgentAI\(|runHostedTools\(|send\(\)/);
});

test("reaction and feedback persist reference-only events in existing agent_events", () => {
  assert.match(api, /hasOwnerSession/);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /INSERT OR IGNORE INTO agent_events/);
  assert.match(api, /task_id, event_type, actor, correlation_id, external_ref/);
  assert.match(api, /raw_message_stored: false/);
  assert.match(api, /SECRET_LIKE_INPUT_REJECTED/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
  assert.match(entry, /pathname === "\/api\/chat\/message-action"/);
});

test("Evidence opens a safe source or real WAVE run surface", () => {
  assert.match(chat, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(chat, /window\.open\(url\.toString\(\), "_blank", "noopener,noreferrer"\)/);
  assert.match(chat, /window\.location\.assign\(\x60\/overview\?tab=run/);
  assert.match(chat, /EVIDENCE_OPENED/);
});

test("message actions remain mobile-friendly", () => {
  assert.match(css, /\.ucMessageActions/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /\.ucMessageMore\{position:fixed/);
  assert.match(css, /safe-area-inset-bottom/);
});
