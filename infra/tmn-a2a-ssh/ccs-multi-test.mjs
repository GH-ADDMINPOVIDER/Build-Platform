import assert from "node:assert/strict";
import test from "node:test";
import { makeServer } from "./server.mjs";
import { buildCcsMultiProbe, manifest, validateCcsMulti } from "./ccs-multi.mjs";
import { connectorModes } from "../../worker/connector-endpoint-api.ts";
import { deriveLease, authorizeInvocation, revokeLease } from "../../worker/ccs-authority.ts";

const ciToken = "ccs-multi-fixture-token-no-real-secret";
function fixture() {
  return {
    version: "wave.task.envelope.v1",
    task_id: "waveenv_" + "b".repeat(64),
    idempotency_key: "ccs-multi-15-docker-probe",
    title: "CCS/1.0 15-mode multi protocol read-only validation",
    instruction: "tmn.runtime.probe",
    context: {context_ref:"ccs/multi/docker/probe",context_revision:1},
    scope: {environment:"staging",target_zone:"TMN",capability:"tmn.runtime.probe",permission:"READ",workspace_ref:"workspace:staging",no_production:true},
    authorization: {owner_session:"owner-main/1LSS_OWNER_MAIN",authority_ref:"UNSIGNED_CI_FIXTURE_ONLY",signed_gate:"ATHENA_YELLOW",signed_execution_required:true,secret_material_in_payload:false},
    execution: {state:"TASK_IN",executor:"TMN",attempt:0,max_attempts:1},
    fallback: {mode:"NO_FALLBACK",allowed:false,reason:"read-only local contract probe"}
  };
}
function rpc(batch, id = 7) {
  const e=fixture();
  return {
    jsonrpc:"2.0",id,method:"message/send",
    params:{message:{
      kind:"message",messageId:"ccs-multi-probe-"+id,contextId:e.context.context_ref,role:"user",
      parts:[{kind:"text",text:"tmn.runtime.probe"}],
      metadata:{wave_task_envelope:e,ccs_multi:batch}
    }}
  };
}
test("all 15 original Connector Endpoint modes preserve their exact names and brokered refs",()=>{
  const batch=buildCcsMultiProbe();
  const check=validateCcsMulti(batch);
  assert.equal(check.ok,true);
  assert.equal(check.category_count,15);
  assert.equal(check.contract_tested,15);
  assert.equal(check.credential_bytes_exported,0);
  assert.equal(check.runtime_e2e_verified,false);
  assert.equal(check.provider_execution_performed,false);
  assert.deepEqual(batch.cards.map(x=>x.mode),connectorModes.map(x=>x.id));
  assert.deepEqual(manifest.modes.map(x=>x.id),connectorModes.map(x=>x.id));
  assert.equal(batch.cards.find(x=>x.mode==="secret").credential_ref,
    "binding://infisical/staging/Key-token-Ownner-Ops_e579");
  assert.equal(batch.cards.find(x=>x.mode==="repository_api_pr_api").credential_ref,
    "binding://infisical/staging/GH-ID-TOMLOAD-RUNNER-2");
  assert.equal(batch.cards.find(x=>x.mode==="agent_sign_command_run").credential_ref,
    "binding://infisical/staging/OGENIC_OPS_KEY");
  assert.deepEqual(new Set(check.cards.map(x=>x.kind)),
    new Set(["TRANSPORT","IDENTITY","RUNNER_TOOL","AGENT_PROTOCOL","EXECUTION_CONTROL"]));
});
test("all 15 CCS multi cards fail closed on raw secret, wrong names, forged action, production and duplicates",()=>{
  const change=(mutator)=>{
    const b=structuredClone(buildCcsMultiProbe()); mutator(b);
    return validateCcsMulti(b);
  };
  assert.equal(change(x=>{x.cards[0].secretValue="DO_NOT_PASS";}).code,"CCS_RAW_CREDENTIAL_OR_INVALID_ENVELOPE");
  assert.equal(change(x=>{x.cards[0].credential_ref="raw_password";}).code,"CCS_CREDENTIAL_NAME_REF_MISMATCH");
  assert.equal(change(x=>{x.cards[6].credential_ref="binding://infisical/staging/GITHUB_TOKEN";}).code,"CCS_CREDENTIAL_NAME_REF_MISMATCH");
  assert.equal(change(x=>{x.cards[0].scope.permission="EXECUTE";}).code,"CCS_OWNER_SCOPE_OR_CARD_STATE_MISMATCH");
  assert.equal(change(x=>{x.cards[0].state="IN_USE";}).code,"CCS_OWNER_SCOPE_OR_CARD_STATE_MISMATCH");
  assert.equal(change(x=>{x.environment="production";}).code,"CCS_STAGING_PROTOCOL_SCOPE_REQUIRED");
  assert.equal(change(x=>{x.cards[14]={...x.cards[0]};}).code,"CCS_UNKNOWN_OR_DUPLICATE_MODE");
  assert.equal(change(x=>{x.cards.pop();}).code,"CCS_EXACT_15_MODE_CARDS_REQUIRED");
  assert.equal(change(x=>{x.raw_token="SENSITIVE";}).code,"CCS_RAW_CREDENTIAL_OR_INVALID_ENVELOPE");
});
test("CCS lease cannot elevate permission or egress and revocation denies calls",()=>{
  const parent={leaseId:"parent",parentLeaseId:null,providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",allowedEgress:["https://api.github.com"],expiresAt:2000,revoked:false};
  const req={leaseId:"child",providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",allowedEgress:["https://api.github.com"],expiresAt:1500};
  assert.equal(deriveLease(parent,{...req,permission:"WRITE"},1000).ok,false);
  assert.equal(deriveLease(parent,{...req,allowedEgress:["https://evil.example"]},1000).ok,false);
  const child=deriveLease(parent,req,1000).lease;
  assert.ok(child);
  assert.equal(authorizeInvocation({lease:child,leases:new Map([["parent",revokeLease(parent)],["child",child]]),providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",now:1100}).code,"LEASE_REVOKED");
});
test("actual A2A Docker HTTP transport handles all 15 cards in one authenticated multi call",async()=>{
  let server;
  let base=process.env.WAVE_A2A_REMOTE_URL;
  if(!base){
    server=makeServer(ciToken);
    await new Promise((resolve,reject)=>{
      server.once("error",reject);
      server.listen(0,"127.0.0.1",resolve);
    });
    base="http://127.0.0.1:"+server.address().port;
  }
  const token=process.env.WAVE_A2A_REMOTE_URL?process.env.WAVE_TMN_A2A_TOKEN:ciToken;
  const go=async(batch,authorized=true)=>{
    const response=await fetch(base+"/a2a",{method:"POST",headers:{
      "Content-Type":"application/json",
      ...(authorized?{Authorization:"Bearer "+token}:{})
    },body:JSON.stringify(rpc(batch))});
    return {status:response.status,body:await response.json()};
  };
  try{
    const denied=await go(buildCcsMultiProbe(),false);
    assert.equal(denied.status,401);
    const good=await go(buildCcsMultiProbe());
    assert.equal(good.status,200);
    const x=good.body.result?.artifacts?.[0]?.parts?.[0]?.data;
    assert.equal(x?.ccs_multi?.category_count,15);
    assert.equal(x?.ccs_multi?.cards?.length,15);
    assert.equal(x?.ccs_multi?.code,"CCS_MULTI_15_CONTRACT_VALID");
    assert.equal(x?.ccs_multi?.credential_bytes_exported,0);
    assert.equal(x?.ccs_multi?.provider_execution_performed,false);
    assert.equal(x?.canonical_d1_receipt,false);
    assert.equal(x?.tmn_command_executed,false);
    assert.match(x.result_sha256,/^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(good.body).includes("UNSIGNED_CI_FIXTURE_ONLY"),false);
    const deniedMode=structuredClone(buildCcsMultiProbe());
    deniedMode.cards[0].scope.permission="EXECUTE";
    const rejected=await go(deniedMode);
    assert.equal(rejected.body.error?.code,-32010);
    assert.equal(rejected.body.error?.message,"CCS_OWNER_SCOPE_OR_CARD_STATE_MISMATCH");
    const read=await fetch(base+"/a2a",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:JSON.stringify({jsonrpc:"2.0",id:8,method:"tasks/get",params:{id:fixture().task_id}})});
    const receipt=await read.json();
    assert.equal(receipt.result?.artifacts?.[0]?.parts?.[0]?.data?.ccs_multi?.contract_tested,15);
    console.log("CCS_MULTI_15_DOCKER_HTTP=PASS; LIVE_PROVIDER_E2E=NOT_TESTED; OWNER_SIGNED_RUN=NO");
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
  }
});
