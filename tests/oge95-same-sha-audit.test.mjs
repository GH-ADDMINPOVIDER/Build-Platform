import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindAuditToCheckedSha, produceSameShaAudit, REPO, BRANCH } from "../scripts/oge95-same-sha-audit.mjs";
import { evaluateFinalIntake } from "../scripts/oge95-final-review-intake.mjs";
const sha="a".repeat(40);
const historicalSource=JSON.parse(readFileSync("docs/evidence/oge-62-flow-audit-latest.json","utf8"));
const historical={...historicalSource,canonical:{...historicalSource.canonical,repository:REPO,branch:BRANCH}};
const profiles=["linearcodex","codex","claude","codex","claude","linearcodex","codex","claude","codex","claude"];
const results=historical.audit.map((row,index)=>({
  runtime_id:row.runtime_id,execution_profile:profiles[index],
  repository:REPO,branch:BRANCH, provider_call_attempted:false,
  paid_call_performed:false, canonical_write_attempted:false,
  d1_schema_write_attempted:false,state:"PROVISIONAL_DONE",
  self_verify:"PASS",evidence_digest:row.evidence_digest,task_fingerprint:"1".repeat(64)
}));
const input=()=>({audit:structuredClone(historical),claimedSha:sha,checkedSha:sha,repo:REPO,branch:BRANCH,results:structuredClone(results)});
test("same-SHA re-audit is bounded, deterministic and never authorizes deploy",()=>{
  const out=bindAuditToCheckedSha(input());
  assert.equal(out.source_sha,sha);
  assert.equal(out.audit.length,10);
  assert.equal(out.source_sha_attestation.exact_checkout_match,true);
  assert.equal(out.source_sha_attestation.genuinely_parallel_runtime_jobs,false);
  assert.equal(out.source_sha_attestation.independent_ai_provider_runs,false);
  assert.equal(out.commit_manifest.execution_approved,false);
  const intake=evaluateFinalIntake({audit:out,sourceSha:sha});
  assert.equal(intake.github_audit,"PASS");
  assert.equal(intake.final_intake_state,"GITHUB_ONLY_NO_AGENT_REVIEW");
  assert.equal(intake.yellow_commit_or_deploy_authority,"NOT_GRANTED");
});
test("no fake SHA attestation on branch/ref/HEAD mismatch",()=>{
  for (const change of [
    {checkedSha:"b".repeat(40)}, {claimedSha:"b".repeat(40)},
    {repo:"other/repo"}, {branch:"main"}
  ]) assert.throws(()=>bindAuditToCheckedSha({...input(),...change}),/CANONICAL_EXACT_SHA_ATTESTATION_FAILED/);
});
test("audit requires actual all-ten matching receipts, no extra/missing clones",()=>{
  for(const changed of [
    [...results.slice(0,9)],
    [...results,results[0]],
    [...results.slice(0,9),{...results[9],execution_profile:"codex"}],
    [...results.slice(0,9),{...results[9],paid_call_performed:true}],
    [...results.slice(0,9),{...results[9],evidence_digest:"f".repeat(64)}],
    [...results.slice(0,9),{...results[9],task_fingerprint:"f".repeat(64)}]
  ])assert.throws(()=>bindAuditToCheckedSha({...input(),results:changed}));
});
test("invalid deterministic GitHub proof fails closed",()=>{
  for(const changed of [
    {ok:false},{commit_eligible:false},{final_done_count:9},
    {audit:historical.audit.slice(0,9)},{errors:["BAD"]}
  ])assert.throws(()=>bindAuditToCheckedSha({...input(),audit:{...historical,...changed}}));
});
test("CLI refuses free-floating calls without authentic CI SHA context",()=>{
  assert.throws(()=>produceSameShaAudit({env:{},executor:()=>{throw Error("must not execute");}}),/CI_STAGING_CONTEXT_REQUIRED/);
  assert.throws(()=>produceSameShaAudit({
    env:{GITHUB_SHA:sha,GITHUB_REPOSITORY:REPO,GITHUB_REF_NAME:BRANCH},
    executor:(cmd,args)=>{assert.equal(cmd,"git");assert.deepEqual(args,["rev-parse","HEAD"]);return "b".repeat(40);}
  }),/HEAD_MUST_MATCH_GITHUB_SHA/);
});
