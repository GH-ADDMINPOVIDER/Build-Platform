import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load-ts.mjs";

const guard = await loadTs("worker/yellow-effect-guard.ts");

test("operation identity is stable across object key order", async () => {
  const a = await guard.operationIdentity({capability:"write",provider:"x",target:"r",scope:"staging",artifactIdentity:"v1",args:{b:2,a:1}});
  const b = await guard.operationIdentity({capability:"write",provider:"x",target:"r",scope:"staging",artifactIdentity:"v1",args:{a:1,b:2}});
  assert.equal(a,b);
});

test("approval drift, expiry and stale resource fail closed", async () => {
  const base={capability:"write",provider:"x",target:"r",scope:"staging",artifactIdentity:"v1",args:{a:1}};
  const approval=await guard.bindApproval({...base,expiresAt:2000,authorizationVersion:"auth-1",resourceVersion:"7"});
  assert.equal((await guard.verifyApprovalForExecution(approval,{...base,now:1000,authorizationVersion:"auth-1",resourceVersion:"7"})).ok,true);
  assert.equal((await guard.verifyApprovalForExecution(approval,{...base,args:{a:2},now:1000,authorizationVersion:"auth-1",resourceVersion:"7"})).code,"APPROVAL_EXECUTION_MISMATCH");
  assert.equal((await guard.verifyApprovalForExecution(approval,{...base,now:2000,authorizationVersion:"auth-1",resourceVersion:"7"})).code,"APPROVAL_EXPIRED");
  assert.equal((await guard.verifyApprovalForExecution(approval,{...base,now:1000,authorizationVersion:"auth-1",resourceVersion:"8"})).code,"RESOURCE_VERSION_CHANGED");
});

test("unknown effect never blind retries and retry budget is bounded", () => {
  assert.equal(guard.retryDecision({outcome:"unknown",failureClass:"ambiguous",attempt:1,budget:3}).retry,false);
  assert.equal(guard.retryDecision({outcome:"not_committed",failureClass:"proven_pre_effect",attempt:1,budget:3}).retry,true);
  assert.equal(guard.retryDecision({outcome:"not_committed",failureClass:"proven_pre_effect",attempt:3,budget:3}).code,"RETRY_BUDGET_EXHAUSTED");
  assert.equal(guard.writeFence("7","8").code,"STALE_WRITER_REJECTED");
});
