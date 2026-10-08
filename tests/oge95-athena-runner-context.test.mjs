import test from "node:test";
import assert from "node:assert/strict";
import { deriveAthenaContext } from "../scripts/replica-runner/athena-context.mjs";

const REPO="Ogenicchocolate21debug/Build-Platform";
const BRANCH="phase-vi-provider-incentive-metering";
const head="a".repeat(40), older="b".repeat(40);
const run=(id,name,sha,status="completed",conclusion="success")=>({
  id,name,head_sha:sha,status,conclusion,created_at:"2026-10-08T09:24:13Z"
});
const base={
  repository:REPO,branch:BRANCH,source_sha:head,run_id:37760000000,
  runs:[
    run(12,"Provider Incentive Staging Deploy",older),
    run(13,"WAVE Phase II Canonical Check",head),
    run(14,"OGE-78 USE CARD check",head,"completed","failure"),
    run(15,"WAVE Phase II Canonical Check",head),
    run(16,"WAVE Replica Runner 0.9 - Local Parity Proof",head,"in_progress",null)
  ],
  commits:[{sha:head,subject:"CI for OGE-95"},{sha:older,subject:"Earlier deploy"}],
  files:[{path:"config/oge95-rules-center.json",sha256:"1".repeat(64)}]
};
test("Athena rebuilds real SHAs, latest CI, deploy gap and action history",()=>{
  const c=deriveAthenaContext({...base,local_proof:null});
  assert.equal(c.canonical.session_line,"1LSS_OWNER_MAIN");
  assert.equal(c.actions.latest_canonical_check.id,15);
  assert.equal(c.actions.latest_staging_deploy.sha,older);
  assert.equal(c.actions.latest_failure.id,14);
  assert.equal(c.local_runtime.status,"NOT_MEASURED_CURRENT_SHA");
  assert.ok(c.suggested_actions.some(x=>x.action==="INSPECT_OR_RETRY_REPLICA"));
  assert.ok(c.suggested_actions.some(x=>x.action==="REVIEW_STAGING_DEPLOY_SHA_GAP"));
  assert.equal(c.safeguards.auto_deploy,false);
  assert.equal(c.safeguards.provider_api_calls,0);
});
test("Athena deduplicates same workflow/SHA/result and preserves distinct issue failures",()=>{
  const c=deriveAthenaContext(base);
  assert.equal(c.actions.recent_runs.filter(x=>x.workflow==="WAVE Phase II Canonical Check").length,1);
  assert.ok(c.actions.recent_runs.some(x=>x.workflow==="OGE-78 USE CARD check"));
});
test("Passing local public parity never claims whole 1:1; recommends stateful replay and Ruby",()=>{
  const proof={status:"LOCAL_PROOF_PASS",source_sha:head,local_checks_passed:12,local_checks_total:12,
    staging_comparison:{tests_total:10,tests_matched:10,surface_match_ratio:1}};
  const c=deriveAthenaContext({...base,local_proof:proof});
  assert.equal(c.local_runtime.status,"LOCAL_PROOF_PASS");
  assert.equal(c.local_runtime.public_surface_match_ratio,1);
  assert.equal(c.local_runtime.full_runtime_parity_certified,false);
  assert.equal(c.suggested_actions[0].action,"EXPAND_STATEFUL_1LSS_PARITY_AND_RUBY_VERIFY");
});
test("Proof on earlier HEAD is not a valid CURRENT-SHA replica proof",()=>{
  const proof={status:"LOCAL_PROOF_PASS",source_sha:older,local_checks_passed:12,local_checks_total:12};
  const c=deriveAthenaContext({...base,local_proof:proof});
  assert.equal(c.local_runtime.status,"LOCAL_PROOF_PASS");
  // status from stale report is visible, but the action still demands current-SHA proof
  assert.equal(c.suggested_actions[0].action,"INSPECT_OR_RETRY_REPLICA");
});
test("Previous cache is accepted only for same repo/branch, never a source of live truth",()=>{
  const prior=deriveAthenaContext({...base,runs:[run(2,"old",older)],run_id:50});
  const current=deriveAthenaContext({...base,previous:prior});
  assert.equal(current.prior_cache_source,prior.context_id);
  assert.ok(current.historical_receipts.some(x=>x.id===2));
  assert.equal(current.actions.latest_staging_deploy.id,12);
  const other=deriveAthenaContext({...base,previous:{...prior,branch:"main"}});
  assert.equal(other.prior_cache_source,null);
});
test("Foreign repo, main and invalid commit IDs are rejected without side effects",()=>{
  for(const change of [{branch:"main"},{repository:"evil/other"},{source_sha:"bad"}])
    assert.throws(()=>deriveAthenaContext({...base,...change}),/ATHENA_/);
});
