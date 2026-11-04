// OGE-129: Agent → Signed Owner Session → Unifiend Command → Yellow Approval proof.
// This proof intentionally does not issue the second owner confirmation or dispatch.
const BASE="https://wave.ogenicchocolate.com";
const headers={"content-type":"application/json","accept":"application/json","user-agent":"ogenic-oge129-agent-sign-run-proof"};
const results=[];
const sha=process.env.GITHUB_SHA||"UNKNOWN";
const run=process.env.GITHUB_RUN_ID||"UNKNOWN";
const task={
  intent:"Agent signed staging readiness run: inspect connector policy without changing code or deploying",
  capability:"codex_selfhost",
  provider:"openai",
  mode:"execute",
  environment:"staging"
};
function row(step,pass,meta={}){
  results.push({step,result:pass?"PASS":"BLOCKED",...meta});
  console.log("AGENT_SIGN_RUN_"+step+"="+(pass?"PASS":"BLOCKED"));
}
async function post(path,body,cookie){
 try{
  const res=await fetch(BASE+path,{method:"POST",headers:{...headers,...(cookie?{cookie}:{})},
    redirect:"error",signal:AbortSignal.timeout(15000),body:JSON.stringify(body)});
  return {status:res.status,data:await res.json().catch(()=>({})),cookie:res.headers.get("set-cookie")||""};
 }catch{return{status:0,data:{code:"NETWORK_UNAVAILABLE"},cookie:""}}
}
async function get(path,cookie){
 try{
  const res=await fetch(BASE+path,{headers:{...headers,...(cookie?{cookie}:{})},redirect:"error",signal:AbortSignal.timeout(15000)});
  return{status:res.status,data:await res.json().catch(()=>({}))};
 }catch{return{status:0,data:{code:"NETWORK_UNAVAILABLE"}}}
}
let cookie="";
const key=String(process.env.OGENIC_OPS_KEY||"");
if(!key)row("EXISTING_OWNER_IDENTITY_AVAILABLE",false);
else{
 const login=await post("/api/session",{owner_key:key});
 cookie=login.cookie.split(";",1)[0];
 row("SIGNED_OWNER_SESSION_ISSUED",login.status===200&&login.data?.authenticated===true
   &&login.data?.user?.role==="owner"&&cookie.startsWith("ogenic_owner_session="),
   {status:login.status});
 if(cookie){
  const verified=await get("/api/session",cookie);
  row("SIGNED_OWNER_SESSION_VERIFIED",verified.status===200&&verified.data?.authenticated===true
    &&verified.data?.user?.role==="owner",{status:verified.status});
  const approval=await post("/api/unifiend/command",task,cookie);
  const challenge=approval.data?.approval?.approval_id;
  const challengeOkay=approval.status===202&&approval.data?.code==="OWNER_APPROVAL_REQUIRED"
    &&approval.data?.approval?.required===true&&typeof challenge==="string"&&challenge.startsWith("wave-approval-")
    &&approval.data?.execution?.status==="NOT_STARTED"
    &&approval.data?.command_handoff?.execution_authority==="YELLOW_STONE_ONLY"
    &&approval.data?.command_handoff?.direct_execution_bypass===false;
  row("AGENT_COMMAND_OWNER_APPROVAL_CHALLENGE",challengeOkay,{status:approval.status,
    code:approval.data?.code||"UNKNOWN",command_executed:false});
  if(challengeOkay){
   // Prove the command cannot run with a forged or mismatched approval token.
   const invalid=await post("/api/unifiend/command",{...task,
     approval:{confirmed:true,approval_id:"wave-approval-invalid-proof-only"}},cookie);
   row("MISMATCHED_SIGNATURE_DENIED",
     invalid.status===409&&invalid.data?.code==="APPROVAL_PLAN_MISMATCH",
     {status:invalid.status,code:invalid.data?.code||"UNKNOWN"});
  }
 }
}
const all=results.length===4&&results.every(r=>r.result==="PASS");
const outcome={
 protocol:"OGE129_AGENT_SIGN_RUN_COMMAND_ADMISSION_V1",source_sha:sha,run_id:run,
 mode:"UNIFIEND_COMMAND_API",environment:"staging",
 agent:"codex_selfhost",owner_session:"HMAC_SESSION",
 owner_approval:"YELLOW_STONE_TWO_STEP_CHALLENGE",signed_capability_grant:false,
 no_approval_confirmation_sent:true,no_command_dispatch_sent:true,
 no_agent_executed:true,no_secret_output:true,no_production_change:true,
 result:all?"SIGNED_ADMISSION_PASS_EXECUTION_PENDING_OWNER_CONFIRM":"PARTIAL_OR_BLOCKED",checks:results
};
console.log("AGENT_SIGN_RUN_RESULT="+outcome.result);
const fs=await import("node:fs");
if(process.env.GITHUB_STEP_SUMMARY){
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  "### Unifiend Agent Sign Run — Signed Command Admission\n\n"+
  "| Stage | Status |\n|---|---|\n"+
  results.map(r=>"| "+r.step+" | "+r.result+" |\n").join("")+
  "\n**This is not an executed Agent task.** Matching Owner confirmation is required. No secret, cookie, or approval ID is published.\n");
}
if(!all)process.exitCode=1;
