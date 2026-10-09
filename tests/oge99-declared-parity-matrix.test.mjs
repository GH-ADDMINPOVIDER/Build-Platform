import test from "node:test";
import assert from "node:assert/strict";
import { buildParityMatrix } from "../scripts/replica-runner/parity-matrix.mjs";

const sha = "a".repeat(40);
const basics = () => ({
  sha, repository: "Ogenicchocolate21debug/Build-Platform",
  branch: "phase-vi-provider-incentive-metering", runId: "123",
  replica: {source_sha:sha,local_db_only:true,provider_inference_calls:0,real_cloudflare_deploy:false,
    status:"LOCAL_PROOF_PASS",local_checks_passed:12,local_checks_total:12,
    staging_comparison:{status:"SURFACE_TARGET_MET",tests_matched:10,tests_total:10,
      cases:Array.from({length:10},(_,i)=>({test:"case"+i,match:true}))}},
  oneLine:{source_sha:sha,remote_d1_access:false,provider_calls:0,
    status:"LOCAL_1LSS_PASS",checks_passed:13,checks_total:13},
  restart:{source_sha:sha,remote_d1_access:false,provider_calls:0,
    status:"LOCAL_1LSS_RESTART_PASS",checks_passed:8,checks_total:8},
});

test("OGE-99 distinguishes four proven local/public domains from six NOT_TESTED domains",()=>{
  const out=buildParityMatrix(basics());
  assert.equal(out.verified_domain_count,4);
  assert.equal(out.not_tested_domain_count,6);
  assert.equal(out.result,"PARTIAL_PARITY_EVIDENCE_COMPLETE");
  assert.equal(out.ready_to_close_oge99,false);
  assert.equal(out.ready_to_close_stone_phase,false);
  assert.equal(out.full_operational_1_to_1_certified,false);
  assert.equal(out.green_canonical_promotion_authorized,false);
});
test("OGE-99 rejects stale SHA, unauthorized external effects and non-staging branch",()=>{
  const variants=[
    {...basics(),oneLine:{...basics().oneLine,source_sha:"b".repeat(40)}},
    {...basics(),replica:{...basics().replica,real_cloudflare_deploy:true}},
    {...basics(),restart:{...basics().restart,provider_calls:1}},
    {...basics(),branch:"main"}
  ];
  for (const v of variants) assert.throws(()=>buildParityMatrix(v));
});
test("OGE-99 reports failed evidence instead of inventing a completed parity certificate",()=>{
  const v=basics();
  v.restart.checks_passed=7;
  const out=buildParityMatrix(v);
  assert.equal(out.result,"LOCAL_PARITY_EVIDENCE_FAILED");
  assert.equal(out.checks.find(x=>x.id==="warm_restart_1lss_persistence").status,"FAIL");
  assert.equal(out.full_operational_1_to_1_certified,false);
});
test("OGE-99 cannot treat incomplete public case list as ten-route proof",()=>{
  const v=basics();
  v.replica.staging_comparison.cases=v.replica.staging_comparison.cases.slice(0,9);
  const out=buildParityMatrix(v);
  assert.equal(out.checks.find(x=>x.id==="ten_public_staging_surface_contracts").status,"FAIL");
});
