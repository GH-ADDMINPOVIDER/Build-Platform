import test from "node:test";
import assert from "node:assert/strict";
import {SCHEMA,REPO,BRANCH,BOOTSTRAP,MAX_BATCH,plan,receipt,checkpoint} from "../scripts/oge95-commit-drain.mjs";
const sha=n=>n.toString(16).padStart(40,"0");
test("staging only, no other repo/branch or code promotion",()=>{
 assert.equal(REPO,"Ogenicchocolate21debug/Build-Platform");
 assert.equal(BRANCH,"phase-vi-provider-incentive-metering");
 assert.match(BOOTSTRAP,/^[0-9a-f]{40}$/);
 assert.equal(MAX_BATCH,6);
});
test("fifty commits queue in first-parent order, 6 per batch, never skip a SHA",()=>{
 let pending=Array.from({length:50},(_,i)=>sha(i+2)),base=sha(1),head=pending.at(-1),batches=0;
 const observed=[];
 while(pending.length){
  const p=plan({base,head,commits:pending});
  assert.equal(p.no_paid_calls,true);
  assert.equal(p.allows_code_push,false);
  assert.equal(p.allows_deploy,false);
  const checks=p.batch.map(id=>({sha:id,status:"PASS",stage:"npm_run_check"}));
  const r=receipt(p,checks,"test-"+batches);
  observed.push(...r.checked.map(x=>x.sha));
  base=checkpoint(r);
  pending=pending.slice(p.batch.length);
  batches++;
 }
 assert.deepEqual(observed,Array.from({length:50},(_,i)=>sha(i+2)));
 assert.equal(batches,9);
 assert.equal(base,head);
});
test("a failing commit remains in evidence and later SHAs still proceed",()=>{
 const p=plan({base:sha(1),head:sha(4),commits:[sha(2),sha(3),sha(4)]});
 const r=receipt(p,p.batch.map((id,i)=>({sha:id,status:i===1?"FAIL":"PASS",stage:"npm_run_check"})));
 assert.deepEqual(r.failed_shas,[sha(3)]);
 assert.equal(r.last_processed_sha,sha(4));
 assert.equal(r.needs_continuation,false);
 assert.equal(r.allows_code_push,false);
});
test("empty branch backlog does not dispatch forever",()=>{
 const p=plan({base:sha(9),head:sha(9),commits:[]});
 const r=receipt(p,[]);
 assert.equal(r.needs_continuation,false);
 assert.equal(r.last_processed_sha,sha(9));
});
test("reject malformed checkpoints and altered receipts",()=>{
 const p=plan({base:sha(1),head:sha(2),commits:[sha(2)]});
 const r=receipt(p,[{sha:sha(2),status:"PASS"}]);
 for(const changed of [
  {...r,branch:"main"},
  {...r,last_processed_sha:sha(9)},
  {...r,checked:[{sha:sha(2),status:"DONE"}]},
  {...r,checked:[{sha:sha(2),status:"PASS"}, {sha:sha(2),status:"PASS"}]}
 ])assert.throws(()=>checkpoint(changed));
 assert.throws(()=>receipt(p,[]));
 assert.throws(()=>plan({base:sha(1),head:sha(3),commits:[sha(2)]}));
 assert.throws(()=>plan({base:sha(1),head:sha(2),commits:[sha(2),sha(2)]}));
 assert.throws(()=>plan({base:sha(1),head:sha(2),commits:[sha(2)],limit:100}));
});
