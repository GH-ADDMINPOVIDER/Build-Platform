import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {auditClosure} from "../scripts/oge112-check-closure.mjs";
const catalog=JSON.parse(fs.readFileSync(new URL("../config/pstack-task-taxonomy.json",import.meta.url),"utf8"));
const sha="a".repeat(40),link=s=>"https://github.com/Wave-Runner-2/Build-Platform/"+s;
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"oge112-"));
 const dir=path.join(root,"docs/evidence/OGE-112");fs.mkdirSync(dir,{recursive:true});
 return {root,dir,clean:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function good(){return {issue_id:"OGE-112",closeout_state:"READY_FOR_RUBY_REVIEW",task_category:"DEBUG",
 pstack_numbers:[1,9,24,36],pstack_refs:[1,9,24,36].map(n=>({number:n,id:catalog.skills[n-1].id,sha256:catalog.skills[n-1].sha256})),
 implementer:{agent_id:"codex",proof_url:link("actions/runs/1")},reviewer:{agent_id:"ruby",proof_url:link("actions/runs/2")},
 committer:{agent_id:"github",proof_url:link("commit/"+sha)},deployer:{agent_id:"cloudflare",proof_url:link("actions/runs/3")},
 commit_sha:sha,commit_url:link("commit/"+sha),ci_run_url:link("actions/runs/1"),deploy_run_url:link("actions/runs/3"),
 ruby_proof_url:link("actions/runs/2"),ci_source_sha:sha,deploy_source_sha:sha,ruby_source_sha:sha,
 ruby_verdict:"PASS",root_cause_or_reason:"Reproduction matches source",omitted_step_review:"Confirmed all ordered steps"}}
function install(dir,doc=good()){
 fs.writeFileSync(path.join(dir,"closure.svg"),'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
 fs.writeFileSync(path.join(dir,"README.md"),["RESULT","CHANGED","TESTS","EVIDENCE","RESIDUAL RISK","ROOT CAUSE / MISSED STEPS"].map(x=>"## "+x+"\nEvidence").join("\n"));
 fs.writeFileSync(path.join(dir,"closure.json"),JSON.stringify(doc));
}
test("missing diagram and provenance block closure",()=>{const f=fixture();try{
 const v=auditClosure(f.root,"OGE-112",catalog);assert.equal(v.ok,false);
 assert.ok(v.errors.includes("MISSING_CIRCUIT_VISUAL"))}finally{f.clean()}});
test("number 1,9,24,36 requires exact hashes plus independent reviewers",()=>{const f=fixture();try{
 install(f.dir);let r=auditClosure(f.root,"OGE-112",catalog);
 assert.equal(r.ok,true,r.errors.join(";"));
 assert.equal(r.external_proof_authenticated,false);assert.equal(r.linear_status_changed,false);
 const bad=good();bad.pstack_refs[2].sha256="b".repeat(64);install(f.dir,bad);
 assert.ok(auditClosure(f.root,"OGE-112",catalog).errors.includes("PSTACK_MISMATCH:24"));
 bad.pstack_refs[2].sha256=catalog.skills[23].sha256;bad.reviewer.agent_id="codex";install(f.dir,bad);
 assert.ok(auditClosure(f.root,"OGE-112",catalog).errors.includes("INDEPENDENT_REVIEW_REQUIRED"))
 }finally{f.clean()}});
test("selected pstack category and all CI/deploy/Ruby source SHAs must match",()=>{const f=fixture();try{
 const bad=good();install(f.dir,bad);assert.equal(auditClosure(f.root,"OGE-112",catalog).ok,true);
 bad.task_category="DEPLOY";install(f.dir,bad);assert.ok(auditClosure(f.root,"OGE-112",catalog).errors.includes("PSTACK_CATEGORY_MISMATCH"));
 bad.task_category="DEBUG";bad.deploy_source_sha="b".repeat(40);install(f.dir,bad);
 assert.ok(auditClosure(f.root,"OGE-112",catalog).errors.includes("SOURCE_SHA_MISMATCH:deploy_source_sha"));
 }finally{f.clean()}});
test("independent Ruby, truthy SVG, no fabricated Done",()=>{const f=fixture();try{
 const bad=good();bad.ruby_verdict="PENDING";install(f.dir,bad);
 assert.ok(auditClosure(f.root,"OGE-112",catalog).errors.includes("RUBY_VERDICT_PENDING"));
 bad.ruby_verdict="PASS";install(f.dir,bad);fs.writeFileSync(path.join(f.dir,"closure.svg"),'<svg><script/></svg>');
 assert.ok(auditClosure(f.root,"OGE-112",catalog).errors.includes("INVALID_SVG"))
 }finally{f.clean()}});
test("GitHub closure package gate runs on staging evidence pushes and manual dispatch, not fake Linear automation",()=>{
 const t=fs.readFileSync(new URL("../.github/workflows/oge112-closure-evidence-gate.yml",import.meta.url),"utf8");
 assert.match(t,/workflow_dispatch/);assert.match(t,/node scripts\/oge112-check-closure\.mjs/);
 assert.match(t,/github.sha/);assert.match(t,/push:/);assert.match(t,/docs\/evidence\/OGE-\*/);assert.doesNotMatch(t,/linear.issue.done/i)
});
