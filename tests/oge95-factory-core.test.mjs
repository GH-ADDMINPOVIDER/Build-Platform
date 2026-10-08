import test from "node:test";
import assert from "node:assert/strict";
import {planFactoryOrder,auditFactorySource,receiveDeepSeekResearch,factoryReceipt,FACTORY_VERSION} from "../scripts/replica-runner/factory-core.mjs";

const sha="a".repeat(40);
const base={task_id:"OGE-95-readonly-proof",operation:"replica_source_audit",branch:"phase-vi-provider-incentive-metering",source_sha:sha,
  requires_paid_inference:false,deploy_requested:false,limits:{max_minutes:10,max_artifact_bytes:65536}};
const research={
  ok:true,http_status:200,model:"deepseek-flash",calls:1,retries:0,fallbacks:0,
  inputs:"PUBLIC_DOCUMENTATION_AND_PUBLIC_REPO_CONTRACTS_ONLY",
  no_browsing_tools:true,answer:"Plan: use synthetic D1 local fixture, Yellow dispatch, Ruby confirm then retain in Green.",
  source_urls:["https://developers.cloudflare.com/workers/local-development/","https://docs.github.com/en/actions/reference/runners/self-hosted-runners","https://playwright.dev/docs/browsers"],
  usage:{prompt_tokens:500,completion_tokens:150,total_tokens:650}
};
const meta={run_id:37759999999,source_sha:sha};

test("Factory emits stable work orders and dedupes by idempotency",()=>{
  const a=planFactoryOrder(base),b=planFactoryOrder(base);
  assert.equal(a.ok,true);
  assert.equal(a.version,FACTORY_VERSION);
  assert.equal(a.idempotency_key,b.idempotency_key);
  assert.equal(a.staging_deploy_allowed,false);
  assert.equal(a.paid_inference_allowed,false);
  assert.equal(a.authority,"YELLOW_AUTHORIZATION_REQUIRED_FOR_REAL_EXECUTION");
});

test("Only forbidden execution scope is rejected; metered READ reuses existing Yellow",()=>{
  for(const patch of [
    {operation:"shell_exec"}, {operation:"deploy_prod"},
    {deploy_requested:true}, {branch:"main"},
    {source_sha:"evil"}, {task_id:"OGE-36-foo"}
  ]) assert.equal(planFactoryOrder({...base,...patch}).ok,false,JSON.stringify(patch));
  const paid=planFactoryOrder({...base,requires_paid_inference:true,limits:{max_minutes:25,max_artifact_bytes:3000000}});
  assert.equal(paid.ok,true);
  assert.equal(paid.paid_inference_allowed,"THROUGH_EXISTING_YELLOW");
  assert.equal(paid.metered_provider_authority,"EXISTING_YELLOW");
  assert.equal(paid.limits.max_artifact_bytes,3000000);
});

test("Readonly source-audit station has evidence hash and no Green side effects",()=>{
  const job=planFactoryOrder(base);
  const evidence=auditFactorySource(job);
  assert.equal(evidence.ok,true);
  assert.ok(evidence.files.length>=5);
  assert.ok(evidence.files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)));
  assert.equal(evidence.provider_calls,0);
  assert.equal(evidence.green_retention_eligible,false);
  const receipt=factoryReceipt(job,evidence);
  assert.equal(receipt.status,"EVIDENCE_READY");
  assert.equal(receipt.auto_deploy,false);
  assert.equal(receipt.retain_in_green,false);
  assert.equal(receipt.stages.find(x=>x.stage==="VERIFY").state,"PENDING_RUBY");
});

test("Future DeepSeek result can be ingested with provenance but never auto-promoted",()=>{
  const receipt=receiveDeepSeekResearch(research,meta);
  assert.equal(receipt.status,"RECEIVED_UNVERIFIED");
  assert.equal(receipt.ok,true);
  assert.ok(/^[a-f0-9]{64}$/.test(receipt.answer_sha256));
  assert.equal(receipt.research_source,"PROVIDER_OUTPUT_WITH_GITHUB_EVIDENCE");
  assert.equal(receipt.ruby_verification,"NOT_VERIFIED");
  assert.equal(receipt.green_retention_eligible,false);
  assert.equal(receipt.auto_patch_allowed,false);
  assert.equal(receipt.auto_deploy_allowed,false);
  assert.equal(receipt.tokens.total,650);
});

