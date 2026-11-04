// OGE-97 — local-only CCS/USE CARD HTTP policy proof, no real lease persistence or external execution.
// Exercises the same built Worker as production in disposable workerd, using a synthetic ops key.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base=process.env.REPLICA_URL || "http://127.0.0.1:8787";
const key=process.env.REPLICA_TEST_OPS_KEY||"";
if(!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(base))throw Error("LOCAL_LOOPBACK_RUNTIME_REQUIRED");
if(key.length<32)throw Error("EPHEMERAL_TEST_KEY_REQUIRED");
const ev={schema_version:"OGE97_LOCAL_CCS_HTTP_V1",source_sha:process.env.GITHUB_SHA||"local",
  mode:"SYNTHETIC_POLICY_EVALUATION_ONLY",remote_d1_access:false,provider_calls:0,
  actual_lease_persisted:false,real_tool_invoked:false,checks:{},status:"NOT_PROVEN"};
const check=(n,good,detail)=>{ev.checks[n]=Boolean(good);assert.ok(good,n+":"+String(detail).slice(0,80))};
async function req(path,method="GET",payload=null,authorized=true){
  const r=await fetch(base+path,{method,headers:{
    ...(authorized?{"x-ogenic-ops-key":key}:{}),
    ...(payload?{"Content-Type":"application/json"}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(9000)});
  return {code:r.status,data:await r.json().catch(()=>({}))};
}
const source={card_id:"fixture.source",state:"READY",provider_id:"github",
  capability_id:"read_file",permission_class:"READ",environment:"staging",lease_eligible:true};
const borrower={...source,card_id:"fixture.borrower"};
const lease={source,borrower,reason:"RATE_LIMIT",requested_permission:"READ",
  requested_ttl_minutes:5,requested_max_calls:2,operation:"read_file"};
const envelope=(state,verb)=>({state,verb,card_id:"fixture.card",capability:"read_file"});
try {
  const u=await req("/api/ccs/status","GET",null,false);
  check("status_requires_ops",u.code===401&&u.data.code==="REAUTH_REQUIRED",u.code);
  const st=await req("/api/ccs/status");
  check("ccs_status_scoped",st.code===200&&st.data.protocol==="CCS/1.0"&&st.data.direct_execution_bypass===false,st.code);
  const ins=await req("/api/ccs/envelope","POST",envelope("ABSENT","INSERT"));
  check("insert_transition",ins.code===200&&ins.data.card?.state==="INSERTED",ins.code);
  const ver=await req("/api/ccs/envelope","POST",envelope("INSERTED","VERIFY"));
  check("verify_transition",ver.code===200&&ver.data.card?.state==="VERIFIED",ver.code);
  const le=await req("/api/ccs/envelope","POST",envelope("VERIFIED","LEASE"));
  check("lease_requires_policy_gate",le.code===200&&le.data.lease?.state==="REQUEST_POLICY_CHECK"&&le.data.direct_execution_bypass===false,le.code);
  const revoke=await req("/api/ccs/envelope","POST",envelope("LEASED","REVOKE"));
  check("revocation_transition",revoke.code===200&&revoke.data.card?.state==="REVOKED",revoke.code);
  const denied=await req("/api/ccs/envelope","POST",envelope("REVOKED","USE"));
  check("revoked_state_cannot_use",denied.code===409&&denied.data.code==="CCS_TRANSITION_DENIED",denied.code);
  const allowed=await req("/api/ccs/lease","POST",lease);
  check("same_provider_read_policy_allowed",allowed.code===200&&allowed.data.code==="LEASE_ALLOWED_BY_SIGNED_POLICY"&&
    allowed.data.evidence?.state==="RUBY_PENDING"&&allowed.data.direct_execution_bypass===false,allowed.code);
  const cross=await req("/api/ccs/lease","POST",{...lease,source:{...source,provider_id:"not-github"}});
  check("cross_provider_lease_denied",cross.code===409&&cross.data.code==="CROSS_PROVIDER_LEASE_DENIED_V1",cross.code);
  const escalate=await req("/api/ccs/lease","POST",{...lease,requested_permission:"WRITE"});
  check("permission_escalation_denied",escalate.code===409&&escalate.data.code==="PERMISSION_ESCALATION_DENIED",escalate.code);
  const dangerous=await req("/api/ccs/lease","POST",{...lease,operation:"production delete"});
  check("production_destructive_operation_denied",dangerous.code===409&&dangerous.data.code==="PROTECTED_OPERATION_REQUIRES_OWNER",dangerous.code);
  const unauth=await req("/api/ccs/lease","POST",lease,false);
  check("lease_requires_ops",unauth.code===401&&unauth.data.code==="REAUTH_REQUIRED",unauth.code);
  const old=await req("/api/use-card/status");
  check("legacy_use_card_authority_intact",old.code===200&&old.data.execution_authority==="YELLOW_STONE_ONLY",old.code);
  ev.status="LOCAL_CCS_POLICY_PASS";
}catch(e){ev.status="LOCAL_CCS_POLICY_FAIL";ev.error=String(e?.message||e).slice(0,160);process.exitCode=1}
finally{
  ev.checks_passed=Object.values(ev.checks).filter(Boolean).length;
  ev.checks_total=Object.keys(ev.checks).length;
  writeFileSync("oge97-local-ccs-evidence.json",JSON.stringify(ev,null,2)+"\n");
  console.log(JSON.stringify({status:ev.status,checks:ev.checks_passed+"/"+ev.checks_total,
    actual_lease_persisted:false,provider_calls:0,evidence:"oge97-local-ccs-evidence.json",error:ev.error||null}));
}
