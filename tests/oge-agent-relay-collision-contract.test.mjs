import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("MCP routes relay and collision tools through existing gateway", async () => {
  const mcp = await read("worker/wave-manus-mcp-api.ts");
  const relay = await read("worker/agent-relay-tools.ts");
  const sim = await read("worker/agent-collision-simulator.ts");
  for (const name of ["agent_send_message", "agent_list_messages", "agent_ack_message", "agent_get_thread"]) assert.ok(relay.includes(name));
  for (const name of ["agent_create_collision_scenario", "agent_get_collision_scenario", "agent_submit_collision_result", "agent_replay_collision"]) assert.ok(sim.includes(name));
  assert.ok(mcp.includes("...AGENT_RELAY_TOOLS"));
  assert.ok(mcp.includes("...AGENT_COLLISION_TOOLS"));
  assert.ok(mcp.includes('["ogenic:relay"]'));
  assert.ok(mcp.includes('["ogenic:simulate"]'));
});

test("Agent Identity is assigned in OAuth consent and bound to the access token", async () => {
  const oauth = await read("worker/wave-mcp-oauth.ts");
  const relay = await read("worker/agent-relay-tools.ts");
  assert.ok(oauth.includes('name="agent_id"'));
  assert.ok(oauth.includes("selectedAgentId"));
  assert.ok(oauth.includes("agentId: String(row.agent_id)"));
  assert.ok(relay.includes("const actor = requireActor(actorValue)"));
});

test("D1 message ledger and collision ledger are separate", async () => {
  const migration = await read("database/migrations/0016_oge_athena_oauth.sql");
  const relay = await read("worker/agent-relay-tools.ts");
  const sim = await read("worker/agent-collision-simulator.ts");
  for (const table of ["agent_threads", "agent_messages", "agent_simulation_runs", "agent_simulation_events"]) assert.ok(migration.includes(table));
  assert.ok(relay.includes("INSERT OR IGNORE INTO agent_events"));
  assert.ok(sim.includes('environment: "SIMULATED_ONLY"'));
  assert.ok(!sim.includes("INSERT INTO agent_messages"));
  assert.ok(!sim.includes("INSERT INTO agent_events"));
});

test("Collision Lab supports repeatable context, delivery, ordering, session, loop and identity scenarios", async () => {
  const sim = await read("worker/agent-collision-simulator.ts");
  for (const name of ["STALE_CONTEXT", "DUPLICATE_DELIVERY", "OUT_OF_ORDER", "SESSION_DRIFT", "DELEGATION_LOOP", "IDENTITY_SPOOF"]) assert.ok(sim.includes(name));
  assert.ok(sim.includes("function seedNumber(seed: string)"));
  assert.ok(sim.includes("Fault labels, the peer's view, and expected invariants are withheld"));
  assert.ok(sim.includes("required_reports: 2"));
  assert.ok(sim.includes("SIMULATION_NOT_COMPLETE"));
});

test("Architecture report states source-only and live-runtime evidence boundaries", async () => {
  const report = await read("docs/integrations/OGENIC_AGENT_RELAY_EXISTING_ARCHITECTURE.md");
  const docs = await read("docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md");
  for (const item of ["worker/task-inbox-api.ts", "worker/connector-runtime.ts", "worker/n8n-migration-api.ts", "worker/discord-api.ts"]) assert.ok(report.includes(item));
  assert.ok(report.includes("not deployed"));
  assert.ok(docs.includes("HELLO_GT_FROM_GS"));
  assert.ok(docs.includes("HELLO_GS_FROM_GT"));
});
