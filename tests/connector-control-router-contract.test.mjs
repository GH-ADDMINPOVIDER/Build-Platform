import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("connector admin and model tool routes are owner-only", async () => {
  const api = await read("worker/connector-app-api.ts");
  assert.match(api, /api\.use\("\/api\/connectors", ownerOnly\)/);
  assert.match(api, /api\.use\("\/api\/connectors\/\*", ownerOnly\)/);
  assert.match(api, /api\.use\("\/api\/chat\/functions", ownerOnly\)/);
  assert.match(api, /api\.use\("\/api\/chat\/agent", ownerOnly\)/);
  assert.match(api, /requireOwnerSession/);
});

test("public hooks verify signatures before accepting and deduplicate events", async () => {
  const runtime = await read("worker/connector-runtime.ts");
  assert.match(runtime, /timingSafeString/);
  assert.match(runtime, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(runtime, /x-line-signature/i);
  assert.match(runtime, /META_APP_SECRET/);
  assert.match(runtime, /OPENAI_WEBHOOK_SECRET/);
  assert.match(runtime, /OGENIC_GENERIC_HOOK_SECRET/);
  assert.match(runtime, /connector_hook_dedup/);
  assert.match(runtime, /markDedup/);
  assert.match(runtime, /state: "DUPLICATE"/);
  assert.match(runtime, /code: "INVALID_SIGNATURE"/);
});

test("n8n state is truthful and quota blockage is separate", async () => {
  const runtime = await read("worker/connector-runtime.ts");
  assert.match(runtime, /"QUOTA_BLOCKED"/);
  assert.match(runtime, /EXECUTION_LIMIT_REACHED/);
  assert.match(runtime, /N8N_BASE_URL/);
  assert.match(runtime, /N8N_API_KEY/);
  assert.match(runtime, /route_mode: "N8N"/);
  assert.match(runtime, /route_mode: "DISABLED"/);
});

test("external connector side effects fail closed for human approval", async () => {
  const runtime = await read("worker/connector-runtime.ts");
  assert.match(runtime, /name === "http_action" \|\| name === "trigger_n8n_workflow"/);
  assert.match(runtime, /code: "HUMAN_APPROVAL_REQUIRED"/);
  assert.match(runtime, /cannot execute it without a separate owner approval action/);
});

test("function bridge exposes only verified server-locked private tools", async () => {
  const api = await read("worker/connector-app-api.ts");
  const tools = await read("worker/verified-function-tools.ts");
  assert.match(api, /verifiedFunctionTools/);
  assert.match(api, /executeVerifiedTool/);
  assert.match(api, /parallel_tool_calls: true/);
  assert.match(api, /Never claim an external action occurred/);
  assert.match(api, /writes and unknown functions return HUMAN_APPROVAL_REQUIRED/);
  assert.match(api, /policy: "SIDE_EFFECTS_REQUIRE_SEPARATE_OWNER_APPROVAL"/);
  assert.match(tools, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(tools, /CANONICAL_REPOSITORY/);
  assert.match(tools, /CANONICAL_BRANCH/);
  assert.match(tools, /CANONICAL_CONVERSATION/);
  assert.match(tools, /CANONICAL_SESSION/);
  assert.match(tools, /1LSS_OWNER_MAIN/);
});

test("provider connection UI is server-backed and renders only safe credential metadata", async () => {
  const ui = await read("src/ProviderConnectWizard.tsx");
  const api = await read("worker/provider-connect-api.ts");
  assert.match(ui, /\/api\/provider-connect/);
  assert.match(ui, /stored server-side/);
  assert.match(ui, /ไม่แสดงค่า secret จริง/);
  assert.doesNotMatch(ui, /cred\.value|credential\.value|secretValue|tokenValue/);
  assert.match(api, /CONFIGURATION_REQUIRED|PARTNER_ACCESS_REQUIRED|UNSUPPORTED_DIRECT_API/);
  assert.match(api, /requireOwnerSession/);
});

test("canonical entry owns connector, function and hook routing", async () => {
  const entry = await read("worker/entry-connectors.ts");
  assert.match(entry, /pathname === "\/api\/chat\/functions"/);
  assert.match(entry, /pathname === "\/api\/connectors"/);
  assert.match(entry, /pathname\.startsWith\("\/hooks\/"\)/);
  assert.match(entry, /createPublicHookApi/);
});
