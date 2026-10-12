import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("OGE Athena bridge exposes only the intended read-only tools with explicit OAuth scopes", async () => {
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
  assert.equal((source.match(/securitySchemes: \[\{ type: "oauth2"/g) || []).length, 5);
  assert.doesNotMatch(source, /createCapabilityExecutionApi|executeConnectorFunction|\/api\/capabilities\/execute/);
});

test("owner OAuth server supports discovery, DCR, PKCE, one-time codes and rotating refresh tokens", async () => {
  const oauth = await read("worker/wave-mcp-oauth.ts");
  const entry = await read("worker/entry-yellow-stone.ts");
  assert.ok(entry.includes("isWaveOAuthPath(pathname)"));
  assert.ok(entry.includes("handleWaveOAuth(request"));
  assert.ok(oauth.includes("/.well-known/oauth-protected-resource/mcp"));
  assert.ok(oauth.includes("/.well-known/oauth-authorization-server"));
  assert.ok(oauth.includes("/oauth/register"));
  assert.ok(oauth.includes("/oauth/authorize"));
  assert.ok(oauth.includes("/oauth/token"));
  assert.ok(oauth.includes("/oauth/revoke"));
  assert.ok(oauth.includes('code_challenge_method !== "S256"'));
  assert.ok(oauth.includes("SET consumed_at = ?"));
  assert.ok(oauth.includes("UPDATE mcp_oauth_tokens SET revoked_at"));
  assert.ok(oauth.includes("Only authorization_code and refresh_token are supported."));
  assert.ok(oauth.includes("hasOwnerSession(request, env)"));
  assert.ok(oauth.includes("fetch('/api/session'"));
  assert.doesNotMatch(oauth, /OGENIC_MCP_READ_TOKEN/);
});

test("OAuth client registration and redirect validation fail closed", async () => {
  const oauth = await read("worker/wave-mcp-oauth.ts");
  assert.ok(oauth.includes('url.protocol !== "https:"'));
  assert.ok(oauth.includes('authMethod !== "none"'));
  assert.ok(oauth.includes("OAUTH_CLIENT_URL"));
  assert.ok(oauth.includes('redirect: "error"'));
  assert.ok(oauth.includes('decisionInput === "deny"'));
  assert.ok(oauth.includes("client.redirect_uris.includes(params.redirect_uri)"));
  assert.ok(oauth.includes('params.resource !== RESOURCE'));
});

test("MCP protected calls return OAuth resource metadata and do not execute without the right scopes", async () => {
  const source = await read("worker/wave-manus-mcp-api.ts");
  const oauth = await read("worker/wave-mcp-oauth.ts");
  assert.ok(source.includes("verifyMcpAccessToken(request, env)"));
  assert.ok(source.includes('"mcp/www_authenticate"'));
  assert.ok(source.includes("insufficient_scope"));
  assert.ok(source.includes("ogenic:sessions:read"));
  assert.ok(oauth.includes('row.resource !== RESOURCE'));
  assert.ok(oauth.includes('row.token_type !== "access"') || oauth.includes("token_type = 'access'"));
  assert.ok(oauth.includes("Number(row.expires_at) <= Date.now()"));
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

test("worker route and Cloudflare asset routing include /mcp and OAuth paths", async () => {
  const [entry, wrangler] = await Promise.all([
    read("worker/entry-yellow-stone.ts"),
    read("wrangler.jsonc"),
  ]);
  const parsed = JSON.parse(wrangler);
  assert.ok(entry.includes('if (pathname === "/mcp")'));
  assert.ok(entry.includes("handleWaveManusMcp(request"));
  assert.ok(entry.includes("isWaveOAuthPath(pathname)"));
  assert.ok(parsed.assets.run_worker_first.includes("/mcp"));
  assert.equal(parsed.name, "ogenic-phase-vi-staging");
});

test("OAuth migration is additive candidate only and reuses canonical 1LSS tables", async () => {
  const migration = await read("database/migrations/0016_oge_athena_oauth.sql");
  const docs = await read("docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md");
  for (const name of ["mcp_oauth_clients", "mcp_oauth_authorization_codes", "mcp_oauth_tokens"]) assert.ok(migration.includes(name));
  assert.ok(migration.includes("token_hash TEXT PRIMARY KEY"));
  assert.ok(migration.includes("code_hash TEXT PRIMARY KEY"));
  assert.ok(docs.includes("has not been applied"));
  assert.ok(docs.includes("owner-main"));
  assert.ok(!migration.includes("chat_messages"));
});

test("portable plugin declares owner OAuth and contains no credential values", async () => {
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
  assert.deepEqual(Object.keys(mcpManifest.mcpServers["oge-athena"]).sort(), ["type", "url"]);
  assert.doesNotMatch(plugin + mcp, /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|OGENIC_OPS_KEY\s*[:=])/);
  assert.match(skill, /evidence-first/i);
  assert.ok(skill.includes("YELLOW_STONE_ONLY") || skill.includes("Yellow Stone"));
});

test("setup docs distinguish source implementation from actual deployment proof", async () => {
  const docs = await read("docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md");
  assert.ok(docs.includes("feature branch only"));
  assert.ok(docs.includes("OGENIC WAVE authorization page"));
  assert.ok(docs.includes("OAuth"));
  assert.ok(docs.includes(".well-known/oauth-protected-resource/mcp"));
  assert.ok(docs.includes("has not been applied"));
  assert.ok(docs.includes("not proof"));
});
