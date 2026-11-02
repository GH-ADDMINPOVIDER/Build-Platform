// OGE-95 — bounded staging first-parent catch-up index.
// Every SHA is accounted for by ancestry; only the latest checkout receives npm check.
// An indexed historical SHA is NEVER claimed to have passed test or received an agent fix.
import {execFileSync} from "node:child_process";
import {writeFileSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
export const REPO="GH-ADDMINPOVIDER/Build-Platform";
export const BRANCH="Unified-on-Progress";
export const BOOTSTRAP="9be0a339016ebf23a3a5f4108aaab56af19bd93a";
const SHA=/^[0-9a-f]{40}$/;
const git=(...args)=>String(execFileSync("git",args,{encoding:"utf8",timeout:45000,maxBuffer:8*1024*1024})).trim();
export function buildCatchupLedger({head,bootstrap=BOOTSTRAP,commits}){
 if(!SHA.test(head)||!SHA.test(bootstrap)||!Array.isArray(commits)||
   commits.some(x=>!SHA.test(x))||new Set(commits).size!==commits.length||
   (commits.length ? commits.at(-1)!==head : head!==bootstrap))throw Error("INVALID_HEAD_OR_CHAIN");
 return {
  schema:"OGE95_FAST_CATCHUP_V1", repository:REPO,branch:BRANCH,
  bootstrap_sha:bootstrap,head_sha:head,commit_count:commits.length,
  indexed_commits:commits,
  historical_status:"INDEXED_NOT_RETESTED_OR_AUTO_FIXED",
  current_head_status:"PENDING_EXACT_SHA_TEST",
  full_history_indexed:true,no_commits_skipped_in_supplied_chain:true,
  issue_execution_dispatched:false,agent_paid_calls:0,
  authorization:"YELLOW_STONE_ONLY",no_production_or_d1_change:true,
 };
}
export function summarizeCatchup(ledger,headResult){
 if(ledger?.schema!=="OGE95_FAST_CATCHUP_V1"||!SHA.test(ledger.head_sha)||
   !["PASS","FAIL","BLOCKED"].includes(headResult))throw Error("INVALID_RESULT");
 return {...ledger,current_head_status:headResult,
  backlog_status:headResult==="PASS"?"LATEST_SOURCE_CHECKED":"LATEST_SOURCE_NOT_VERIFIED",
  all_historical_tests_passed:false,older_oge_issues_completed:false,
  safe_to_close_oge100:false};
}
function run(){
 if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF_NAME!==BRANCH)
  throw Error("CANONICAL_STAGING_ONLY");
 const head=git("rev-parse","HEAD");
 if(!SHA.test(head))throw Error("UNVERIFIED_HEAD");
 git("cat-file","-e",bootstrapRef());
 try{git("merge-base","--is-ancestor",BOOTSTRAP,head);}
 catch{throw Error("NON_FAST_FORWARD_STOP");}
 const commits=BOOTSTRAP===head?[]:git("rev-list","--reverse","--first-parent",BOOTSTRAP+".."+head).split("\n").filter(Boolean);
 const ledger=buildCatchupLedger({head,commits});
 const mode=process.argv[2]||"index";
 if(mode==="index"){
  writeFileSync("oge95-fast-catchup-index.json",JSON.stringify(ledger,null,2)+"\n");
  console.log("OGE95_FAST_INDEX "+JSON.stringify({sha:head,indexed:commits.length,latest_test:"PENDING",no_agent_dispatch:true}));
 }else if(mode==="finalize"){
  const prior=JSON.parse(readFileSync("oge95-fast-catchup-index.json","utf8"));
  if(prior.head_sha!==head)throw Error("CHECKOUT_CHANGED_DURING_AUDIT");
  const result=summarizeCatchup(prior,process.env.OGE95_HEAD_RESULT||"BLOCKED");
  writeFileSync("oge95-fast-catchup-receipt.json",JSON.stringify(result,null,2)+"\n");
  console.log("OGE95_FAST_FINAL "+JSON.stringify({sha:head,count:result.commit_count,status:result.current_head_status,issues_done:false}));
 }else throw Error("EXPECTED_INDEX_OR_FINALIZE");
}
function bootstrapRef(){return BOOTSTRAP+"^{commit}"}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))run();
