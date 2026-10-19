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
  assert.match(ui, /WAITING_APPROVAL|OWNER_APPROVAL_REQUIRED/);
});
