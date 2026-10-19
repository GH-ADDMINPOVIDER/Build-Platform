import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadTs } from "./_load-ts.mjs";

const entry = readFileSync(new URL("../worker/entry-yellow-stone.ts",import.meta.url),"utf8");
const functions = readFileSync(new URL("../worker/verified-function-tools.ts",import.meta.url),"utf8");
const auth = readFileSync(new URL("../worker/app-auth.ts",import.meta.url),"utf8");

test("one endpoint inventories the fifteen already-known connector families",async()=>{
  const { connectorModes, connectorManifest, connectorAliases } = await loadTs("worker/connector-endpoint-api.ts");
  assert.equal(connectorModes.length,15);
  assert.equal(new Set(connectorModes.map(x=>x.id)).size,15);
  assert.equal(connectorAliases.rest_api,"api");
  assert.equal(connectorAliases.agent_sign_command_run,"agent_sign_run");
  assert.equal(connectorManifest.independently_executable,false);
  assert.equal(connectorManifest.npx_worker_execution,false);
  assert.equal(connectorManifest.live_e2e_proven,false);
  assert.equal(connectorManifest.security_audit,"PARTIAL");
});

test("envelope aliases route ONLY to the existing guarded command",async()=>{
  const { normalizeConnectorEnvelope:n } = await loadTs("worker/connector-endpoint-api.ts");
  const valid=n({ transport:"rest_api",environment:"staging",command:"read staging issue",mode:"read" });
  assert.equal(valid.ok,true);
  assert.equal(valid.transport,"api");
  assert.equal(valid.delegated.environment,"staging");
  assert.equal(valid.delegated.mode,"read");
  assert.equal(valid.delegated.command,"read staging issue");
  for(const transport of ["token","secret","credential"])assert.equal(n({transport,command:"hi"}).code,"CREDENTIAL_REFERENCE_ONLY");
  for(const transport of ["npx","npm","sdk"])assert.equal(n({transport,command:"hi"}).code,"RUNNER_ADAPTER_NOT_VERIFIED");
  assert.equal(n({transport:"a2a",command:"hi"}).code,"AGENT_RELAY_RUNTIME_NOT_VERIFIED");
  assert.equal(n({transport:"webhook",command:"hi"}).code,"WEBHOOK_SIGNED_INGRESS_ONLY");
  assert.equal(n({transport:"api",command:"hello",environment:"production"}).code,"ENVIRONMENT_SCOPE_MISMATCH");
  assert.equal(n({transport:"api",command:"hello",private_key:"not permitted"}).code,"UNSUPPORTED_FIELD");
  assert.equal(n({transport:"api",command:"hello",input:{shell:"rm -rf /"}}).code,"INPUT_NOT_ALLOWED");
  assert.equal(n({transport:"api",command:"hello",approval:{confirmed:"true"}}).code,"APPROVAL_NOT_ALLOWED");
  assert.equal(n({transport:"api",command:"hello",input:{prompt:{foo:"bar"}}}).code,"INPUT_NOT_ALLOWED");
});

test("read-only function bridge retains owner session boundary and exact approved tools",()=>{
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/functions"/);
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/invoke"/);
  assert.match(entry,/verifiedFunctionTools\.some/);
  assert.match(entry,/executeVerifiedTool\(name, body.arguments/);
  assert.match(entry,/hasOwnerSession\(request, env\)/);
  assert.match(entry,/code: "HUMAN_APPROVAL_REQUIRED"/);
  assert.match(auth,/validSignedSession/);
  assert.match(functions,/Only the seven registered read-only tools may execute/);
});

test("existing MCP discovery, connector tests, events, and Yellow command are reused",()=>{
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/test"/);
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/events"/);
  assert.match(entry,/pathname === "\/api\/connector-endpoint\/v1\/mcp\/discover"/);
  assert.match(entry,/mcpConfigApi\.fetch\(new Request\(target\.toString\(\), request\)/);
  assert.match(entry,/return athenaGuardedCommand\(forwarded, env, ctx\)/);
  assert.doesNotMatch(readFileSync(new URL("../worker/connector-endpoint-api.ts",import.meta.url),"utf8"),/\bspawn(?:Sync)?\(/);
});
