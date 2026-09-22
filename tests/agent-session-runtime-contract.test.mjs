import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Agent AI uses real OpenAI Agent Sessions and preserves canonical 1LSS stamping", () => {
  const connector = read("worker/connector-app-api.ts");
  const entry = read("worker/entry-connectors.ts");
  const ui = read("src/UnifiedChat.tsx");

  assert.match(connector, /api\.post\("\/api\/chat\/agent"/);
  assert.match(connector, /https:\/\/api\.openai\.com\/v1\/agents\/sessions/);
  assert.doesNotMatch(connector, /name:\s*"OGENIC Agent AI"/);
  assert.match(connector, /"OpenAI-Beta": "agents=v1"/);
  assert.match(connector, /environment:\s*\{ type: "none" \}/);
  assert.match(connector, /agent_session_id/);
  assert.match(connector, /agent\.session\.turn\.output_text\.done/);
  assert.match(connector, /agent\.session\.turn\.output_text\.delta/);
  assert.match(connector, /event\.turn\?\.subagent_id == null/);
  assert.match(connector, /agent\.session\.environment\.failed/);
  assert.match(connector, /runtime:\s*"OPENAI_AGENT_SESSION"/);
  assert.match(connector, /conversation_id:\s*"owner-main"/);
  assert.match(connector, /session_line:\s*"1LSS_OWNER_MAIN"/);

  assert.match(entry, /pathname === "\/api\/chat\/functions" \|\| pathname === "\/api\/chat\/agent"/);
  assert.match(entry, /stampFunctionTurn\(stampRequest, response, env\)/);
  assert.match(entry, /result\.runtime === "OPENAI_AGENT_SESSION"/);
  assert.match(entry, /clip\(result\.agent_session_id, 160\)/);
  assert.match(entry, /run_id, created_at/);

  assert.match(ui, /async function runAgentAI/);
  assert.match(ui, /fetch\("\/api\/chat\/agent"/);
  assert.match(ui, /experienceMode === "agent-ai"\) await runAgentAI\(prompt\)/);
  assert.doesNotMatch(ui, /experienceMode === "agent-ai"\) await runHostedTools\(prompt, "auto"\)/);
});

test("standalone full agent runner remains available for hosted workspace execution", () => {
  const runner = read("scripts/openai-agent-full.mjs");
  assert.match(runner, /\/v1\/agents\/sessions/);
  assert.match(runner, /environment:\s*\{ type: 'openai_hosted' \}/);
  assert.match(runner, /SESSION_ID=/);
});
