import assert from "node:assert/strict";
import { append1LssEvent } from "../server.js";

const baseUrl = String(
  process.env.OGENIC_1LSS_BASE_URL ||
  process.env.OGENIC_PHASE_VI_STAGING_URL ||
  process.env.OGENIC_1LSS_URL ||
  "",
).trim().replace(/\/+$/, "");
const opsKey = String(process.env.OGENIC_OPS_KEY || "").trim();

if (!baseUrl) throw new Error("CONFIGURATION_REQUIRED: set OGENIC_PHASE_VI_STAGING_URL or OGENIC_1LSS_BASE_URL");
if (!opsKey) throw new Error("REAUTH_REQUIRED: OGENIC_OPS_KEY must be bound server-side");
if (!/^https:\/\//i.test(baseUrl)) throw new Error("STAGING_URL_MUST_USE_HTTPS");

const turnId = String(process.env.OGENIC_1LSS_PROOF_TURN_ID || `runtime-proof-${Date.now()}`).slice(0, 180);
const marker = `OGENIC_1LSS_RUNTIME_PROOF:${turnId}`;
const input = {
  turnId,
  role: "assistant",
  content: marker,
  sourceSurface: "plugin-harness",
  model: "gpt-5.6-sol",
};
const options = { baseUrl, opsKey };

const first = await append1LssEvent(input, options);
const replay = await append1LssEvent(input, options);

assert.equal(first.ok, true);
assert.equal(first.conversation_id, "owner-main");
assert.equal(first.session_line, "1LSS_OWNER_MAIN");
assert.equal(first.source_surface, "plugin-harness");
assert.equal(first.replayed, false);
assert.equal(replay.sequence_no, first.sequence_no);
assert.equal(replay.replayed, true);

const authHeaders = { "x-ogenic-ops-key": opsKey };
const eventsResponse = await fetch(
  `${baseUrl}/api/1lss/events?after_sequence=${Math.max(0, first.sequence_no - 1)}&limit=10`,
  { headers: authHeaders },
);
const eventsBody = await eventsResponse.json().catch(() => ({}));
assert.equal(eventsResponse.ok, true, `events probe HTTP ${eventsResponse.status}`);
assert.equal(eventsBody?.ok, true);
assert.equal(eventsBody?.conversation_id, "owner-main");
assert.equal(eventsBody?.session_line, "1LSS_OWNER_MAIN");

const matches = (Array.isArray(eventsBody?.messages) ? eventsBody.messages : []).filter(
  (row) => Number(row?.sequence_no) === first.sequence_no &&
    row?.source_surface === "plugin-harness" &&
    row?.text === marker,
);
assert.equal(matches.length, 1, "canonical event not found exactly once");

const statusResponse = await fetch(`${baseUrl}/api/1lss/status`, { headers: authHeaders });
const statusBody = await statusResponse.json().catch(() => ({}));
assert.equal(statusResponse.ok, true, `status probe HTTP ${statusResponse.status}`);
assert.equal(statusBody?.ok, true);
assert.equal(statusBody?.conversation_id, "owner-main");
assert.equal(statusBody?.session_line, "1LSS_OWNER_MAIN");
assert.ok(Number(statusBody?.latest_sequence ?? 0) >= first.sequence_no);

console.log(JSON.stringify({
  ok: true,
  proof: "1LSS_PLUGIN_WRITER_RUNTIME",
  conversation_id: first.conversation_id,
  session_line: first.session_line,
  source_surface: first.source_surface,
  sequence_no: first.sequence_no,
  replay_same_sequence: replay.sequence_no === first.sequence_no,
  replayed: replay.replayed,
  event_seen_once: matches.length === 1,
  cross_surface_ready: Boolean(statusBody?.cross_surface_ready),
  status_latest_sequence: Number(statusBody?.latest_sequence ?? 0),
}, null, 2));
