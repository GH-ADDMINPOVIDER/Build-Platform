import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual TS normalizer after dependency install; never duplicate its logic.
const source=fs.readFileSync(new URL("../worker/connector-endpoint-api.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true}
});
const exports={};
vm.runInNewContext(compiled.outputText,{exports,console,Set,Object,Array,String,RegExp},{
  filename:"connector-endpoint-api.js",timeout:1000
});
const {connectorModes,connectorModeCount,normalizeConnectorMode,normalizeConnectorEnvelope,connectorManifest}=exports;
const asJSON=value=>JSON.parse(JSON.stringify(value));

test("runtime registry exactly matches same-certificate inventory of 15 distinct categories",()=>{
  assert.equal(connectorModeCount,15);
  assert.equal(connectorModes.length,15);
  assert.equal(new Set(connectorModes.map(x=>x.id)).size,15);
  assert.equal(connectorManifest.modes_documented,15);
  assert.equal(connectorManifest.all_fifteen_modes_live_e2e_proven,false);
});

test("previous shorthand names NXP NPX calling agent API and PR-API remain understood",()=>{
  for(const [alias,canonical] of [
    ["NXP","npx_cli"],["NPX","npx_cli"],["pr-api","repository_api_pr_api"],
    ["Repository API","repository_api_pr_api"],["tool calling","function_tool_calling"],
    ["A2A","a2a_agent_relay"],["API","rest_api"],["MCP","mcp"]
  ])assert.equal(normalizeConnectorMode(alias),canonical);
  assert.equal(normalizeConnectorMode("made-up-transport"),"");
});

test("all 15 manifest types have explicit proof boundaries and never imply universal live run",()=>{
  for(const item of connectorModes){
    assert.equal(item.runtime_e2e_proven,false,item.id);
    assert.ok(item.source.length>5,item.id);
    assert.ok(item.integration.length>3,item.id);
    assert.ok(item.execution_route.length>5,item.id);
  }
});

test("Token Secret and Credential reject all direct execution without exposing values",()=>{
  for(const transport of ["token","secret","credential"]){
    const result=normalizeConnectorEnvelope({transport,command:"read status",capability:"read_file",
      provider:"github",environment:"staging"});
    assert.equal(result.ok,false);
    assert.equal(result.code,"IDENTITY_REFERENCE_ONLY_NO_SECRET_EXPORT");
  }
});

test("unverified MCP SDK NPX A2A and webhook adapters never escape to arbitrary command invocation",()=>{
  for(const transport of ["mcp","npx","sdk","a2a","webhook","npm","function_calling","n8n"]){
    const result=normalizeConnectorEnvelope({transport,command:"read status",capability:"read_file",
      provider:"github",environment:"staging"});
    assert.equal(result.ok,false,transport);
    assert.equal(result.code,"MODE_ADAPTER_NOT_VERIFIED_USE_EXISTING_SAFE_ROUTE",transport);
  }
});

test("strict GitHub READ only and agent CODEX owner Sign command envelopes",()=>{
  const read=normalizeConnectorEnvelope({transport:"pr_api",command:"inspect staging contract",
    provider:"github",capability:"read_file",environment:"staging",
    input:{path:"tests/wave-command-contract.test.mjs"}});
  assert.equal(read.ok,true);
  assert.equal(read.delegated.capability,"read_file");
  assert.equal(read.delegated.provider,"github");
  assert.equal(read.delegated.mode,"read");
  assert.deepEqual(asJSON(read.delegated.input),{path:"tests/wave-command-contract.test.mjs"});
  const agent=normalizeConnectorEnvelope({transport:"agent_api",command:"bounded staging status",
    provider:"openai",capability:"codex_selfhost",environment:"staging"});
  assert.equal(agent.ok,true);
  assert.equal(agent.delegated.mode,"autonomous");
  assert.equal(agent.delegated.approval,undefined);
  // Owner confirmation occurs only after /api/wave/command recomputes the plan ID.
});

test("incorrect transport/capability pairing, non-staging, arbitrary fields and fake owner sign fail-closed",()=>{
  const base={transport:"rest_api",command:"bounded inspect",provider:"github",capability:"read_file",environment:"staging"};
  for(const [change,code] of [
    [{provider:"openai",capability:"codex_selfhost"},"MODE_CAPABILITY_NOT_ALLOWLISTED"],
    [{transport:"agent_api"},"MODE_CAPABILITY_NOT_ALLOWLISTED"],
    [{environment:"production"},"ENVIRONMENT_SCOPE_MISMATCH"],
    [{token:"do-not-store-a-token"},"UNSUPPORTED_FIELD"],
    [{input:{url:"https://untrusted.example/"}},"INVALID_COMMAND_INPUT"],
    [{approval:{confirmed:true,approval_id:"wave-approval-fake"}},"INVALID_OWNER_SIGNATURE"],
    [{mode:"dangerous"},"INVALID_WAVE_COMMAND_MODE"]
  ]){
    const result=normalizeConnectorEnvelope({...base,...change});
    assert.equal(result.ok,false);
    assert.equal(result.code,code);
  }
});
