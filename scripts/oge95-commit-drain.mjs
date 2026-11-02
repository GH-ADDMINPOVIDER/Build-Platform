// OGE-95 commit drain. Audit every first-parent staging commit without a paid AI call.
// A failed commit is recorded as FAIL, never silently "fixed" or marked DONE.
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,readFileSync,writeFileSync,appendFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
export const SCHEMA="OGE95_GITHUB_COMMIT_DRAIN_V2";
export const REPO="GH-ADDMINPOVIDER/Build-Platform";
export const BRANCH="Unified-on-Progress";
export const BOOTSTRAP="9be0a339016ebf23a3a5f4108aaab56af19bd93a";
export const MAX_BATCH=6;
const SHA=/^[a-f0-9]{40}$/i;
const git=(args,opts={})=>String(execFileSync("git",args,{encoding:"utf8",timeout:30000,maxBuffer:4194304,...opts})).trim();
export function plan({base,head,commits,limit=MAX_BATCH}){
 if(!SHA.test(base||"")||!SHA.test(head||"")||!Array.isArray(commits)||
    !Number.isInteger(limit)||limit<1||limit>MAX_BATCH)throw Error("INVALID_PLAN");
 if(commits.some(x=>!SHA.test(x||""))||new Set(commits).size!==commits.length||
   commits.includes(base)||(head===base&&commits.length)||(head!==base&&commits.at(-1)!==head))
    throw Error("INVALID_LINEAGE");
 return {schema:SCHEMA,repository:REPO,branch:BRANCH,base_sha:base,head_sha:head,
   pending:commits.length,batch:commits.slice(0,limit),remaining:Math.max(0,commits.length-limit),
   no_paid_calls:true,allows_code_push:false,allows_deploy:false};
}
export function checkpoint(receipt){
 if(receipt?.schema!==SCHEMA||receipt.repository!==REPO||receipt.branch!==BRANCH||
   !SHA.test(receipt.last_processed_sha||"")||!SHA.test(receipt.head_sha||"")||
   !Array.isArray(receipt.checked)||receipt.checked.length>MAX_BATCH||
   new Set(receipt.checked.map(x=>x.sha)).size!==receipt.checked.length||
   receipt.checked.some(x=>!SHA.test(x.sha||"")||!["PASS","FAIL","BLOCKED"].includes(x.status))||
   (receipt.checked.length&&receipt.checked.at(-1).sha!==receipt.last_processed_sha))
   throw Error("INVALID_PREVIOUS_RECEIPT");
 return receipt.last_processed_sha;
}
export function receipt(p,checked,runId="unknown"){
 if(p?.schema!==SCHEMA||!Array.isArray(checked)||checked.length!==p.batch.length||
   checked.some((x,i)=>x.sha!==p.batch[i]||!["PASS","FAIL","BLOCKED"].includes(x.status)))
   throw Error("INVALID_BATCH_RECEIPT");
 const last=checked.at(-1)?.sha||p.base_sha;
 return {schema:SCHEMA,repository:REPO,branch:BRANCH,run_id:String(runId),
   prior_checkpoint:p.base_sha,head_sha:p.head_sha,last_processed_sha:last,
   pending_at_start:p.pending,remaining_at_plan:p.remaining,
   checked,dependency_install_method:"CANONICAL_NPM_PACKAGE_LOCK_ONLY_THEN_NPM_CI",
   failed_shas:checked.filter(x=>x.status!=="PASS").map(x=>x.sha),
   needs_continuation:last!==p.head_sha,
   no_paid_calls:true,allows_code_push:false,allows_deploy:false,
   message:"Audited, not automatically repaired. Failed SHAs need separately authorized agent review."};
}
const bareEnv=()=>({
 PATH:process.env.PATH||"/usr/bin:/bin",
 HOME:process.env.RUNNER_TEMP||tmpdir(),
 CI:"true",NO_COLOR:"1",
 npm_config_cache:join(process.env.RUNNER_TEMP||tmpdir(),"ogenic-npm-cache")
});
function buildPlan(){
 if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF_NAME!==BRANCH)
   throw Error("STAGING_ONLY");
 const head=git(["rev-parse","refs/remotes/origin/"+BRANCH]);
 const filename=process.argv.find(x=>x.startsWith("--previous="))?.slice(11);
 const base=filename?checkpoint(JSON.parse(readFileSync(filename,"utf8"))):BOOTSTRAP;
 try{git(["cat-file","-e",base+"^{commit}"]);}
 catch{throw Error("CHECKPOINT_MISSING_STOP_NOT_SKIP");}
 try{git(["merge-base","--is-ancestor",base,head]);}
 catch{throw Error("NON_FAST_FORWARD_STOP_NOT_SKIP");}
 const commits=base===head?[]:git(["rev-list","--reverse","--first-parent",base+".."+head]).split("\n").filter(Boolean);
 const p=plan({base,head,commits});
 writeFileSync("oge95-commit-drain-plan.json",JSON.stringify(p,null,2)+"\n");
 console.log("OGE95_DRAIN_PLAN "+JSON.stringify({base,head,total:commits.length,batch:p.batch.length}));
}
function execute(){
 const p=JSON.parse(readFileSync("oge95-commit-drain-plan.json","utf8"));
 if(p.schema!==SCHEMA||p.repository!==REPO||p.branch!==BRANCH||
    !Array.isArray(p.batch)||p.batch.length>MAX_BATCH)throw Error("BAD_PLAN");
 const root=mkdtempSync(join(process.env.RUNNER_TEMP||tmpdir(),"ogenic-commit-drain-"));
 const checked=[];
 try{
  for(const sha of p.batch){
   if(!SHA.test(sha))throw Error("UNSAFE_SHA");
   const dir=join(root,sha),start=Date.now();
   let status="PASS",stage="npm_run_check",exit_code=0;
   try{
    git(["worktree","add","--detach",dir,sha]);
    const opts={cwd:dir,env:bareEnv(),timeout:240000,encoding:"utf8",
      maxBuffer:1048576,stdio:["ignore","pipe","pipe"]};
    // Match the EXISTING Unifiend Canonical Check workflow in a disposable worktree.
    // The package-lock normalization stays inside the temporary worktree and
    // is never committed back to staging. The receipt records this behavior.
    stage="npm_lock_normalization";
    execFileSync("npm",["install","--package-lock-only","--no-audit","--no-fund"],opts);
    stage="npm_ci";
    execFileSync("npm",["ci","--no-audit","--no-fund"],opts);
    stage="npm_run_check";
    execFileSync("npm",["run","check"],opts);
   }catch(e){
    const stderr=String(e?.stderr||"");
    const reason=/EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENOTFOUND|network/i.test(stderr)
      ? "NETWORK_UNAVAILABLE" : /EUSAGE|package-lock|out of sync/i.test(stderr)
      ? "LOCKFILE_MISMATCH" : /ENOMEM|heap out of memory/i.test(stderr)
      ? "RESOURCE_EXHAUSTED" : "COMMAND_FAILED";
    status=reason==="NETWORK_UNAVAILABLE"||reason==="RESOURCE_EXHAUSTED"?"BLOCKED":"FAIL";
    exit_code=Number.isInteger(e?.status)?e.status:1;
    console.error("OGE95_NPM_CHECK_FAILURE "+JSON.stringify({sha,stage,reason,exit_code}));
   }finally{
    try{git(["worktree","remove","--force",dir]);}catch{}
   }
   const item={sha,status,stage,exit_code,seconds:Math.round((Date.now()-start)/1000)};
   checked.push(item);
   console.log("OGE95_COMMIT_CHECK "+JSON.stringify(item));
  }
  const out=receipt(p,checked,process.env.GITHUB_RUN_ID);
  writeFileSync("oge95-commit-drain-receipt.json",JSON.stringify(out,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY){
   const lines=["## OGE-95 staging commit drain",
     "Head: "+out.head_sha,
     "Last tested: "+out.last_processed_sha,
     "Queued after batch: "+out.remaining_at_plan,
     "Failed in batch: "+out.failed_shas.length,
     ...checked.map(x=>x.sha.slice(0,12)+" "+x.status+" "+x.stage),
     "All checked commits have test receipts. NO AI code fix, paid sessions or deployment."];
   appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join("\n")+"\n");
  }
  console.log("OGE95_DRAIN_BATCH_COMPLETE "+JSON.stringify({
   checked:checked.length,failed:out.failed_shas.length,remaining:out.remaining_at_plan
  }));
 }finally{rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv[2]==="plan")buildPlan();
 else if(process.argv[2]==="execute")execute();
 else throw Error("EXPECTED_PLAN_OR_EXECUTE");
}
