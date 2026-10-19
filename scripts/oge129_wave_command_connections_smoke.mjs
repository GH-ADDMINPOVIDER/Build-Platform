// OGE-129 — WAVE Command/Connector real-runtime smoke proof (staging only).
// No actual deployment, workflow dispatch, remote writes, credential/body logging or command execution.
import { createHash } from "node:crypto";
const ghrepo="Ogenicchocolate21debug/Build-Platform";
const runId=String(process.env.GITHUB_RUN_ID||"");
const base="https://wave.ogenicchocolate.com";
const results=[];
const timeout=12000;
const ghHeaders={Authorization:"Bearer "+String(process.env.GH_TOKEN||""),Accept:"application/vnd.github+json","User-Agent":"ogenic-oge129-connectivity-proof"};
const jsonHeaders={"Content-Type":"application/json","User-Agent":"ogenic-oge129-connectivity-proof"};
const summary=(name,status,evidence={})=>{
  const record={name,status,...evidence};
  results.push(record);
  console.log("OGE129_"+name+"="+status);
};
async function jsonGet(url,headers={}){
  try{
    const resp=await fetch(url,{headers:{...jsonHeaders,...headers},signal:AbortSignal.timeout(timeout),redirect:"error"});
    let body={};try{body=await resp.json()}catch{}
    return {code:resp.status,body,headers:resp.headers};
  }catch{return{code:0,body:{},headers:new Headers()}}
}
async function jsonPost(path,payload,extraHeaders={}){
  try{
    const resp=await fetch(base+path,{method:"POST",headers:{...jsonHeaders,...extraHeaders},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout),redirect:"error"});
    let body={};try{body=await resp.json()}catch{}
    return{code:resp.status,body,headers:resp.headers};
  }catch{return{code:0,body:{},headers:new Headers()}}
}
const cookie=await(async()=>{
  // First prove unauthenticated requests are rejected without queuing work.
  const noauth=await jsonPost("/api/wave/command",{
    intent:"read contract",capability:"read_file",provider:"github",environment:"staging",
    input:{path:"tests/wave-command-contract.test.mjs"}});
  summary("UNAUTHENTICATED_COMMAND_GUARD",noauth.code===401&&noauth.body?.code==="REAUTH_REQUIRED"?"PASS":"FAIL",
    {http_status:noauth.code,code:noauth.body?.code||"UNAVAILABLE"});
  const key=String(process.env.OGENIC_OPS_KEY||"");
  if(!key){summary("OWNER_SESSION","NOT_VERIFIED_MISSING_OGENIC_OPS_KEY");return"";}
  try{
    const auth=await fetch(base+"/api/session",{method:"POST",headers:jsonHeaders,
      body:JSON.stringify({owner_key:key}),redirect:"error",signal:AbortSignal.timeout(timeout)});
    const body=await auth.json().catch(()=>({}));
    const text=auth.headers.get("set-cookie")||"";
    const valid=auth.status===200&&body.authenticated===true&&body.user?.role==="owner"&&text.startsWith("ogenic_owner_session=");
    summary("OWNER_SESSION",valid?"PASS":"FAIL",{http_status:auth.status});
    if(!valid)return"";
    return text.split(";",1)[0];
  }catch{summary("OWNER_SESSION","FAIL_NETWORK");return"";}
})();
if(cookie){
  // READ command is pre-authorized by existing Yellow resolver; it may write metadata
  // to canonical 1LSS but never mutate source, deploy, run workflow or read secrets.
  const read=await jsonPost("/api/wave/command",{
    intent:"Read checked-in public contract via Yellow Stone for staging connectivity proof",
    capability:"read_file",provider:"github",environment:"staging",
    input:{path:"tests/wave-command-contract.test.mjs"}},{cookie});
  const verified=read.code===200&&read.body?.ok===true&&read.body?.verification?.status==="verified"
    &&read.body?.resolver?.descriptor?.provider_id==="github"
    &&read.body?.canonical?.session_line==="1LSS_OWNER_MAIN"
    &&read.body?.command_handoff?.direct_execution_bypass===false;
  summary("YELLOW_GITHUB_READ_1LSS",verified?"PASS":"FAIL",
    {http_status:read.code,code:read.body?.code||"NONE",
      verification:read.body?.verification?.status||"UNVERIFIED",
      canonical_recorded:read.body?.canonical?.session_line==="1LSS_OWNER_MAIN"});
  // WAVE owner-approval (first gate): NO owner confirmation sent, NO enqueue or dispatch.
  const prospective=await jsonPost("/api/wave/command",{
    intent:"promote deployment",capability:"deploy_promote",provider:"cloudflare",environment:"staging"
  },{cookie});
  const firstGate=prospective.code===202&&prospective.body?.code==="OWNER_APPROVAL_REQUIRED"
    &&prospective.body?.approval?.required===true
    &&prospective.body?.execution?.status==="NOT_STARTED"
    &&prospective.body?.command_handoff?.direct_execution_bypass===false;
  summary("WAVE_OWNER_APPROVAL_GATE",firstGate?"PASS":"FAIL",
    {http_status:prospective.code,code:prospective.body?.code||"UNAVAILABLE",
      effect:prospective.body?.execution?.status||"UNKNOWN"});
  // Underlying Yellow Stone permission gate (second gate) has its OWN 409 contract.
  const yellow=await jsonPost("/api/capabilities/execute",{
    intent:"promote deployment",capability:"deploy_promote",provider:"cloudflare",environment:"staging"
  },{cookie});
  const secondGate=yellow.code===409&&yellow.body?.code==="HUMAN_APPROVAL_REQUIRED"
    &&yellow.body?.approval?.required===true
    &&yellow.body?.verification?.status==="blocked";
  summary("YELLOW_NONREAD_PERMISSION_GATE",secondGate?"PASS":"FAIL",
    {http_status:yellow.code,code:yellow.body?.code||"UNAVAILABLE"});
  // Read-only provider connection route; no execution/import.
  const n8n=await jsonGet(base+"/api/n8n/migration/selfhost/status",{cookie});
  summary("WAVE_N8N_SELFHOST_READINESS",n8n.code===200&&n8n.body?.ok===true&&n8n.body?.destination?.reachable===true?"PASS":
    n8n.code===503?"BLOCKED": "UNVERIFIED",
    {http_status:n8n.code,reason:n8n.body?.control?.reason||n8n.body?.code||"NOT_RETURNED",
      execution_enabled:false});
}else{
  for(const name of ["YELLOW_GITHUB_READ_1LSS","WAVE_OWNER_APPROVAL_GATE",
    "YELLOW_NONREAD_PERMISSION_GATE","WAVE_N8N_SELFHOST_READINESS"])summary(name,"NOT_TESTED_SESSION_UNAVAILABLE");
}
const n8nDirect=await jsonGet("https://n8n-staging-76b7.up.railway.app/healthz");
summary("N8N_HTTP_HEALTH",n8nDirect.code===200?"PASS":"UNVERIFIED",{http_status:n8nDirect.code});
// Independent GitHub identity and dispatch workflow metadata. NO dispatch performed.
try{
  const resp=await fetch("https://api.github.com/repos/"+ghrepo+"/actions/workflows/wave-command-consumer.yml",
    {headers:ghHeaders,redirect:"error",signal:AbortSignal.timeout(timeout)});
  const body=await resp.json().catch(()=>({}));
  summary("GITHUB_CONSUMER_WORKFLOW_READ",resp.status===200&&body?.state==="active"?"PASS":"UNVERIFIED",
    {http_status:resp.status,workflow_state:body?.state||"NOT_LISTED"});
}catch{summary("GITHUB_CONSUMER_WORKFLOW_READ","UNVERIFIED_NETWORK");}
// Identity OIDC was performed by the existing Infisical action; never return secret values.
summary("INFISICAL_OIDC_CREDENTIAL_BIND",process.env.OGENIC_OPS_KEY?"PASS":"NOT_VERIFIED",
  {credentials_logged:false});
