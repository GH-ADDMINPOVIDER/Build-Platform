import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load-ts.mjs";

const state = await loadTs("worker/canonical-state.ts");

const artifact={
  artifactId:"a1",contentHash:"sha256:x",summary:"verified summary",
  provenance:{kind:"provider",sourceRef:"provider:run:1",providerSessionRef:"session:1"},
  verification:{state:"PASS",verifier:"RUBY",evidenceRefs:["e1"]},
  terminalTrustOwner:"owner-main"
};

test("unverified artifacts cannot promote to Green", () => {
  assert.equal(state.evaluateGreenPromotion({...artifact,verification:{...artifact.verification,state:"FAIL"}}).ok,false);
  assert.equal(state.evaluateGreenPromotion({...artifact,verification:{...artifact.verification,verifier:"OTHER"}}).code,"RUBY_VERIFIER_REQUIRED");
  assert.equal(state.evaluateGreenPromotion(artifact).ok,true);
});

test("compact handoff preserves provenance without full transcript", () => {
  const compact=state.compactHandoff({...artifact,summary:"x".repeat(5000)});
  assert.equal(compact.provenance.sourceRef,"provider:run:1");
  assert.equal(compact.summary.length,2400);
  assert.equal("content" in compact,false);
});

test("canonical state wins over provider projection and deletion claims stay conservative", () => {
  assert.deepEqual(state.reconcileCanonical({v:"green"},{v:"provider"}).value,{v:"green"});
  assert.equal(state.deletionReceipt({canonicalConfirmed:true,projectionConfirmed:true,auditDispositionConfirmed:true,providerConfirmed:false}).complete,false);
});
