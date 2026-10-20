// One real owner-authorized read-only Codex command; staging and existing Runner-1 only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";

const repo="Ogenicchocolate21debug/Build-Platform";
const branch="phase-vi-provider-incentive-metering";
const base="https://wave.ogenicchocolate.com";
assert.equal(process.env.GITHUB_REPOSITORY,repo,"REPO_SCOPE");
assert.equal(process.env.GITHUB_REF_NAME,branch,"STAGING_BRANCH_SCOPE");
assert.equal(process.env.RUNNER_NAME,"wave-runner-01","RUNNER_SCOPE");
assert.match(String(process.env.GITHUB_SHA||""),/^[a-f0-9]{40}$/,"SOURCE_SHA");
const key=String(process.env.OGENIC_OPS_KEY||"").trim();
if(!key)throw new Error("OWNER_IDENTITY_SOURCE_MISSING");
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
async function request(path,options={}){
  try{
    const response=await fetch(base+path,{
      ...options,redirect:"error",signal:AbortSignal.timeout(25000),
      headers:{"content-type":"application/json","accept":"application/json",...(options.headers||{})}
    });
    return{http:response.status,body:await response.json().catch(()=>({}))};
  }catch{return{http:0,body:{code:"NETWORK_UNAVAILABLE"}}}
}
const health=await request("/api/health");
assert.equal(health.http,200,"STAGING_HEALTH_HTTP");
assert.equal(health.body.ok,true,"STAGING_HEALTH");
console.log("OGE129_STAGING_HEALTH=PASS");
const signed=await request("/api/session",{
  method:"POST",headers:{"x-ogenic-client":"native"},body:JSON.stringify({owner_key:key})
});
const session=String(signed.body?.session_token||"");
if(signed.http!==200||signed.body?.authenticated!==true||signed.body?.user?.role!=="owner"||!session){
  throw new Error("SIGNED_OWNER_SESSION_UNAVAILABLE_HTTP_"+signed.http);
}
const authorization={authorization:"Bearer "+session};
const verified=await request("/api/session",{headers:authorization});
assert.equal(verified.body?.authenticated,true,"SIGNED_OWNER_SESSION_NOT_VERIFIED");
console.log("OGE129_SIGNED_OWNER_SESSION=PASS");
const intent="OGE129 READONLY PROOF: Inspect the staging checkout package.json and report the package name and script names. Do not change files, install tools, access the network, or alter Git state.";
const dispatched=await request("/api/wave/command",{
  method:"POST",headers:{...authorization,"Idempotency-Key":randomUUID()},
  body:JSON.stringify({command:intent,capability:"codex_selfhost",provider:"openai",mode:"read",environment:"staging"})
});
const taskId=String(dispatched.body?.task?.id||"");
if(dispatched.http!==202||!dispatched.body?.ok||!/^wavecmd_[a-f0-9]{64}$/.test(taskId)){
  console.log("OGE129_COMMAND_ADMISSION_HTTP="+dispatched.http);
  console.log("OGE129_COMMAND_ADMISSION_CODE="+String(dispatched.body?.code||"UNVERIFIED").slice(0,80));
  throw new Error("OWNER_COMMAND_NOT_ADMITTED");
}
console.log("OGE129_TASK_ID="+taskId);
if(dispatched.body?.code==="COMMAND_MANUAL_DISPATCH_REQUIRED"){
  console.log("OGE129_AUTOMATIC_DISPATCH_FAILURE="+String(dispatched.body?.dispatch?.automatic_dispatch_error||"UNKNOWN").slice(0,80));
  throw new Error("WORKER_ACTIONS_DISPATCH_NOT_WORKING");
}
if(dispatched.body?.code!=="COMMAND_DISPATCHED")throw new Error("DISPATCH_NOT_CONFIRMED");
if(dispatched.body?.approval?.authority!=="SIGNED_OWNER_SESSION"||dispatched.body?.approval?.required!==false){
  throw new Error("OWNER_AUTHORITY_NOT_VERIFIED");
}
console.log("OGE129_ACTIONS_DISPATCH=PASS");
const until=Date.now()+16*60*1000;
let last="AWAITING_RUNNER";
let completed=false;
while(Date.now()<until){
  await delay(9000);
  const status=await request("/api/wave/command/status?task_id="+encodeURIComponent(taskId),{headers:authorization});
  if(status.http!==200||status.body?.ok!==true){last="STATUS_HTTP_"+status.http;continue}
  const body=status.body;
  last=String(body.execution?.status||"UNKNOWN")+"_"+String(body.last_event||"NO_EVENT");
  if(body.execution?.status==="DONE"){
    if(body.last_event!=="COMMAND_RESULT_DONE"||body.execution?.consumer_proven!==true)throw new Error("DONE_WITHOUT_PROOF");
    assert.match(String(body.evidence?.result_sha256||""),/^[a-f0-9]{64}$/,"RESULT_HASH");
    assert.match(String(body.evidence?.git_sha||""),/^[a-f0-9]{40}$/,"CONSUMER_SHA");
    assert.match(String(body.evidence?.evidence_ref||""),/^https:\/\/github\.com\/Ogenicchocolate21debug\/Build-Platform\/actions\/runs\/\d+$/,"EVIDENCE_URL");
    if(body.evidence.git_sha!==process.env.GITHUB_SHA)throw new Error("CONSUMER_SOURCE_MISMATCH");
    console.log("OGE129_CODEX_RUNTIME_EXECUTION=PASS");
    console.log("OGE129_COMMAND_RESULT_DONE=PASS");
    console.log("OGE129_CONSUMER_RUN_URL="+body.evidence.evidence_ref);
    console.log("OGE129_RESULT_SHA256="+body.evidence.result_sha256);
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "### OGE-129 E2E — Signed Owner → GH-2 Dispatch → Runner-1 → Codex → D1\n\n"+
      "- **PASS**: actual read-only Codex run and authenticated D1 RESULT_DONE readback\n"+
      "- Task: "+taskId+"\n- Consumer: "+body.evidence.evidence_ref+
      "\n- Source SHA: "+body.evidence.git_sha+
      "\n- Result SHA256: "+body.evidence.result_sha256+"\n",{encoding:"utf8"});
    completed=true;
    break;
  }
  if(["FAILED","BLOCKED","CANCELLED"].includes(String(body.execution?.status))){
    console.log("OGE129_FAILED_STATE="+last.slice(0,100));
    throw new Error("EXECUTION_RESULT_NOT_DONE");
  }
}
if(!completed)throw new Error("D1_RESULT_NOT_CONFIRMED_"+last.slice(0,100));
console.log("OGE129_OWNER_TO_D1_E2E=PASS");
