import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("OGE Athena bridge exposes only the intended read-only tools", async () => {
  const source = await read("worker/wave-manus-mcp-api.ts");
  for (const name of [
    "oge_athena_snapshot",
    "oge_d1_health",
    "oge_athena_permissions",
    "oge_1lss_sessions",
    "oge_integration_bindings",
  ]) assert.ok(source.includes(name), `missing MCP tool: ${name}`);

  assert.equal((source.match(/readOnlyHint: true/g) || []).length, 5);
  assert.equal((source.match(/destructiveHint: false/g) || []).length, 5);
  assert.doesNotMatch(source, /createCapabilityExecutionApi|executeConnectorFunction|\/api\/capabilities\/execute/);
});

test("MCP endpoint fails closed using a dedicated read token, not the owner operations key", async () => {
  const source = await read("worker/wave-manus-mcp-api.ts");
  assert.ok(source.includes("OGENIC_MCP_READ_TOKEN"));
  assert.ok(source.includes('code: "CONFIGURATION_REQUIRED"'));
  assert.ok(source.includes('code: "REAUTH_REQUIRED"'));
  assert.ok(source.includes('WWW-Authenticate'));
  assert.doesNotMatch(source, /OGENIC_OPS_KEY/);
});

test("D1 health distinguishes empty tables from query failures per table", async () => {
  const source = await read("worker/wave-manus-mcp-api.ts");
  assert.ok(source.includes('"QUERY_ERROR"'));
  assert.ok(source.includes('raw === 0 ? "EMPTY" : "READ_OK"'));
  assert.ok(source.includes("TABLE_MISSING_OR_QUERY_FAILED"));
  assert.ok(source.includes("SELECT COUNT(*) AS row_count"));
  assert.ok(source.includes('"chat_session_refs"'));
});

test("session tool reports existing 1LSS references without loading message bodies or session URLs", async () => {
  const source = await read("worker/wave-manus-mcp-api.ts");
  assert.ok(source.includes("STORED_REFERENCE_ONLY_NOT_LIVE_PROVIDER_SESSION_PROOF"));
  assert.ok(source.includes("WHERE conversation_id = ?"));
  assert.ok(source.includes("source_surface, session_ref, label, first_sequence, last_sequence"));
  assert.doesNotMatch(source, /SELECT[^\n]*session_url/);
  assert.doesNotMatch(source, /secret_ref:\s*row\.secret_ref/);
});

test("worker route and Cloudflare asset routing include /mcp", async () => {
  const [entry, wrangler] = await Promise.all([
    read("worker/entry-yellow-stone.ts"),
    read("wrangler.jsonc"),
  ]);
  const parsed = JSON.parse(wrangler);
  assert.ok(entry.includes('if (pathname === "/mcp")'));
  assert.ok(entry.includes("handleWaveManusMcp(request"));
  assert.ok(parsed.assets.run_worker_first.includes("/mcp"));
  assert.equal(parsed.name, "ogenic-phase-vi-staging");
});

test("dedicated MCP token remains optional in existing staging runtime bindings", async () => {
  const manifest = JSON.parse(await read("config/staging-runtime-bindings.json"));
  assert.ok(manifest.connector_optional.includes("OGENIC_MCP_READ_TOKEN"));
  assert.ok(!manifest.required.includes("OGENIC_MCP_READ_TOKEN"));
});

test("portable plugin points to the remote staging MCP route without storing credentials", async () => {
  const [plugin, mcp, skill] = await Promise.all([
    read("plugins/oge-athena/plugin.json"),
    read("plugins/oge-athena/mcp.json"),
    read("plugins/oge-athena/skills/athena/SKILL.md"),
  ]);
  const pluginManifest = JSON.parse(plugin);
  const mcpManifest = JSON.parse(mcp);
  assert.equal(pluginManifest.name, "oge-athena");
  assert.equal(mcpManifest.mcpServers["oge-athena"].type, "streamable-http");
  assert.equal(mcpManifest.mcpServers["oge-athena"].url, "https://wave.ogenicchocolate.com/mcp");
  assert.equal(mcpManifest.mcpServers["oge-athena"].extensions["com.openai"].auth.type, "api_key");
  assert.doesNotMatch(plugin + mcp, /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|OGENIC_OPS_KEY\s*[:=])/);
  assert.match(skill, /evidence-first/i);
  assert.ok(skill.includes("YELLOW_STONE_ONLY") || skill.includes("Yellow Stone"));
});

test("plugin docs clearly distinguish implemented source from live deployment proof", async () => {
  const docs = await read("docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md");
  assert.ok(docs.includes("not deployed"));
  assert.ok(docs.includes("OGENIC_MCP_READ_TOKEN"));
  assert.ok(docs.includes("stored references"));
  assert.ok(docs.includes("OAuth"));
});
