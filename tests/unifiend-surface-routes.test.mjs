import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Unifiend exposes distinct web chat command agents and operate routes", async () => {
  const main = await read("src/main.tsx");
  assert.match(main, /pathname === "\/command"/);
  assert.match(main, /pathname === "\/agents"/);
  assert.match(main, /<Landing \/>/);
  assert.match(main, /<UnifiedChat surface=\{sourceSurface\} \/>/);
  assert.match(main, /<UnifiendNext initialTab="run" surface="command" \/>/);
  assert.match(main, /<UnifiendNext initialTab="agent" surface="agents" \/>/);
  assert.match(main, /<UnifiendNext initialTab="run" surface="operate" \/>/);
});

test("landing navigation never aliases command or agents back to chat", async () => {
  const landing = await read("src/Landing.tsx");
  assert.match(landing, /href="\/chat">CHAT/);
  assert.match(landing, /href="\/command">COMMAND/);
  assert.match(landing, /href="\/agents">AGENTS/);
  assert.match(landing, /href="\/overview">OPERATE/);
  assert.match(landing, /title: "AGENT DECK"[\s\S]*href: "\/agents"/);
  assert.match(landing, /title: "Unifiend COMMAND"[\s\S]*href: "\/command"/);
  assert.doesNotMatch(landing, /title: "AGENT DECK"[\s\S]{0,180}href: "\/chat"/);
});

test("command remains guarded and agents remain separate from execution authority", async () => {
  const unifiend = await read("src/UnifiendNext.tsx");
  assert.match(unifiend, /fetch\("\/api\/unifiend\/command"/);
  assert.match(unifiend, /Yellow Stone/);
  assert.match(unifiend, /href="\/command">Open Command/);
  assert.match(unifiend, /href="\/agents">AGENTS/);
  assert.match(unifiend, /href="\/overview">OPERATE/);
  assert.doesNotMatch(unifiend, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});


test("fresh Agent AI status reads are diverted to ATHENA before replay or Agent Session", async () => {
  const entry = await read("worker/entry-connectors.ts");
  const agentBlock = entry.slice(entry.indexOf('if (pathname === "/api/chat/agent")'));
  assert.match(entry, /export function isFreshAgentReadRequest/);
  assert.match(entry, /FRESH_AGENT_TIME_PATTERN/);
  assert.match(entry, /FRESH_AGENT_TARGET_PATTERN/);
  assert.match(agentBlock, /freshAgentReadRequest\(request\)/);
  assert.match(agentBlock, /athenaChatRequest\(request\)/);
  assert.match(entry, /ATHENA_VERIFIED_READ/);
  assert.match(entry, /agent_session_started:\s*false/);
  assert.ok(
    agentBlock.indexOf("freshAgentReadRequest(request)") < agentBlock.indexOf("cachedAgentReplay(request, env)"),
    "freshness routing must happen before cached Agent replay",
  );
  assert.ok(
    agentBlock.indexOf("athenaChatApi.fetch") < agentBlock.indexOf("connectorApi.fetch"),
    "verified READ handoff must happen before an Agent Session path",
  );
});

test("ordinary Agent AI prompts retain the existing Agent Session path", async () => {
  const entry = await read("worker/entry-connectors.ts");
  const agentBlock = entry.slice(entry.indexOf('if (pathname === "/api/chat/agent")'));
  assert.match(agentBlock, /cachedAgentReplay\(request, env\)/);
  assert.match(agentBlock, /connectorApi\.fetch\(request, env/);
  assert.doesNotMatch(agentBlock, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});
