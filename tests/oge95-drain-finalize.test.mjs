import test from "node:test";
import assert from "node:assert/strict";
import {plan,receipt,BOOTSTRAP} from "../scripts/oge95-commit-drain.mjs";
import {classifyCommitDrain,FINAL_SCHEMA} from "../scripts/oge95-drain-finalize.mjs";
const sha=n=>n.toString(16).padStart(40,"0");
const make=(seq,head=sha(5),base=BOOTSTRAP)=> {
 const p=plan({base,head,commits:seq.map(x=>x.sha)});
 return receipt(p.batch.length===seq.length?p:plan({base,head,commits:seq.map(x=>x.sha)}),seq);
};
test("historical FAILs stay in immutable evidence but a fully verified current HEAD is green",()=>{
 const head=sha(5);
 const p=plan({base:BOOTSTRAP,head,commits:[sha(2),sha(3),sha(4),head]});
 const record=receipt(p,[{sha:sha(2),status:"PASS"},{sha:sha(3),status:"FAIL"},
 {sha:sha(4),status:"FAIL"},{sha:head,status:"PASS"}]);
 const outcome=classifyCommitDrain({head,receipts:[record]});
 assert.equal(outcome.schema,FINAL_SCHEMA);
 assert.equal(outcome.current_head_healthy,true);
 assert.equal(outcome.latest_head_status,"PASS");
 assert.equal(outcome.historical_failed_shas.length,2);
 assert.equal(outcome.newly_passed_count,2);
 assert.equal(outcome.historical_results_rewritten,false);
 assert.equal(outcome.authority_to_commit,false);
});
test("latest HEAD failure remains red regardless of older PASS",()=>{
 const head=sha(4),p=plan({base:BOOTSTRAP,head,commits:[sha(2),sha(3),head]});
 const r=receipt(p,[{sha:sha(2),status:"PASS"},{sha:sha(3),status:"PASS"},{sha:head,status:"FAIL"}]);
 const out=classifyCommitDrain({head,receipts:[r]});
 assert.equal(out.current_head_healthy,false);
 assert.equal(out.state,"CURRENT_HEAD_FAIL");
 assert.deepEqual(out.latest_head_failure,{sha:head,status:"FAIL"});
});
test("fail closed for blocked past commits, even if current head passes",()=>{
 const head=sha(3),p=plan({base:BOOTSTRAP,head,commits:[sha(2),head]});
 const r=receipt(p,[{sha:sha(2),status:"BLOCKED"},{sha:head,status:"PASS"}]);
 const x=classifyCommitDrain({head,receipts:[r]});
 assert.equal(x.state,"BLOCKED_HISTORY_NEEDS_RETRY");
 assert.equal(x.current_head_healthy,false);
});
test("multiple chained batches and valid prior cursor do not skip or count failed twice",()=>{
 const prior=receipt(plan({base:BOOTSTRAP,head:sha(2),commits:[sha(2)]}),[{sha:sha(2),status:"PASS"}]);
 const first=receipt(plan({base:sha(2),head:sha(5),commits:[sha(3),sha(4),sha(5)],limit:2}),
 [{sha:sha(3),status:"FAIL"},{sha:sha(4),status:"PASS"}]);
 const second=receipt(plan({base:sha(4),head:sha(5),commits:[sha(5)]}),[{sha:sha(5),status:"PASS"}]);
 const x=classifyCommitDrain({head:sha(5),receipts:[first,second],prior});
 assert.equal(x.newly_audited_count,3);
 assert.deepEqual(x.historical_failed_shas,[sha(3)]);
 assert.equal(x.carried_forward_checkpoint,sha(2));
 assert.equal(x.current_head_healthy,true);
 for(const receipts of [[second,first],[first,first],[first],[]])
  assert.throws(()=>classifyCommitDrain({head:sha(5),receipts,prior}));
});
test("no pending commits inherit last authenticated SHA proof rather than create fake PASS",()=>{
 const head=sha(3);
 const old=receipt(plan({base:BOOTSTRAP,head,commits:[sha(2),head]}),
  [{sha:sha(2),status:"FAIL"},{sha:head,status:"PASS"}]);
 const empty=receipt(plan({base:head,head,commits:[]}),[]);
 const result=classifyCommitDrain({head,receipts:[empty],prior:old});
 assert.equal(result.newly_audited_count,0);
 assert.equal(result.current_head_healthy,true);
 const fakePrior={...old,checked:[{sha:sha(2),status:"FAIL"}]};
 assert.throws(()=>classifyCommitDrain({head,receipts:[empty],prior:fakePrior}));
 assert.throws(()=>classifyCommitDrain({head,receipts:[empty]}));
});
