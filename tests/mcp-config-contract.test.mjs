import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("MCP config is owner/ops gated and mounted behind Yellow Stone", async () => {
  const api = await read("worker/mcp-config-api.ts");
  const entry = await read("worker/entry-yellow-stone.ts");
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /REAUTH_REQUIRED/);
  assert.match(entry, /createMcpConfigApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/mcp-config\/"\)/);
});

test("MCP config reuses provider_bindings and never creates a new D1 schema", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /FROM provider_bindings/);
  assert.match(api, /INSERT INTO provider_bindings/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
  assert.match(api, /binding_type = 'mcp'/);
  assert.match(api, /environment = 'staging'/);
});

test("raw credentials and arbitrary endpoints fail closed", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /SECRET_REF_REQUIRED_NO_RAW_CREDENTIALS/);
  assert.match(api, /MCP_ENDPOINT_NOT_ALLOWLISTED/);
  assert.match(api, /url\.protocol !== "https:"/);
  assert.match(api, /url\.username \|\| url\.password \|\| url\.port/);
  assert.match(api, /ALLOWED_HOSTS/);
  assert.match(api, /ALLOWED_SUFFIXES/);
  assert.match(api, /env:\[A-Z\]/);
});

test("read-only discovery uses initialize then tools/list", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /"initialize"/);
  assert.match(api, /"tools\/list"/);
  assert.match(api, /MCP-Protocol-Version/);
  assert.match(api, /AbortController/);
  assert.match(api, /Authorization = `Bearer \$\{token\}`/);
});

test("simulated proof is explicit and never represented as real LIVE", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /provider === "simulated"/);
  assert.match(api, /state: "SIMULATED"/);
  assert.match(api, /real_available: false/);
  assert.match(api, /NO_EXTERNAL_SIDE_EFFECTS/);
  assert.match(api, /MCP_BINDING_NOT_ENABLED/);
  assert.match(api, /CONFIGURATION_REQUIRED/);
});

test("configuration mutations stay OGE-26 human approval gated", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /\["register", "enable", "disable"\]/);
  assert.match(api, /body\.approved !== true/);
  assert.match(api, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(api, /policy: "OGE26"/);
  assert.match(api, /OGE26_APPROVAL_REQUIRED_FOR_CONSEQUENTIAL_TOOLS/);
});

test("canonical 1LSS identity is preserved", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /owner-main/);
  assert.match(api, /1LSS_OWNER_MAIN/);
});

test("Unifiend MCP UI uses references and safe metadata instead of secret values", async () => {
  const ui = await read("src/McpConfigCenter.tsx");
  assert.match(ui, /\/api\/mcp-config\/state/);
  assert.match(ui, /\/api\/mcp-config\/discover/);
  assert.match(ui, /secret ref only/);
  assert.match(ui, /Never paste a token, password, cookie, private key, or SSH key/);
  assert.doesNotMatch(ui, /secret_value|token_value|private_key_value|credential_value/);
  assert.match(ui, /Safe simulated discovery/);
});

test("bounded Github remote read-proof is owner-only, readonly and evidence-only", async () => {
  const api = await read("worker/mcp-config-api.ts");
  assert.match(api, /action === "read_proof"/);
  assert.match(api, /hasOwnerSession\(c\.req\.raw, c\.env\)/);
  assert.match(api, /provider !== "github"/);
  assert.match(api, /https:\/\/api\.githubcopilot\.com\/mcp\/readonly/);
  assert.match(api, /"get_file_contents"/);
  assert.match(api, /entry.type !== "resource"/);
  assert.match(api, /resource.text/);
  assert.match(api, /resourceTexts.length/);
  assert.match(api, /"tools\/call"/);
  assert.match(api, /path: "README\.md"/);
  assert.match(api, /ref: "refs\/heads\/Unified-on-Progress"/);
  assert.match(api, /message.includes\("# OGENIC Phase VI"\)/);
  assert.match(api, /MCP_GITHUB_READ_E2E_PASS/);
  assert.match(api, /result_body_exposed: false/);
  assert.match(api, /secret_exposed: false/);
  assert.match(api, /persistent_lease_created: false/);
  assert.match(api, /provider_write_attempted: false/);
  assert.match(api, /paid_model_inference_attempted: false/);
});
