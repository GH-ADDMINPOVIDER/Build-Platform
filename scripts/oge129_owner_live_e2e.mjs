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
// One self-hosted Runner-1 can run only one job: never poll here while its
// consumer job is queued on the SAME host. Reuse an existing queued consumer.
const ghToken=String(process.env.GH_TOKEN||"").trim();
if(!ghToken)throw new Error("GITHUB_READ_AUTH_MISSING_FOR_QUEUE_CHECK");
const activeResponse=await fetch(
  "https://api.github.com/repos/"+repo+"/actions/workflows/wave-command-consumer.yml/runs?branch="+
  encodeURIComponent(branch)+"&per_page=20",
  {headers:{Authorization:"Bearer "+ghToken,Accept:"application/vnd.github+json",
    "User-Agent":"ogenic-oge129-queue-check"},redirect:"error",
    signal:AbortSignal.timeout(20000)}
).catch(()=>null);
const activeData=activeResponse?.status===200 ? await activeResponse.json().catch(()=>({})) : {};
if(!Array.isArray(activeData.workflow_runs))throw new Error("GITHUB_CONSUMER_QUEUE_READ_UNVERIFIED");
const pending=activeData.workflow_runs.find(run=>
  ["queued","in_progress","waiting","pending"].includes(String(run.status)) &&
  run.head_branch===branch &&
  Number.isFinite(Date.parse(run.created_at)) &&
  Date.now()-Date.parse(run.created_at)<60*60*1000);
if(pending){
  console.log("OGE129_EXISTING_CONSUMER_RUN_ID="+String(pending.id));
  console.log("OGE129_DISPATCH=REUSED_EXISTING_NO_SECOND_CODEX_CALL");
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "### OGE-129 existing command recovered\n\nConsumer run "+
    String(pending.html_url||pending.id)+" already queued; no duplicate command sent. "+
    "Runner-1 released for actual Codex result and D1 verification.\n");
  process.exit(0);
}
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
console.log("OGE129_EXECUTION=WAIT_FOR_CONSUMER_RESULT_NOT_DONE");
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  "### OGE-129 WAVE live command dispatch\n\n"+
  "- Owner Session validated\n"+
  "- One read-only Codex command dispatched to the existing Runner-1\n"+
  "- Task ID: "+taskId+"\n"+
  "- **E2E is pending** until WAVE Command Consumer verifies a D1 COMMAND_RESULT_DONE receipt\n");
