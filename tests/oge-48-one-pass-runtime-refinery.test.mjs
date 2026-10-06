import test from "node:test";
import assert from "node:assert/strict";
import { buildOnePassPlan } from "../scripts/one-pass-runtime-refinery.mjs";

const task = "Investigate a reproducible build failure and distill a verified reusable rule.";

test("OGE-48 locks one-pass/no-loop policy", () => {
  const plan = buildOnePassPlan({
    task,
    task_id: "oge-48-policy",
    worker: "codex",
    research_provider: "perplexity",
    research_readiness: "NOT_MEASURED",
  });

  assert.equal(plan.policy.think_budget, 1);
  assert.equal(plan.policy.attempt_budget, 1);
  assert.equal(plan.policy.verify_budget, 1);
  assert.equal(plan.policy.auto_retry, false);
  assert.equal(plan.policy.self_repair, false);
  assert.equal(plan.policy.auto_strategy_switch, false);
  assert.equal(plan.policy.provider_fallback, "DENIED_WITHIN_ATTEMPT");
  assert.equal(plan.policy.canonical_write, "SERIAL_REDUCER_YELLOW_ONLY");
  assert.equal(plan.policy.green_retention, "RUBY_VERIFIED_ONLY");
});

test("unverified Perplexity defers without fallback or Docker execution", () => {
  const plan = buildOnePassPlan({
    task,
    task_id: "oge-48-perplexity",
    worker: "linearcodex",
    research_provider: "perplexity",
    research_readiness: "NOT_MEASURED",
  });

  assert.equal(plan.state, "DEFERRED");
  assert.equal(plan.provider_call_allowed, false);
  assert.equal(plan.hitl_queue, true);
  assert.equal(plan.blocker.provider, "perplexity");
  assert.equal(plan.blocker.retry_allowed, false);
  assert.equal(plan.blocker.strategy_switch_allowed, false);
  assert.equal(plan.stages.research, "DEFERRED");
  assert.equal(plan.stages.docker, "WAITING_FOR_RESEARCH_EVIDENCE");
});

test("same task without new evidence does not allow another model call", () => {
  const first = buildOnePassPlan({
    task,
    task_id: "oge-48-dedupe",
    worker: "codex",
    research_provider: "perplexity",
    research_readiness: "VERIFIED",
  });
  const second = buildOnePassPlan({
    task,
    task_id: "oge-48-dedupe",
    worker: "codex",
    research_provider: "perplexity",
    research_readiness: "VERIFIED",
    previous_task_fingerprint: first.task_fingerprint,
    new_evidence: false,
  });

  assert.equal(second.state, "WAITING_FOR_NEW_EVIDENCE");
  assert.equal(second.provider_call_allowed, false);
  assert.equal(second.stages.violet, "NO_REDISPATCH");
  assert.equal(second.stages.docker, "SKIPPED");
});

test("verified research provider gets one research attempt, then waits for evidence", () => {
  const plan = buildOnePassPlan({
    task,
    task_id: "oge-48-ready",
    worker: "claude",
    research_provider: "perplexity",
    research_readiness: "VERIFIED",
  });

  assert.equal(plan.state, "READY_FOR_RESEARCH_RUN_ONCE");
  assert.equal(plan.provider_call_allowed, true);
  assert.equal(plan.stages.research, "RUN_ONCE");
  assert.equal(plan.stages.docker, "WAITING_FOR_RESEARCH_EVIDENCE");
  assert.equal(plan.stages.ruby, "VERIFY_ONCE_AFTER_DOCKER");
  assert.equal(plan.stages.green, "RETAIN_ONLY_AFTER_RUBY_PASS");
});

test("research evidence advances exactly to Docker run-once", () => {
  const plan = buildOnePassPlan({
    task,
    task_id: "oge-48-evidence",
    worker: "codex",
    research_provider: "perplexity",
    research_readiness: "VERIFIED",
    research_evidence_ref: "evidence/perplexity-result.json",
  });

  assert.equal(plan.state, "READY_FOR_DOCKER_RUN_ONCE");
  assert.equal(plan.provider_call_allowed, false);
  assert.equal(plan.stages.research, "DONE_EVIDENCE_PRESENT");
  assert.equal(plan.stages.docker, "RUN_ONCE");
  assert.equal(plan.stages.refinery, "DISTILL_ONLY_AFTER_RUBY_PASS");
});
