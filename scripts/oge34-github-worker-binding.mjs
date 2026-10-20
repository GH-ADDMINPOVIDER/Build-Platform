import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO = "Ogenicchocolate21debug/Build-Platform";
const BRANCH = "phase-vi-provider-incentive-metering";
const WORKER = "ogenic-phase-vi-staging";
const GITHUB_API = "https://api.github.com/repos/" + REPO;
const WAVE = "https://wave.ogenicchocolate.com";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function inspectTokenFormat(value) {
  return typeof value === "string" && /^[\x21-\x7e]+$/.test(value);
}
export function classifyDispatchProbe(http) {
  if (http === 422) return "AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN";
  if (http === 403) return "ACTIONS_WRITE_DENIED";
  if (http === 404) return "WORKFLOW_UNAVAILABLE_OR_ACCESS_DENIED";
  if (http === 401) return "TOKEN_REAUTH_REQUIRED";
  return "UNVERIFIED_HTTP_" + http;
}
const responseJson = async (response) => await response.json().catch(() => ({}));
function requireStaging() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPO, "REPO_SCOPE");
  assert.equal(process.env.GITHUB_REF_NAME, BRANCH, "STAGING_BRANCH_SCOPE");
  assert.equal(process.env.RUNNER_NAME, "wave-runner-01", "RUNNER_SCOPE");
  assert.equal(process.env.WORKER_NAME, WORKER, "WORKER_SCOPE");
  assert.equal(process.env.INFISICAL_PROJECT_ID, "e8cfba67-ea99-4d79-bc9f-87b862f9129c", "INFISICAL_PROJECT_SCOPE");
  assert.equal(process.env.INFISICAL_PROJECT_SLUG, "ogenic-sio-ti-rv", "INFISICAL_PROJECT_SLUG_SCOPE");
  assert.equal(process.env.INFISICAL_SECRET_ENV_SLUG, "staging", "INFISICAL_STAGING_SECRET_SCOPE");
  assert.equal(process.env.INFISICAL_SECRET_PATH, "/", "INFISICAL_SECRET_PATH_SCOPE");
}
async function githubRequest(path, token, options={}) {
  return fetch(GITHUB_API + path, {
    ...options,
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ogenic-oge34-staging-binding",
    },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
}
async function verifyOwnerRead() {
  const ownerKey=process.env.OGENIC_OPS_KEY || "";
  if (!ownerKey) throw new Error("OWNER_KEY_STAGING_BINDING_MISSING");
  let last=0, lastCode="NO_RESULT";
  for (let i=0;i<6;i++) {
    const auth=await fetch(WAVE+"/api/session",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({owner_key:ownerKey}),redirect:"error",signal:AbortSignal.timeout(15000)
    });
    const authBody=await responseJson(auth);
    if (auth.status!==200 || authBody.authenticated!==true) throw new Error("OWNER_SESSION_REJECTED_"+auth.status);
    const cookie=(auth.headers.get("set-cookie")||"").split(";",1)[0];
    if (!cookie.startsWith("ogenic_owner_session=")) throw new Error("OWNER_SESSION_COOKIE_MISSING");
    const read=await fetch(WAVE+"/api/wave/command",{
      method:"POST",headers:{"content-type":"application/json","cookie":cookie},
      body:JSON.stringify({intent:"Validate staging GitHub endpoint credential binding via verified READ",
        capability:"read_file",provider:"github",environment:"staging",input:{path:"package.json"}}),
      redirect:"error",signal:AbortSignal.timeout(15000)
    });
    const b=await responseJson(read);last=read.status;lastCode=String(b.code||"UNSPECIFIED").slice(0,70);
    if (read.status===200 && b.ok===true && b.verification?.status==="verified" &&
        b.resolver?.descriptor?.provider_id==="github" &&
        b.canonical?.session_line==="1LSS_OWNER_MAIN") {
      console.log("OGE34_WAVE_GITHUB_ENDPOINT_VERIFIED_READ=PASS");
      console.log("OGE34_STAGING_ONE_LINE_RECEIPT=PASS");
      return;
    }
    if(i<5) await delay(3000);
  }
  throw new Error("OGE34_WAVE_GITHUB_ENDPOINT_NOT_VERIFIED_HTTP_"+last+"_CODE_"+lastCode);
}
export async function main() {
  requireStaging();
  const canonical=process.env.GITHUB_TOKEN_OGE34||"";
  const legacy=process.env.GIBHUB_TOKEN_OGE34||"";
  if(canonical && legacy && canonical!==legacy) throw new Error("CONFLICTING_INFISICAL_GITHUB_ALIASES");
  const token=canonical||legacy;
  if(!inspectTokenFormat(token)) throw new Error("OGE34_TOKEN_MISSING_OR_CONTROL_CHARACTERS");
  console.log("::add-mask::"+token);
  const branch=await githubRequest("/branches/"+BRANCH,token);
  console.log("OGE34_GITHUB_BRANCH_HTTP="+branch.status);
  if(branch.status!==200)throw new Error("OGE34_GITHUB_READ_FAILED_"+branch.status);
  const actions=await githubRequest("/actions/runs?branch="+BRANCH+"&per_page=1",token);
  console.log("OGE34_GITHUB_ACTIONS_READ_HTTP="+actions.status);
  if(actions.status!==200)throw new Error("OGE34_GITHUB_ACTIONS_READ_FAILED_"+actions.status);
  // This ref NEVER exists. 422 is a permission check; 204 must be rejected.
  // No real workflow dispatch is submitted and no Runner job is created here.
  const negativeRef="__OGENIC_UNRESOLVABLE_REF_"+process.env.GITHUB_RUN_ID+"_"+process.env.GITHUB_RUN_ATTEMPT+"__";
  const probe=await githubRequest("/actions/workflows/wave-command-consumer.yml/dispatches",token,{
    method:"POST",body:JSON.stringify({ref:negativeRef,inputs:{task_id:"not_an_approved_task"}})
  });
  console.log("OGE34_DISPATCH_WRITE_CANARY_HTTP="+probe.status);
  const disposition=classifyDispatchProbe(probe.status);
  console.log("OGE34_DISPATCH_SCOPE="+disposition);
  if(disposition!=="AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN") {
    throw new Error("STAGING_SECRET_NOT_CHANGED_"+disposition);
  }
  if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID){
    throw new Error("CLOUDFLARE_STAGING_CREDENTIALS_MISSING");
  }
  const put=spawnSync("npx",["--yes","wrangler","secret","put","GITHUB_TOKEN","--name",WORKER],{
    input:token,encoding:"utf8",env:process.env,timeout:140000,maxBuffer:2097152
  });
  if(put.status!==0)throw new Error("CLOUDFLARE_STAGING_SECRET_PUT_FAILED_EXIT_"+String(put.status));
  console.log("OGE34_STAGING_WORKER_GITHUB_TOKEN_BINDING=UPDATED");
  const health=await fetch(WAVE+"/api/health",{redirect:"error",signal:AbortSignal.timeout(15000)});
  const hb=await responseJson(health);
  if(health.status!==200||hb.ok!==true)throw new Error("STAGING_HEALTH_FAILED_"+health.status);
  console.log("OGE34_STAGING_HEALTH=PASS");
  await verifyOwnerRead();
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error("::error::"+String(e.message||e).slice(0,240));process.exitCode=1;});
}
