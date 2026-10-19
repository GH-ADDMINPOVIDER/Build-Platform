import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=(name)=>fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("Connector Endpoint exposes all seven requested modes as metadata not side-effect adapters",()=>{
  const c=source("worker/connector-endpoint-api.ts");
  for(const mode of ["mcp","npx","api","sdk","pr_api","agent_api","credential"]){
    assert.match(c,new RegExp('id:"'+mode+'"'));
  }
  assert.match(c,/npx_worker_execution:false/);
  assert.match(c,/credential_values_exposed:false/);
  assert.match(c,/independently_executable:false/);
  assert.match(c,/RUNNER_ADAPTER_NOT_VERIFIED/);
  assert.match(c,/CREDENTIAL_REFERENCE_ONLY/);
  assert.match(c,/environment!=="staging"/);
  assert.match(c,/UNSUPPORTED_FIELD/);
  assert.doesNotMatch(c,/\bspawn\(|\bspawnSync\(/);
});

test("Connector Endpoint auth is the existing owner gate and execution the same ATHENA/Yellow command",()=>{
  const e=source("worker/entry-yellow-stone.ts");
  assert.match(e,/pathname\.startsWith\("\/api\/connector-endpoint\/v1\/"\)/);
  assert.match(e,/hasOwnerOrOpsAccess\(request, env\)/);
  assert.match(e,/connectorManifest/);
  assert.match(e,/normalizeConnectorEnvelope\(data\)/);
  assert.match(e,/target\.pathname = "\/api\/wave\/command"/);
  assert.match(e,/return athenaGuardedCommand\(forwarded, env, ctx\)/);
  assert.match(e,/OWNER_APPROVAL_REQUIRED/);
  assert.match(e,/APPROVAL_PLAN_MISMATCH/);
  assert.match(e,/COMMAND_RESULT_/);
});

test("MCP discovery uses existing registered remote transport, not a fabricated tool call",()=>{
  const m=source("worker/mcp-config-api.ts");
  const c=source("worker/connector-endpoint-api.ts");
  assert.match(m,/tools\/list/);
  assert.match(m,/initialize/);
  assert.match(m,/MCP_BINDING_NOT_ENABLED/);
  assert.match(c,/\/api\/mcp-config\/state/);
  assert.match(c,/\/api\/mcp-config\/discover/);
});
