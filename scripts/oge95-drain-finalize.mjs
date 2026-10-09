// OGE-95: decide current HEAD health without erasing immutable historical FAILs.
// No network, code changes, provider calls, CI dispatch or deployment.
import {readFileSync,writeFileSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {SCHEMA,REPO,BRANCH,BOOTSTRAP,MAX_BATCH,checkpoint} from "./oge95-commit-drain.mjs";
const SHA=/^[a-f0-9]{40}$/i;
export const FINAL_SCHEMA="OGE95_COMMIT_DRAIN_FINAL_V1";
export function classifyCommitDrain({head,receipts,prior=null,bootstrap=BOOTSTRAP}={}){
 if(!SHA.test(head||"")||!SHA.test(bootstrap||"")||!Array.isArray(receipts)||!receipts.length)
  throw Error("INVALID_FINAL_INPUT");
 let cursor=prior?checkpoint(prior):bootstrap;
 let audited=[];
 const seen=new Set();
 for(const batch of receipts){
  if(batch?.schema!==SCHEMA||batch.repository!==REPO||batch.branch!==BRANCH||
   batch.prior_checkpoint!==cursor||batch.head_sha!==head||
   !Array.isArray(batch.checked)||batch.checked.length>MAX_BATCH)
    throw Error("INVALID_FINAL_BATCH_LINEAGE");
  checkpoint(batch);
  for(const item of batch.checked){
    if(seen.has(item.sha))throw Error("DUPLICATE_FINAL_SHA");
    seen.add(item.sha);
    audited.push(item);
  }
  cursor=batch.last_processed_sha;
 }
 if(cursor!==head)throw Error("UNFINISHED_FINAL_HEAD");
 const priorLast=prior?.checked?.at(-1);
 const last=audited.at(-1) || (prior?.last_processed_sha===head?priorLast:null);
 const headVerified=last?.sha===head && ["PASS","FAIL","BLOCKED"].includes(last.status);
 if(!headVerified)throw Error("HEAD_MISSING_VERIFIED_RESULT");
 const historical=audited.filter(x=>x.sha!==head&&x.status!=="PASS");
 const blocked=audited.filter(x=>x.status==="BLOCKED");
 // A historical FAIL remains in the evidence, but the latest successfully
 // checked HEAD supersedes it as a CURRENT source-code defect.
 // A blocked history is not the same as a tested historical failure.
 const state=blocked.length ? "BLOCKED_HISTORY_NEEDS_RETRY":
  last.status==="PASS" ? "CURRENT_HEAD_PASS_WITH_HISTORY_PRESERVED":
  last.status==="BLOCKED" ? "CURRENT_HEAD_BLOCKED":
  "CURRENT_HEAD_FAIL";
 const out={
  schema:FINAL_SCHEMA,repository:REPO,branch:BRANCH,
  head_sha:head,last_processed_sha:cursor,
  latest_head_status:last.status,state,
  current_head_healthy:state==="CURRENT_HEAD_PASS_WITH_HISTORY_PRESERVED",
  newly_audited_count:audited.length,
  newly_passed_count:audited.filter(x=>x.status==="PASS").length,
  historical_failed_shas:historical.filter(x=>x.status==="FAIL").map(x=>x.sha),
  historical_blocked_shas:historical.filter(x=>x.status==="BLOCKED").map(x=>x.sha),
  latest_head_failure: last.status==="PASS"?null:{sha:head,status:last.status},
  carried_forward_checkpoint:prior?.last_processed_sha||null,
  all_commits_accounted_for:true,
  historical_results_rewritten:false,
  automatic_code_fix:false,
  authority_to_commit:false,authority_to_deploy:false,
  note:"Historical FAILs stay immutable. Current HEAD is green only on exact-SHA test PASS; no agent/production approval."
 };
 return out;
}
function cli(){
 const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("=")).map(x=>{
   const i=x.indexOf("=");return [x.slice(2,i),x.slice(i+1)];
 }));
 if(!SHA.test(args.head||"")||!args.dir||!args.output|| !/^[a-z0-9_.-]+\.json$/.test(args.output))
  throw Error("USAGE_--head=SHA_--dir=DIR_--output=FILE");
 const paths=readdirSync(args.dir).filter(x=>/^batch-[1-9][0-9]*\.json$/.test(x))
  .sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
 if(!paths.length)throw Error("MISSING_BATCH_FILES");
 const receipts=paths.map(p=>JSON.parse(readFileSync(join(args.dir,p),"utf8")));
 const prior=args.prior?JSON.parse(readFileSync(args.prior,"utf8")):null;
 const result=classifyCommitDrain({head:args.head,receipts,prior});
 writeFileSync(args.output,JSON.stringify(result,null,2)+"\n");
 console.log("OGE95_COMMIT_DRAIN_FINAL "+JSON.stringify({
   state:result.state,head:result.head_sha,passed:result.newly_passed_count,
   historical_failed:result.historical_failed_shas.length,
   audited:result.newly_audited_count,healthy:result.current_head_healthy
 }));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))cli();
