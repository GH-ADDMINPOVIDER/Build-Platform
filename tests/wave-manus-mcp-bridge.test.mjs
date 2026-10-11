import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("WAVE remote MCP and n8n intake are dispatched through the staging Worker, not static assets", () => {
  const router = read("worker/entry-yellow-stone.ts");
  const wrangler = read("wrangler.jsonc");
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(router, /createWaveManusMcpApi/);
  assert.match(router, /pathname === "\/mcp"/);
  assert.match(router, /pathname === "\/hooks\/n8n\/data-stone"/);
  assert.match(wrangler, /"run_worker_first"[\s\S]{0,180}"\/mcp"/);
  assert.match(bridge, /\/hooks\/n8n\/data-stone/);
});

test("Manus uses a bearer-protected Streamable HTTP MCP endpoint with the required tool inventory", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /WAVE_MANUS_MCP_TOKEN/);
  assert.match(bridge, /safeEqual\(bearer\(request\), expected\)/);
  assert.match(bridge, /message\.method === "initialize"/);
  assert.match(bridge, /message\.method === "tools\/list"/);
  assert.match(bridge, /message\.method === "tools\/call"/);
  for (const name of [
    "wave_bridge_status",
    "wave_intake_add",
    "wave_intake_list",
    "wave_intake_read",
    "wave_intake_ack",
  ]) assert.match(bridge, new RegExp('name: "' + name + '"'));
  assert.match(bridge, /MCP-Protocol-Version/);
  assert.match(bridge, /GET\/SSE is not enabled/);
});

test("n8n ingress has a separate bearer credential and retry-safe idempotency key", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /WAVE_N8N_HOOK_TOKEN/);
  assert.match(bridge, /async function handleN8n/);
  assert.match(bridge, /request\.headers\.get\("idempotency-key"\)/);
  assert.match(bridge, /addIntakeItem\(env, item, "n8n"\)/);
  assert.match(bridge, /UNAUTHORIZED/);
  assert.match(bridge, /no-store/);
});

test("temporary Data Stone uses existing D1 event/dedup and attachment tables without a schema migration", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /const TTL_MS = 5 \* 60 \* 1000/);
  assert.match(bridge, /connector_events/);
  assert.match(bridge, /connector_hook_dedup/);
  assert.match(bridge, /chat_attachments/);
  assert.match(bridge, /DELETE FROM chat_attachments WHERE id = \? AND conversation_id = \?/);
  assert.match(bridge, /DELETE FROM connector_events WHERE provider = \? AND created_at < \?/);
  assert.match(bridge, /expires_at/);
  assert.doesNotMatch(bridge, /CREATE TABLE|ALTER TABLE|database\/migrations/);
});

test("media reads return actual existing bytes through MCP and never claim URL-only references were read", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /const actualBytes = Math\.max/);
  assert.match(bridge, /actualBytes !== Number\(row\.size_bytes\)/);
  assert.match(bridge, /type: "image", data: row\.data_base64, mimeType: row\.mime_type/);
  assert.match(bridge, /MEDIA_BYTES_NOT_STORED/);
  assert.match(bridge, /bytes_verified: Boolean\(value\.data\)/);
  assert.match(bridge, /MAX_ATTACHMENT_BYTES = 4_000_000/);
  assert.match(bridge, /owned_attachment: ownedAttachment/);
  assert.doesNotMatch(bridge, /data_url:\s*value\.data/);
});

test("URL intake is HTTPS-only and rejects credential-bearing or signed media URLs", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /parsed\.protocol !== "https:"/);
  assert.match(bridge, /URL_CREDENTIALS_NOT_ALLOWED/);
  assert.match(bridge, /SENSITIVE_OR_SIGNED_URL_NOT_ALLOWED/);
  assert.match(bridge, /INVALID_BASE64/);
  assert.match(bridge, /UNSUPPORTED_MEDIA_TYPE/);
});

test("current stateless MCP revision validates discovery and mirrored protocol/method/name headers", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /MODERN_MCP = "2026-07-28"/);
  assert.match(bridge, /message\.method === "server\/discover"/);
  assert.match(bridge, /io\.modelcontextprotocol\/protocolVersion/);
  assert.match(bridge, /Mcp-Method/);
  assert.match(bridge, /Mcp-Name/);
  assert.match(bridge, /resultType: existing\.resultType \|\| "complete"/);
  assert.match(bridge, /originAllowed\(request, env\)/);
  assert.match(bridge, /WAVE_MCP_ALLOWED_ORIGINS/);
});


test("n8n health adapter honors the actual staging binding and reports a live probe instead of config guesses", () => {
  const runtime = read("worker/connector-runtime.ts");
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(runtime, /N8N_SELFHOST_BASE_URL\?: string/);
  assert.match(runtime, /safeBaseUrl\(env\.N8N_BASE_URL \|\| env\.N8N_SELFHOST_BASE_URL\)/);
  assert.match(bridge, /const n8n = await inspectN8n\(env\)/);
  assert.match(bridge, /n8n_live_probe/);
  assert.match(bridge, /N8N_BASE_URL \|\| env\.N8N_SELFHOST_BASE_URL/);
});

test("MCP reports protocol mismatch separately from an unsupported requested version", () => {
  const bridge = read("worker/wave-manus-mcp-api.ts");
  assert.match(bridge, /function unsupportedProtocolVersion/);
  assert.match(bridge, /code: -32022/);
  assert.match(bridge, /data: \{ supported: MCP_PROTOCOLS, requested: requested \|\| null \}/);
  assert.match(bridge, /code: -32020|HeaderMismatch:/);
});
