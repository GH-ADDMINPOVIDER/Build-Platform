import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("../worker/local-agent-team-api.ts", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../worker/entry-yellow-stone.ts", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../src/LocalAgentTeamPanel.tsx", import.meta.url), "utf8");
const wave = fs.readFileSync(new URL("../src/WaveNext.tsx", import.meta.url), "utf8");

test("local agent team reuses canonical queue and has resumable task operations", () => {
  for (const route of ["/api/local-agent-team/state", "/api/local-agent-team/providers", "/api/local-agent-team/tasks", "/handoff", "/result", "/checkpoint"]) assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
  for (const table of ["agent_tasks", "agent_events", "agent_checkpoints"]) assert.match(api, new RegExp(table));
  assert.doesNotMatch(api, /CREATE TABLE/i);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /SECRET_LIKE_INPUT_REJECTED/);
  assert.match(api, /OWNER_SESSION = "owner-main\/1LSS_OWNER_MAIN"/);
  assert.match(api, /provider_execution: "NOT_STARTED"/);
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /REAUTH_REQUIRED/);
});

test("local agent team is wired through Yellow Stone and existing Agent Deck", () => {
  assert.match(entry, /createLocalAgentTeamApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/local-agent-team\/"\)/);
  assert.match(wave, /LocalAgentTeamPanel/);
  assert.match(ui, /Create task/);
  assert.match(api, /hasOwnerSession/);
  assert.match(ui, /signed Owner Session/);
});

test("OpenBot Launch Room uses existing Agent Deck and canonical D1 events", () => {
  assert.match(ui, /Launch Room/);
  assert.match(ui, /waveLaunchRoom/);
  assert.match(ui, /\/api\/local-agent-team\/messages/);
  assert.match(ui, /Persistent conversation/);
  assert.match(ui, /No verified room adapter available/);
  assert.match(ui, /Record BLOCKED result/);
  assert.match(api, /api\.post\("\/api\/local-agent-team\/messages"/);
  assert.match(api, /LOCAL_TEAM_MESSAGE/);
  assert.match(api, /agent_checkpoints/);
  assert.match(api, /target\.kind !== "specialist"/);
  assert.match(api, /target\.state !== "LIVE"/);
  assert.match(api, /room_adapter: "UNVERIFIED"/);
});

test("OpenBot read-only Codex dispatch connects existing Owner Yellow command and Runner-1 receipt", () => {
  assert.match(api, /ExistingWaveDispatcher/);
  assert.match(entry, /createLocalAgentTeamApi\(/);
  assert.match(entry, /athenaGuardedCommand\(request, bindings as Bindings, ctx\)/);
  assert.match(api, /\/api\/local-agent-team\/tasks\/:taskId\/dispatch/);
  assert.match(api, /provider: "openai", mode: "read"/);
  assert.match(api, /OGE129 READONLY PROOF:/);
  assert.match(api, /READ_ONLY_ADAPTER_SCOPE/);
  assert.match(api, /CODEX_READONLY_RUNTIME_UNVERIFIED/);
  assert.match(api, /LOCAL_TEAM_COMMAND_LINKED/);
  assert.match(entry, /LOCAL_TEAM_RESULT_VERIFIED/);
  assert.match(entry, /INSERT INTO agent_checkpoints/);
  assert.match(api, /COMMAND_RESULT_DONE/);
  assert.match(ui, /Run Codex read-only/);
  assert.match(ui, /readonlyEligible/);
  assert.match(ui, /QUEUED ≠ DONE/);
  assert.doesNotMatch(api, /CREATE TABLE/);
});
test("OpenBot reports absent external adapters and forbids room WRITE execution", () => {
  assert.match(api, /agentId !== "codex"/);
  assert.match(api, /permission !== "READ"/);
  assert.match(api, /hasOwnerSession/);
  assert.match(api, /ORIGIN_DENIED/);
  assert.match(api, /ROOM_TASK_NOT_FOUND/);
  assert.match(api, /NO_PROVIDER_CALL_FROM_ROOM/);
  assert.match(ui, /No verified room adapter available/);
});
