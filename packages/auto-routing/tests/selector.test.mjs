import test from "node:test";
import assert from "node:assert/strict";
import { selectAutoRoute } from "../dist/index.js";

const base = {
  provider_id: "provider-a",
  capability_id: "code.read",
  environment: "staging",
  permission_class: "READ",
  readiness: "VERIFIED",
  cost_state: "INCLUDED",
  capsig: {
    generated_by: "RUBY_STONE",
    self_scored: false,
    dimension: "CODE_BUILDER",
    state: "MEASURED",
    score: 90,
    sample_size: 10,
    evidence_refs: ["ruby:evidence:1"],
  },
};

const request = {
  capability_id: "code.read",
  environment: "staging",
  permission_class: "READ",
  dimension: "CODE_BUILDER",
};

test("highest Ruby-evidence score wins among eligible routes", () => {
  const decision = selectAutoRoute([
    { ...base, agent_id: "agent-b", capsig: { ...base.capsig, score: 88 } },
    { ...base, agent_id: "agent-a", capsig: { ...base.capsig, score: 94 } },
  ], request);
  assert.equal(decision.state, "SELECTED");
  assert.equal(decision.candidate.agent_id, "agent-a");
  assert.equal(decision.execution_authority, "YELLOW_STONE_ONLY");
  assert.equal(decision.direct_execution_bypass, false);
});

test("environment capability readiness and permission mismatches are filtered", () => {
  const candidates = [
    { ...base, agent_id: "wrong-env", environment: "production" },
    { ...base, agent_id: "wrong-cap", capability_id: "deploy.write" },
    { ...base, agent_id: "degraded", readiness: "DEGRADED" },
    { ...base, agent_id: "wrong-permission", permission_class: "WRITE" },
  ];
  const decision = selectAutoRoute(candidates, request);
  assert.equal(decision.state, "NO_ELIGIBLE_ROUTE");
  assert.equal(decision.provider_fallback, "DENIED");
});

test("blocked exhausted and unmeasured cost fail closed by default", () => {
  for (const cost_state of ["BLOCKED", "EXHAUSTED", "NOT_MEASURED"]) {
    const decision = selectAutoRoute([{ ...base, agent_id: cost_state.toLowerCase(), cost_state }], request);
    assert.equal(decision.state, "NO_ELIGIBLE_ROUTE");
  }
});

test("model name alone cannot make an unmeasured candidate eligible", () => {
  const decision = selectAutoRoute([{
    ...base,
    agent_id: "famous-model",
    model_name: "best-model-ever",
    capsig: { ...base.capsig, state: "NOT_MEASURED", score: null, sample_size: 0, evidence_refs: [] },
  }], request);
  assert.equal(decision.state, "NO_ELIGIBLE_ROUTE");
});

test("tie-break is score then sample then cost then stable agent id", () => {
  const decision = selectAutoRoute([
    { ...base, agent_id: "z-agent", cost_state: "ZERO_COST", capsig: { ...base.capsig, score: 90, sample_size: 12 } },
    { ...base, agent_id: "a-agent", cost_state: "ZERO_COST", capsig: { ...base.capsig, score: 90, sample_size: 12 } },
    { ...base, agent_id: "b-agent", cost_state: "METERED", capsig: { ...base.capsig, score: 90, sample_size: 12 } },
  ], request);
  assert.equal(decision.state, "SELECTED");
  assert.equal(decision.candidate.agent_id, "a-agent");
});

test("consequential permission stays approval gated even after selection", () => {
  const writeCandidate = {
    ...base,
    agent_id: "writer",
    capability_id: "repo.write",
    permission_class: "WRITE",
  };
  const decision = selectAutoRoute([writeCandidate], {
    capability_id: "repo.write",
    environment: "staging",
    permission_class: "WRITE",
    dimension: "CODE_BUILDER",
  });
  assert.equal(decision.state, "SELECTED");
  assert.equal(decision.approval_required, true);
  assert.equal(decision.execution_authority, "YELLOW_STONE_ONLY");
});
