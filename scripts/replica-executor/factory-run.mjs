#!/usr/bin/env node
// One deterministic station in the OGE-95 factory, no arbitrary code execution.
import { readFileSync, writeFileSync } from "node:fs";
import { planFactoryOrder, auditFactorySource, receiveDeepSeekResearch, factoryReceipt, STAGING_BRANCH } from "./factory-core.mjs";

const args=process.argv.slice(2);
const flags={};
for(let i=0;i<args.length;i+=2) {
  const flag=args[i];
  if(!flag?.startsWith("--") || !args[i+1]) throw new Error("INVALID_FACTORY_FLAGS");
  flags[flag.slice(2)] = args[i+1];
}
const operation=flags.operation || "replica_source_audit";
const order=planFactoryOrder({
  task_id:flags.task || "OGE-95-github-factory-proof",
  operation,
  branch:process.env.GITHUB_REF_NAME || STAGING_BRANCH,
  source_sha:process.env.GITHUB_SHA || "0000000000000000000000000000000000000000",
  requires_paid_inference:false,
  deploy_requested:false,
  limits:{max_minutes:10,max_artifact_bytes:65536}
});
let result={ok:false,code:"ORDER_REJECTED"};
if(order.ok && operation==="replica_source_audit")result=auditFactorySource(order);
if(order.ok && operation==="deepseek_research_ingest") {
  try {
    if(!flags.input || !/^[-./a-zA-Z0-9_]+$/.test(flags.input)) throw new Error("INPUT_PATH_REQUIRED");
    const data=JSON.parse(readFileSync(flags.input,"utf8"));
    result=receiveDeepSeekResearch(data,{
      run_id:flags["source-run-id"]||"0",
      source_sha:flags["source-sha"]||order.source_sha
    });
  } catch { result={ok:false,code:"RESEARCH_ARTIFACT_UNAVAILABLE",ruby_verification:"NOT_VERIFIED"}; }
}
const receipt=factoryReceipt(order,result);
writeFileSync(flags.out||"oge95-factory-receipt.json",JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({
  factory:receipt.status,operation,job_id:receipt.job_id,
  received_unverified_research:result.ok===true && operation==="deepseek_research_ingest",
  ruby_verification:"PENDING",stage_summary:receipt.stages.map(s=>s.stage+":"+s.state),
  evidence:flags.out||"oge95-factory-receipt.json"
}));
if(receipt.status!=="EVIDENCE_READY")process.exitCode=2;
