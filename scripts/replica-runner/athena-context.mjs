/**
 * WAVE / OGE-95 Athena Runner: rebuildable execution-context cache.
 * No LLM, no credentials persisted, no D1 writes and no automatic deploy.
 * GitHub is evidence; Yellow remains execution authority; Ruby verifies.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const EXPECTED_REPO="Ogenicchocolate21debug/Build-Platform";
const EXPECTED_BRANCH="phase-vi-provider-incentive-metering";
const sha256=(data)=>createHash("sha256").update(data).digest("hex");
const s=(v,n=160)=>String(v??"").replace(/[\r\n\t]/g," ").trim().slice(0,n);
const hash40=(v)=>/^[0-9a-f]{40}$/i.test(v||"");
const validRun=(x)=>x && Number.isSafeInteger(x.id) && x.id>0 && hash40(x.head_sha);
const safeRun=(v)=>({
  id:v.id,
  workflow:s(v.name,120),
  sha:v.head_sha,
  status:["queued","in_progress","completed","waiting","pending","requested"].includes(v.status)?v.status:"unknown",
  conclusion:["success","failure","cancelled","skipped","timed_out","action_required","neutral",null].includes(v.conclusion)?v.conclusion:null,
  created_at:s(v.created_at,32),
  url:`https://github.com/${EXPECTED_REPO}/actions/runs/${v.id}`
});

export function deriveAthenaContext(input) {
  const source_sha=s(input.source_sha,64);
  if(!hash40(source_sha)) throw new Error("ATHENA_CURRENT_SHA_REQUIRED");
  if(input.repository!==EXPECTED_REPO || input.branch!==EXPECTED_BRANCH) throw new Error("ATHENA_STAGING_SCOPE_REQUIRED");
  const raw=Array.isArray(input.runs)?input.runs:[];
  const recent=raw.filter(validRun).map(safeRun).sort((a,b)=>b.id-a.id).slice(0,40);
  const byId=new Map();
  for(const run of recent) if(!byId.has(run.id))byId.set(run.id,run);
  const seen=new Set();
  const history=[...byId.values()].filter(v=>{
    const key=[v.workflow,v.sha,v.conclusion??v.status].join(":");
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,25);
  const previous=input.previous?.schema_version==="OGE95_ATHENA_RUNNER_CONTEXT_V1" &&
    input.previous?.repository===EXPECTED_REPO && input.previous?.branch===EXPECTED_BRANCH
    ? input.previous:null;
  const prevObs=Array.isArray(previous?.historical_receipts)?previous.historical_receipts:[];
  const historicalReceipts=[...history.filter(x=>x.status==="completed"),...prevObs]
    .filter(x=>x && Number.isSafeInteger(x.id) && hash40(x.sha))
    .filter((x,i,arr)=>arr.findIndex(v=>v.id===x.id)===i).slice(0,40)
    .map(x=>({id:x.id,workflow:s(x.workflow,120),sha:x.sha,conclusion:s(x.conclusion,30),url:`https://github.com/${EXPECTED_REPO}/actions/runs/${x.id}`}));
  const latest=(needle,okOnly=false)=>recent.find(x=>x.workflow.includes(needle)&&x.status==="completed"&&(!okOnly||x.conclusion==="success"))??null;
  const local=input.local_proof&&typeof input.local_proof==="object"?input.local_proof:null;
  const local_sha=local?.source_sha;
  const localOk=local?.status==="LOCAL_PROOF_PASS" && local_sha===source_sha;
  const surface=local?.staging_comparison??null;
  const surfaceCount=Number(surface?.tests_total||0);
  const matched=Number(surface?.tests_matched||0);
  const surfaceRatio=surfaceCount>0&&matched>=0&&matched<=surfaceCount?matched/surfaceCount:null;
  const priorMatch=previous?.source_sha===source_sha&&previous?.local_runtime?.status==="LOCAL_PROOF_PASS";
  const latestDeploy=latest("Provider Incentive Staging Deploy",true);
  const latestCi=latest("WAVE Phase II Canonical Check");
  const recentFailure=recent.find(x=>x.status==="completed"&&x.conclusion==="failure")??null;
  const suggestions=[];
  if(!localOk){
    suggestions.push({action:"INSPECT_OR_RETRY_REPLICA",reason:local?.status==="LOCAL_PROOF_FAIL"?"CURRENT_SHA_LOCAL_PROOF_FAILED":"CURRENT_SHA_LOCAL_PROOF_NOT_VERIFIED",authority:"GITHUB_RUNNER",auto_execute:false});
  }else if(surfaceRatio===null){
    suggestions.push({action:"INSPECT_REPLICA_STAGING_COMPARE",reason:"NO_VALID_CURRENT_SHA_COMPARISON",authority:"GITHUB_RUNNER",auto_execute:false});
  }else if(surfaceRatio<0.9){
    suggestions.push({action:"DIAGNOSE_STAGING_SURFACE_MISMATCH",reason:`MATCHED_${matched}_OF_${surfaceCount}`,authority:"CODEX_REPO_SINGLE_WRITER",auto_execute:false});
  }else{
    suggestions.push({action:"EXPAND_STATEFUL_1LSS_PARITY_AND_RUBY_VERIFY",reason:"CURRENT_SHA_PUBLIC_SURFACE_PASSED_NOT_FULL_1_TO_1",authority:"YELLOW_AND_RUBY",auto_execute:false});
  }
  if(latestDeploy && latestDeploy.sha!==source_sha){
    suggestions.push({action:"REVIEW_STAGING_DEPLOY_SHA_GAP",reason:"DEPLOYED_HEAD_DIFFERS_FROM_REPLICA_TEST_SHA",authority:"EXISTING_PROTECTED_STAGING_WORKFLOW",auto_execute:false});
  }
  return {
    schema_version:"OGE95_ATHENA_RUNNER_CONTEXT_V1",
    kind:"REBUILDABLE_EVIDENCE_CACHE_NOT_CANONICAL_MEMORY",
    repository:EXPECTED_REPO, branch:EXPECTED_BRANCH, source_sha,
    run_id:Number(input.run_id)||null,
    context_id:sha256([EXPECTED_REPO,source_sha,input.run_id||0].join(":")),
    canonical:{conversation:"owner-main",session_line:"1LSS_OWNER_MAIN",state_owner:"CLOUDFLARE_D1",executor_authority:"YELLOW_STONE",verification:"RUBY"},
    linked_systems:{
      github:{state:"GITHUB_API_LIVE_OR_EXPLICIT_UNKNOWN",source:"actions.recent_runs_and_exact_commit"},
      cloudflare_staging:{url:"https://wave.ogenicchocolate.com",proof_source:"GITHUB_DEPLOY_WORKFLOW_AND_PUBLIC_ROUTE_COMPARE",real_deploy_state:"NOT_DIRECTLY_QUERIED"},
      linear:{issue:"OGE-95",url:"https://linear.app/ogenic-sio/issue/OGE-95/wave-replica-runner-091-ephemeral-virtual-runner-local-d1-workerd",state:"REFERENCE_ONLY_NOT_QUERIED"},
      n8n:{state:"NOT_QUERIED_IN_REPLICA",control_authority:false}
    },
    git:{commits:(input.commits||[]).slice(0,12).map(x=>({sha:s(x.sha,40),subject:s(x.subject,150)})).filter(x=>hash40(x.sha)),files:(input.files||[]).slice(0,12)},
    actions:{latest_canonical_check:latestCi,latest_staging_deploy:latestDeploy,latest_failure:recentFailure,recent_runs:history},
    local_runtime:{
      status:localOk?"LOCAL_PROOF_PASS":local?.status==="LOCAL_PROOF_PASS"?"STALE_SHA_LOCAL_PROOF":local?.status||"NOT_MEASURED_CURRENT_SHA",
      previous_same_sha_proof:!!priorMatch,
      checks_passed:Number(local?.local_checks_passed||0),
      checks_total:Number(local?.local_checks_total||0),
      surface_tested:surfaceCount,surface_matched:matched,
      public_surface_match_ratio:surfaceRatio,
      full_runtime_parity_certified:false
    },
    prior_cache_source:previous?.context_id??null,
    historical_receipts:historicalReceipts,
    suggested_actions:suggestions,
    safeguards:{
      repository_write:"CODEX_SINGLE_WRITER",auto_deploy:false,
      remote_d1_read:false,remote_d1_write:false,
      provider_api_calls:0,secret_values_recorded:false
    }
  };
}

function gitLog(){
  try{
    const data=execFileSync("git",["log","-n","12","--format=%H%x09%s"],{encoding:"utf8",timeout:5000});
    return data.trim().split("\n").map(x=>{const [sha,...message]=x.split("\t");return {sha,subject:message.join(" ")};});
  }catch{return [];}
}
async function githubRuns(repo,token,branch){
  if(!token)return {runs:[],state:"NO_GITHUB_TOKEN"};
  try{
    const response=await fetch(`https://api.github.com/repos/${repo}/actions/runs?branch=${branch}&per_page=45`,{
      headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28"},
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)return {runs:[],state:"GITHUB_API_HTTP_"+response.status};
    const json=await response.json();
    return {runs:Array.isArray(json.workflow_runs)?json.workflow_runs:[],state:"GITHUB_API_LIVE"};
  }catch{return {runs:[],state:"GITHUB_API_UNAVAILABLE"};}
}

async function main(){
  const repository=process.env.GITHUB_REPOSITORY||EXPECTED_REPO;
  const branch=process.env.GITHUB_REF_NAME||EXPECTED_BRANCH;
  const source_sha=process.env.GITHUB_SHA||null;
  const run_id=process.env.GITHUB_RUN_ID||null;
  let previous=null;
  const prevPath=process.env.ATHENA_PREVIOUS_CONTEXT||"athena-previous-context.json";
  if(existsSync(prevPath)){
    try{previous=JSON.parse(readFileSync(prevPath,"utf8"));}catch{}
  }
  const localPath="replica-evidence.json";
  let local_proof=null;
  if(existsSync(localPath)){
    try{local_proof=JSON.parse(readFileSync(localPath,"utf8"));}catch{}
  }
  const api=await githubRuns(repository,process.env.GH_TOKEN,branch);
  const paths=["config/oge95-rules-center.json","infra/replica-runner/replica-manifest.json","AGENTS.md"];
  const files=paths.filter(p=>existsSync(p)).map(path=>({
    path,sha256:sha256(readFileSync(path)),role:"SOURCE_FINGERPRINT_NOT_COPY"
  }));
  const data=deriveAthenaContext({repository,branch,source_sha,run_id,
    runs:api.runs,previous,local_proof,commits:gitLog(),files});
  data.github_api_state=api.state;
  data.generated_at=new Date().toISOString();
  writeFileSync("athena-runner-context.json",JSON.stringify(data,null,2)+"\n");
  console.log(JSON.stringify({
    status:"ATHENA_CONTEXT_CREATED",git_state:api.state,sha:source_sha.slice(0,12),
    commits:data.git.commits.length,runs:data.actions.recent_runs.length,
    cached_prev:!!previous,local:data.local_runtime.status,
    next:data.suggested_actions.map(x=>x.action),
    artifact:"athena-runner-context.json"
  }));
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href)
  main().catch(error=>{console.error("ATHENA_CONTEXT_ERROR:"+s(error?.message,120));process.exitCode=1;});