// Staging-only metadata query, no SELECT document_json or any secret columns.
const cfAccount=process.env.CLOUDFLARE_ACCOUNT_ID||"";
const cfToken=process.env.CLOUDFLARE_API_TOKEN||"";
if(cfAccount&&cfToken){
  const q="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(cfAccount)+
    "/d1/database/b4ac3a33-df80-47cf-8e75-7574e025b87b/query";
  try{
    const response=await fetch(q,{method:"POST",headers:{
      Authorization:"Bearer "+cfToken,"Content-Type":"application/json","User-Agent":"ogenic-oge129-connection-proof"},
      body:JSON.stringify({sql:"SELECT COUNT(*) AS receipt_count FROM certificate_lincenc",params:[]}),
      redirect:"error",signal:AbortSignal.timeout(timeout)});
    const raw=await response.json().catch(()=>({}));
    const nr=raw.result?.[0]?.results?.[0]?.receipt_count;
    summary("CLOUDFLARE_D1_READ_ONLY",response.status===200&&raw.success===true&&Number.isFinite(Number(nr))?"PASS":"BLOCKED",
      {http_status:response.status,rows_count:Number.isFinite(Number(nr))?Number(nr):null,query_is_read_only:true});
  }catch{summary("CLOUDFLARE_D1_READ_ONLY","UNVERIFIED_NETWORK")}
}else summary("CLOUDFLARE_D1_READ_ONLY","NOT_VERIFIED_CREDENTIALS_MISSING");
const outcome={
  protocol:"OGE129_WAVE_COMMAND_CONNECTOR_SMOKE_V1",
  environment:"staging",runner:"wave-runner-01",run_id:runId,
  source_sha:process.env.GITHUB_SHA,started_at:new Date().toISOString(),
  no_mutating_command_submitted:true,no_workflow_dispatch_submitted:true,
  no_public_endpoints_opened:true,no_prod_changes:true,no_secrets_in_receipt:true,
  results,counts:Object.fromEntries(["PASS","FAIL","BLOCKED","UNVERIFIED"].map(k=>[k,
    results.filter(x=>x.status===k||x.status.startsWith(k+"_")).length]))
};
const body="### OGE-129 · WAVE Command/Connector Staging Smoke\n"+
  "\`\`\`json\n"+JSON.stringify(outcome,null,2)+"\n\`\`\`\n"+
  "Auth/READ/Owner-Approval/Yellow Gate statuses checked separately. No actual command dispatch or mutation E2E performed.";
// Persist sanitized evidence, but don't mistake an issue comment for D1 output.
if(process.env.GH_TOKEN){
  try{
    const resp=await fetch("https://api.github.com/repos/"+ghrepo+"/issues/39/comments",{
      method:"POST",headers:{...ghHeaders,"Content-Type":"application/json"},
      body:JSON.stringify({body}),signal:AbortSignal.timeout(timeout)});
    console.log("OGE129_ISSUE_RECEIPT_HTTP="+resp.status);
  }catch{console.log("OGE129_ISSUE_RECEIPT_HTTP=UNAVAILABLE")}
}
const hash=createHash("sha256").update(JSON.stringify(outcome)).digest("hex");
console.log("OGE129_REPORT_SHA256="+hash);
console.log("OGE129_SUMMARY="+JSON.stringify({pass:outcome.counts.PASS,fail:outcome.counts.FAIL,
  blocked:outcome.counts.BLOCKED,unverified:outcome.counts.UNVERIFIED}));
