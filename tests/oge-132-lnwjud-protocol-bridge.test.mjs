import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadTs } from "./_load-ts.mjs";
import ts from "typescript";

const entry=readFileSync(new URL("../worker/entry-yellow-stone.ts",import.meta.url),"utf8");
const mcp=readFileSync(new URL("../worker/mcp-config-api.ts",import.meta.url),"utf8");
const solo=readFileSync(new URL("../scripts/wave-terminal-solo.sh",import.meta.url),"utf8");
async function loadProtocolBridge() {
  const {connectorModes,connectorAliases}=await loadTs("worker/connector-endpoint-api.ts");
  const source=readFileSync(new URL("../worker/connector-protocol-bridge.ts",import.meta.url),"utf8");
  const injected=source.replace(
    'import { connectorModes, connectorAliases } from "./connector-endpoint-api";',
    "const connectorModes="+JSON.stringify(connectorModes)+";\nconst connectorAliases="+JSON.stringify(connectorAliases)+";",
  );
  const js=ts.transpileModule(injected,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
}


test("all fifteen OGE-128 protocol categories are explicitly routable, not fifteen shell permissions",async()=>{
  const {protocolCatalog,protocolActions,normalizeProtocolInvocation:n}=await loadProtocolBridge();
  assert.equal(protocolCatalog.length,15);
  assert.equal(new Set(protocolCatalog.map(x=>x.transport)).size,15);
  for(const mode of protocolCatalog) {
    assert.equal(protocolActions[mode.transport].includes("inspect"),true,mode.transport);
    const checked=n({transport:mode.transport,operation:"inspect",environment:"staging"});
    assert.equal(checked.ok,true,mode.transport);
    assert.equal(mode.execution_authority,"YELLOW_STONE_ONLY");
  }
  assert.equal(protocolCatalog.find(x=>x.transport==="npx").source_contract_only,true);
  assert.equal(protocolCatalog.find(x=>x.transport==="sdk").source_contract_only,true);
});

test("strict schema rejects injection, unapproved capabilities and credential-bearing inputs",async()=>{
  const {normalizeProtocolInvocation:n}=await loadProtocolBridge();
  assert.equal(n({transport:"rest_api",operation:"inspect"}).value.transport,"api");
  assert.equal(n({transport:"npx",operation:"plan",command:"Review staging package scripts"}).ok,true);
  assert.equal(n({transport:"api",operation:"inspect",environment:"production"}).code,"ENVIRONMENT_SCOPE_MISMATCH");
  assert.equal(n({transport:"api",operation:"inspect",owner_key:"abc"}).code,"UNSUPPORTED_FIELD");
  assert.equal(n({transport:"mcp",operation:"invoke_read",provider:"linear",name:"get_issue",arguments:{password:"unsafe"}}).code,"UNSAFE_ARGUMENTS");
  assert.equal(n({transport:"npx",operation:"invoke_read",name:"shell"}).code,"PROTOCOL_OPERATION_UNSUPPORTED");
  assert.equal(n({transport:"webhook",operation:"plan",command:"skip signature"}).code,"PROTOCOL_OPERATION_UNSUPPORTED");
  assert.equal(n({transport:"api",operation:"confirm",command:"ok"}).code,"APPROVAL_REQUIRED");
  assert.equal(n({transport:"api",operation:"plan",command:"ok",approval:{confirmed:true,approval_id:"wave-approval-"+"a".repeat(64)}}).code,"UNEXPECTED_APPROVAL");
  assert.equal(n({transport:"api",operation:"confirm",command:"ok",approval:{confirmed:true,approval_id:"wave-approval-"+"a".repeat(64)}}).ok,true);
  assert.equal(n({transport:"a2a",operation:"discover"}).code,"PROTOCOL_OPERATION_UNSUPPORTED");
  assert.equal(n({transport:"credential",operation:"reference",provider:"github"}).ok,true);
});

test("one Worker endpoint enforces signed Owner session and uses existing D1/ATHENA/Yellow/Runner authority",()=>{
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/protocols"/);
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/operate"/);
  assert.match(entry,/normalizeProtocolInvocation\(parsed\)/);
  assert.match(entry,/hasOwnerSession\(request, env\)/);
  assert.match(entry,/return athenaGuardedCommand\(new Request\(target.toString\(\)/);
  assert.match(entry,/executeVerifiedTool\(op.name, op.arguments/);
  assert.match(entry,/source_contract_is_not_live_e2e: true/);
  assert.match(solo,/\.ogenic-wave-terminal-solo\.lock/);
});

test("MCP child bridge requires exact preconfigured read allowlist and readOnlyHint",()=>{
  assert.match(mcp,/api\.post\("\/api\/mcp-config\/read-tool"/);
  assert.match(mcp,/hasOwnerSession\(c\.req\.raw, c\.env\)/);
  assert.match(mcp,/configuredReadTools\(binding\.metadata_json\)/);
  assert.match(mcp,/permitted\.includes\(tool\)/);
  assert.match(mcp,/readOnlyHint === true/);
  assert.match(mcp,/"tools\/call"/);
  assert.match(mcp,/sanitizedMcpResponse/);
  assert.doesNotMatch(mcp,/execSync\(|spawnSync\(/);
});

test("public ingress preserves signed provider webhook handlers without bare unauthenticated execution",()=>{
  const connector=readFileSync(new URL("../worker/connector-runtime.ts",import.meta.url),"utf8");
  assert.match(entry,/pathname\.startsWith\("\/api\/connector-endpoint\/v1\/ingress\/"/);
  assert.match(entry,/\["line", "meta", "generic", "openai"\]/);
  assert.match(entry,/return base\.fetch\(new Request\(target.toString\(\), request\)/);
  for(const name of ["line","meta","generic","openai"])assert.match(connector,new RegExp('hooks\\.(?:post|gett?)\\("/hooks/'+name+'"'));
});
