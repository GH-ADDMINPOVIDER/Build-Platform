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
  // Check only pre-existing Infisical staging GitHub credential bindings.
  // Select a single token proven for Actions WRITE; never print token bytes,
  // persist test tokens or substitute GitHub Actions' ephemeral github.token.
  const primaryNames=["GITHUB_TOKEN_OGE34","GIBHUB_TOKEN_OGE34","GITHUB_TOKEN",
    "GITHUB_PAT","GITHUB_ACCESS_TOKEN","GH_TOKEN","GH_PAT","WAVE_GITHUB_TOKEN"];
  const discovered=Object.keys(process.env).filter((k) =>
    (/GITHUB/.test(k) && /(?:^|_)(?:TOKEN|PAT|AUTH|CREDENTIAL)(?:_|$)/.test(k)) ||
    /^(GH_TOKEN|GH_PAT)$/.test(k));
  const keys=[...new Set([...primaryNames,...discovered])].filter((k) =>
    Object.prototype.hasOwnProperty.call(process.env,k) && String(process.env[k]||"").length>0
  ).slice(0,24);
  console.log("OGE34_INFISICAL_GITHUB_CANDIDATE_KEYS="+JSON.stringify(keys));
  const seen=new Set();
  const authorized=[];
  for(const key of keys){
    const raw=String(process.env[key]||"");
    const variants=[{type:"EXACT",value:raw}];
    // OGE-40 proved the canonical value contains control characters. Check
    // whether it is merely line-wrapped; do not overwrite Infisical or guess
    // any character other than removable CR/LF whitespace.
    if(!inspectTokenFormat(raw)){
      const trim=raw.trim();
      const unwrapped=raw.replace(/[\r\n]/g,"").trim();
      if(inspectTokenFormat(trim))variants.push({type:"TRIM_OUTER_WHITESPACE",value:trim});
      if(inspectTokenFormat(unwrapped)&&unwrapped!==trim)variants.push({type:"REMOVE_CRLF_LINEBREAKS",value:unwrapped});
    }
    if(variants.every(v=>!inspectTokenFormat(v.value))){
      console.log("OGE34_CANDIDATE_"+key+"=REJECTED_FORMAT");
      continue;
    }
    for(const variant of variants){
      const candidate=variant.value;
      if(!inspectTokenFormat(candidate)||seen.has(candidate))continue;
      seen.add(candidate);
      console.log("::add-mask::"+candidate);
      const label=key+"_"+variant.type;
      const branch=await githubRequest("/branches/"+BRANCH,candidate);
      if(branch.status!==200){
        console.log("OGE34_CANDIDATE_"+label+"_BRANCH_HTTP="+branch.status);
        continue;
      }
      const actions=await githubRequest("/actions/runs?branch="+BRANCH+"&per_page=1",candidate);
      if(actions.status!==200){
        console.log("OGE34_CANDIDATE_"+label+"_ACTIONS_READ_HTTP="+actions.status);
        continue;
      }
      const ref="__OGENIC_UNRESOLVABLE_REF_"+process.env.GITHUB_RUN_ID+"_"+process.env.GITHUB_RUN_ATTEMPT+"__";
      const request=await githubRequest("/actions/workflows/wave-command-consumer.yml/dispatches",candidate,{
        method:"POST",body:JSON.stringify({ref,inputs:{task_id:"not_an_approved_task"}})
      });
      const result=classifyDispatchProbe(request.status);
      console.log("OGE34_CANDIDATE_"+label+"_DISPATCH_HTTP="+request.status);
      console.log("OGE34_CANDIDATE_"+label+"_RESULT="+result);
      const permissionHeader=request.headers.get("x-accepted-github-permissions");
      if(permissionHeader && /^[A-Za-z0-9,=; _-]{1,150}$/.test(permissionHeader)){
        console.log("OGE34_CANDIDATE_"+label+"_REQUIRED_PERMISSION="+permissionHeader);
      }
      if(result==="AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN")authorized.push({key:label,token:candidate});
    }
  }
  if(authorized.length===0)throw new Error("STAGING_SECRET_NOT_CHANGED_ACTIONS_WRITE_DENIED_ALL_EXISTING_GITHUB_CANDIDATES");
  if(authorized.length!==1)throw new Error("STAGING_SECRET_NOT_CHANGED_MULTIPLE_AUTHORIZED_GITHUB_TOKENS_REQUIRE_EXPLICIT_SOURCE");
  const token=authorized[0].token;
  console.log("OGE34_VERIFIED_TOKEN_SOURCE="+authorized[0].key);
  console.log("OGE34_DISPATCH_SCOPE=AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN");
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
