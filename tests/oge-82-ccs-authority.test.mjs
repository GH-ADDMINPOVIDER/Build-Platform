import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load-ts.mjs";

const auth = await loadTs("worker/ccs-authority.ts");

const parent={leaseId:"p",parentLeaseId:null,providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",allowedEgress:["https://api.github.com/x"],expiresAt:2000,revoked:false};

test("child lease cannot amplify provider, permission, expiry or egress", () => {
  assert.equal(auth.deriveLease(parent,{leaseId:"c",providerId:"other",capabilityId:"read_file",permission:"READ",environment:"staging",allowedEgress:["https://api.github.com"],expiresAt:1500},1000).ok,false);
  assert.equal(auth.deriveLease(parent,{leaseId:"c",providerId:"github",capabilityId:"read_file",permission:"WRITE",environment:"staging",allowedEgress:["https://api.github.com"],expiresAt:1500},1000).code,"PERMISSION_ESCALATION_DENIED");
  assert.equal(auth.deriveLease(parent,{leaseId:"c",providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",allowedEgress:["https://evil.example"],expiresAt:1500},1000).code,"EGRESS_ESCALATION_DENIED");
});

test("revocation propagates and cached invocation is denied", () => {
  const child=auth.deriveLease(parent,{leaseId:"c",providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",allowedEgress:["https://api.github.com"],expiresAt:1500},1000).lease;
  const revoked=auth.revokeLease(parent);
  const leases=new Map([["p",revoked],["c",child]]);
  assert.equal(auth.authorizeInvocation({lease:child,leases,providerId:"github",capabilityId:"read_file",permission:"READ",environment:"staging",egressUrl:"https://api.github.com/repos/x",now:1100}).code,"LEASE_REVOKED");
});

test("credential metadata remains broker-reference only", () => {
  assert.equal(auth.brokeredCredentialReference("vault://github/staging"),true);
  assert.equal(auth.brokeredCredentialReference("plain-value"),false);
  assert.deepEqual(auth.safePublicAuthorityMetadata({provider:"github",secret:"x",access_token:"y"}),{provider:"github"});
});
