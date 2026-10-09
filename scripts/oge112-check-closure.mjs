import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const issueFormat=/^OGE-[1-9]\d{0,4}$/;
const validEvidenceUrl=v=>typeof v==="string"&&/^https:\/\/(github\.com|linear\.app)\//.test(v);
export function auditClosure(root,issue,catalog){
 const errors=[],bad=s=>errors.push(s);
 if(!issueFormat.test(issue||""))return {ok:false,errors:["INVALID_OGE_ID"]};
 const dir=path.join(root,"docs/evidence",issue);
 const file=n=>fs.existsSync(path.join(dir,n))?fs.readFileSync(path.join(dir,n)):null;
 const md=file("README.md");
 if(!md)bad("MISSING_README");
 else for(const s of ["RESULT","CHANGED","TESTS","EVIDENCE","RESIDUAL RISK","ROOT CAUSE / MISSED STEPS"])
  if(!md.toString().includes("## "+s))bad("MISSING_SECTION:"+s);
 const image=["closure.svg","closure.png","closure.webp"].find(n=>file(n));
 if(!image)bad("MISSING_CIRCUIT_VISUAL");
 else if(image==="closure.svg"){
  const content=file(image).toString();
  if(!/<svg\b/.test(content)||/<script|onload\s*=|onerror\s*=|<foreignObject/i.test(content))bad("INVALID_SVG");
 }else if(!file(image).length)bad("EMPTY_IMAGE");
 const raw=file("closure.json");let doc;
 try{doc=raw?JSON.parse(raw.toString()):null}catch{bad("INVALID_JSON")}
 if(!doc)bad("MISSING_PROVENANCE");
 else{
  if(doc.issue_id!==issue)bad("WRONG_ISSUE");
  if(doc.closeout_state!=="READY_FOR_RUBY_REVIEW")bad("INVALID_CLOSEOUT_STATE");
  if(!catalog.task_categories[doc.task_category])bad("UNKNOWN_CATEGORY");
  if(!Array.isArray(doc.pstack_numbers)||!doc.pstack_numbers.length||
   new Set(doc.pstack_numbers).size!==doc.pstack_numbers.length)bad("MISSING_OR_DUPLICATE_PSTACK");
  else for(const n of doc.pstack_numbers){
   const canonical=catalog.skills[n-1],record=doc.pstack_refs?.find(x=>x.number===n);
   if(!Number.isInteger(n)||!canonical||!record||record.id!==canonical.id||record.sha256!==canonical.sha256)bad("PSTACK_MISMATCH:"+n);
  }
  for(const who of ["implementer","reviewer","committer","deployer"]){
   const person=doc[who];
   if(!person||typeof person.agent_id!=="string"||!person.agent_id.trim()||!validEvidenceUrl(person.proof_url))bad("ACTOR_PROOF_REQUIRED:"+who);
  }
  if(doc.implementer?.agent_id===doc.reviewer?.agent_id)bad("INDEPENDENT_REVIEW_REQUIRED");
  if(!/^[a-f0-9]{40}$/.test(doc.commit_sha||"")||
   typeof doc.commit_url!=="string"||!doc.commit_url.includes(doc.commit_sha))bad("SOURCE_SHA_REQUIRED");
  for(const k of ["ci_run_url","deploy_run_url","ruby_proof_url"])if(!validEvidenceUrl(doc[k]))bad("EVIDENCE_LINK_REQUIRED:"+k);
  if(doc.ruby_verdict!=="PASS")bad("RUBY_VERDICT_PENDING");
  if(!doc.root_cause_or_reason?.trim()||!doc.omitted_step_review?.trim())bad("CAUSE_OR_MISSED_STEP_REPORT_REQUIRED");
 }
 return {ok:errors.length===0,status:errors.length?"BLOCKED":"STRUCTURE_VALID_NEEDS_INDEPENDENT_RUBY_CONFIRMATION",issue,
 visual:image||null,external_proof_authenticated:false,linear_status_changed:false,errors};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const c=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config/pstack-task-taxonomy.json"),"utf8"));
 const x=auditClosure(process.cwd(),process.argv[2],c);
 console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=2;
}