test("Existing failed DeepSeek transport outcome can NOT be treated as research",()=>{
  const blocked=receiveDeepSeekResearch({ok:false,code:"DEEPSEEK_REVIEW_REQUEST_FAILED",reason:"TRANSPORT_EXCEPTION",requests:1,retries:0},meta);
  assert.equal(blocked.status,"BLOCKED");
  assert.equal(blocked.answer,null);
  assert.equal(blocked.green_retention_eligible,false);
  assert.ok(blocked.errors.includes("NO_SUCCESSFUL_PROVIDER_RESPONSE"));
});

test("Only failed/missing output, invalid model, sensitive text, or invalid run is blocked",()=>{
  for(const patch of [
    {http_status:503},{model:"unexpected-model"},{answer:""},
    {answer:"password: public-isnt-a-real-password"}
  ]) {
    const output=receiveDeepSeekResearch({...research,...patch},meta);
    assert.equal(output.status,"BLOCKED",JSON.stringify(patch));
  }
});
test("Research from new HTTPS sources and multiple authorized calls remains usable",()=>{
  const receipt=receiveDeepSeekResearch({...research,calls:2,retries:1,
    source_urls:["https://example.edu/research","https://example.edu/research","http://127.0.0.1/private"],
    no_browsing_tools:false,inputs:"OWNER_AUTHORIZED_REPO_CONTEXT"},meta);
  assert.equal(receipt.ok,true);
  assert.equal(receipt.status,"RECEIVED_UNVERIFIED");
  assert.deepEqual(receipt.referenced_sources,["https://example.edu/research"]);
  assert.equal(receipt.provider_requests,2);
  const factory=factoryReceipt(planFactoryOrder({...base,operation:"deepseek_research_ingest"}),receipt);
  assert.equal(factory.continue_via_existing_yellow,true);
  assert.equal(factory.retain_in_green,false);
});
test("Missing real GitHub run evidence never produces verified result",()=>{
  const output=receiveDeepSeekResearch(research,{run_id:0,source_sha:"notasha"});
  assert.equal(output.ok,false);
  assert.equal(output.evidence_ref,null);
});

test("DeepSeek complete outputs far beyond 256 tokens and 14,500 chars stay intact",()=>{
  const full="P0 local 1LSS, P1 Yellow and Ruby. ".repeat(1600);
  const receipt=receiveDeepSeekResearch({...research,answer:full,finish_reason:"stop",output_complete:true},meta);
  assert.equal(receipt.ok,true);
  assert.equal(receipt.status,"RECEIVED_UNVERIFIED");
  assert.equal(receipt.content_complete,true);
  assert.equal(receipt.answer.length,full.trim().length);
  assert.equal(receipt.answer,full.trim());
  assert.equal(receipt.answer_sha256.length,64);
});

test("DeepSeek provider length response is retained but cannot be called complete",()=>{
  const partial="Research starts with 1LSS parity and needs continuation ".repeat(350);
  const result=receiveDeepSeekResearch({...research,answer:partial,finish_reason:"length",output_complete:false,output_truncated_by_provider:true},meta);
  assert.equal(result.ok,true);
  assert.equal(result.content_complete,false);
  assert.equal(result.status,"RECEIVED_INCOMPLETE");
  assert.equal(result.answer,partial.trim());
  const receipt=factoryReceipt(planFactoryOrder({...base,operation:"deepseek_research_ingest"}),result);
  assert.equal(receipt.stages.find(x=>x.stage==="DISTILL").state,"RECEIVED_INCOMPLETE");
  assert.equal(receipt.retain_in_green,false);
});
