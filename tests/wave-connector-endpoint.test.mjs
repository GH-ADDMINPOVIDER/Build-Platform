import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const api=read("worker/connector-endpoint-api.ts");
const entry=read("worker/entry-yellow-stone.ts");
const policy=read("worker/wave-command-contract.ts");

test("OGE-131 inventory contains exactly the 15 OGE-130 Certificate categories, not 7 duplicate gateways",()=>{
  const modes=[
    "mcp","n8n","rest_api","token","secret","credential","repository_api_pr_api",
    "agent_api","function_tool_calling","npx_cli","npm","sdk","a2a_agent_relay",
    "webhook_event_calling","agent_sign_command_run"
  ];
  const defs=[...api.matchAll(/mode\("([a-z0-9_]+)","(?:TRANSPORT|IDENTITY|RUNNER_TOOL|AGENT_PROTOCOL|EXECUTION_CONTROL)"/g)].map(m=>m[1]);
  assert.deepEqual(defs,modes);
  assert.match(api,/modes_documented:15/);
  assert.match(api,/registry_evidence:"oge130_connector_modes_repository_inventory_20261019"/);
  assert.match(api,/all_fifteen_modes_live_e2e_proven:false/);
  assert.match(api,/aliases: Record<string,string>/);
  assert.match(api,/nxp:"npx_cli"/);
  assert.match(api,/pr_api:"repository_api_pr_api"/);
});

test("Credential Token Secret have NO executable or export path",()=>{
  for(const name of ["token","secret","credential"])assert.match(api,new RegExp('mode\\("'+name+'","IDENTITY"'));
  assert.match(api,/IDENTITY_REFERENCE_ONLY_NO_SECRET_EXPORT/);
  assert.match(api,/credential_values_exposed:false/);
  assert.match(api,/NO_DIRECT_EXECUTION/);
  assert.doesNotMatch(api,/\bspawn\(|\bspawnSync\(|\beval\(/);
  assert.match(api,/UNSUPPORTED_FIELD/);
  assert.match(policy,/SECRET_LIKE_INPUT_REJECTED/);
});

test("NPX npm SDK A2A cannot run through Cloudflare without proved runner adapters",()=>{
  for(const name of ["npx_cli","sdk","a2a_agent_relay"])assert.match(api,new RegExp('mode\\("'+name+'",'));
  assert.match(api,/MODE_ADAPTER_NOT_VERIFIED_USE_EXISTING_SAFE_ROUTE/);
  assert.match(api,/npx_worker_execution:false/);
  assert.match(api,/runtime_e2e_proven:false/);
  assert.match(api,/execution_route: "WAVE_YELLOW_READ" \| "WAVE_OWNER_SIGN"/);
});

test("admission uses bounded transport-capability pairing plus the original Yellow/Owner gate",()=>{
  assert.match(api,/executable=new Set\(/);
  assert.match(api,/capability==="read_file"&&provider==="github"/);
  assert.match(api,/capability==="codex_selfhost"&&provider==="openai"/);
  assert.match(api,/MODE_CAPABILITY_NOT_ALLOWLISTED/);
  assert.match(api,/INVALID_OWNER_SIGNATURE/);
  assert.match(api,/ENVIRONMENT_SCOPE_MISMATCH/);
  assert.match(entry,/hasOwnerOrOpsAccess\(request, env\)/);
  assert.match(entry,/normalizeConnectorEnvelope\(data\)/);
  assert.match(entry,/target\.pathname = "\/api\/wave\/command"/);
  assert.match(entry,/return athenaGuardedCommand\(forwarded, env, ctx\)/);
  assert.match(entry,/OWNER_APPROVAL_REQUIRED/);
  assert.match(entry,/APPROVAL_PLAN_MISMATCH/);
});

test("safe remote MCP initialize/tools/list and n8n health probes use EXISTING adapter, never execute tools/call",()=>{
  const mcp=read("worker/mcp-config-api.ts");
  const hooks=read("worker/connector-runtime.ts");
  assert.match(mcp,/tools\/list/);
  assert.match(mcp,/initialize/);
  assert.match(mcp,/MCP_BINDING_NOT_ENABLED/);
  assert.match(hooks,/export async function inspectN8n/);
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/probe"/);
  assert.match(entry,/provider === "simulated"/);
  assert.match(entry,/mcpConfigApi\.fetch\(new Request\(target\.toString\(\), request\)/);
  assert.match(entry,/await inspectN8n\(env as never\)/);
  assert.match(entry,/execution_tested: false/);
});

test("status is sanitized and contains all fifteen mode entries; never returns raw credentials",()=>{
  assert.match(entry,/connectorModes\.map\(item =>/);
  assert.match(entry,/runtime_e2e_proven: false/);
  assert.match(entry,/credential_reference_present: row\.secret_ref_present === true/);
  assert.doesNotMatch(entry,/credential_value: row/);
  assert.match(entry,/Cache-Control": "no-store"/);
});
