import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BOOTSTRAP,BRANCH,REPO,buildCatchupLedger,summarizeCatchup} from "../scripts/oge95-fast-catchup.mjs";
const sha=i=>i.toString(16).padStart(40,"0");
test("indexes all first-parent commits even if there are hundreds; no fake tests",()=>{
 const commits=Array.from({length:401},(_,i)=>sha(i+2));
 const l=buildCatchupLedger({head:commits.at(-1),bootstrap:sha(1),commits});
 assert.equal(l.commit_count,401);
 assert.equal(l.indexed_commits[400],commits.at(-1));
 assert.equal(l.historical_status,"INDEXED_NOT_RETESTED_OR_AUTO_FIXED");
 assert.equal(l.issue_execution_dispatched,false);
 assert.equal(l.agent_paid_calls,0);
 const out=summarizeCatchup(l,"PASS");
 assert.equal(out.current_head_status,"PASS");
 assert.equal(out.all_historical_tests_passed,false);
 assert.equal(out.older_oge_issues_completed,false);
 assert.equal(out.safe_to_close_oge100,false);
});
test("rejects stale, repeated and truncated HEAD instead of counting it as drained",()=>{
 const valid=[sha(2),sha(3)];
 for(const c of [[sha(2),sha(2)],[sha(2)],[sha(3),sha(2)]])
 assert.throws(()=>buildCatchupLedger({head:sha(3),bootstrap:sha(1),commits:c}));
 assert.throws(()=>buildCatchupLedger({head:"bad",bootstrap:sha(1),commits:valid}));
});
test("strict fail result preserves unverified state",()=>{
 const l=buildCatchupLedger({head:sha(2),bootstrap:sha(1),commits:[sha(2)]});
 assert.equal(summarizeCatchup(l,"FAIL").backlog_status,"LATEST_SOURCE_NOT_VERIFIED");
 assert.equal(summarizeCatchup(l,"BLOCKED").backlog_status,"LATEST_SOURCE_NOT_VERIFIED");
 assert.throws(()=>summarizeCatchup(l,"DONE"));
});
test("push catchup is Unifiend self-hosted, latest-only and supersedes stale runs",()=>{
 const wf=readFileSync(".github/workflows/oge95-auto-head-catchup.yml","utf8");
 assert.match(wf,/push:\s*\n\s*branches: \[Unified-on-Progress\]/);
 assert.match(wf,/runs-on: \[self-hosted, linux, x64, wave\]/);
 assert.match(wf,/cancel-in-progress: true/);
 assert.match(wf,/ref: Unified-on-Progress/);
 assert.match(wf,/fetch-depth: 0/);
 assert.match(wf,/scripts\/oge95-fast-catchup.mjs index/);
 assert.match(wf,/npm run check/);
 assert.doesNotMatch(wf,/runs-on: ubuntu-latest/);
 const parent=readFileSync(".github/workflows/oge-95-final-review-intake.yml","utf8");
 assert.doesNotMatch(parent,/^\s*push:\s*$/m);
 assert.match(parent,/workflow_dispatch:/);
});
test("canonical immutable branch and bootstrap still preserved",()=>{
 assert.equal(BRANCH,"Unified-on-Progress");
 assert.equal(REPO,"Wave-Runner-2/Build-Platform");
 assert.match(BOOTSTRAP,/^[a-f0-9]{40}$/);
});
