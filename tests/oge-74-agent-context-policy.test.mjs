import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = JSON.parse(readFileSync("config/agent-context-policy.json", "utf8"));
const helper = readFileSync("worker/agent-context-policy.ts", "utf8");
const planner = readFileSync("worker/athena-command-planner.ts", "utf8");
const gemini = readFileSync("worker/gemini-api.ts", "utf8");
const deepseek = readFileSync("worker/deepseek-api.ts", "utf8");
const perplexity = readFileSync("worker/perplexity-agent-api.ts", "utf8");
const xai = readFileSync("worker/xai-api.ts", "utf8");
const meta = readFileSync("worker/meta-model-api.ts", "utf8");
const execution = readFileSync("worker/capability-execution-api.ts", "utf8");

test("OGE-74 defines bounded context and owner retry cap", () => {
  assert.equal(policy.scope, "ALL_AGENTS_ALL_PROVIDERS");
  assert.equal(policy.hard_rules.full_conversation_replay, false);
  assert.equal(policy.hard_rules.hidden_retry, false);
  assert.equal(policy.hard_rules.hidden_provider_fallback, false);
  assert.equal(policy.execution_control.retry_cap_per_same_blocker, 3);
  assert.equal(policy.execution_control.after_retry_cap, "BLOCK_AND_REASSIGN_IDLE_AGENTS");
  assert.equal(policy.execution_control.large_token_work, "PAUSE_COMPRESS_HANDOFF");
});

test("OGE-74 uses one shared runtime helper", () => {
  assert.match(helper, /boundedReadPrompt/);
  assert.match(helper, /dedupeEvidenceRefs/);
  assert.match(helper, /compactResultContract/);
  for (const source of [planner, gemini, deepseek, perplexity, xai, meta, execution]) {
    assert.match(source, /agent-context-policy/);
  }
});

test("OGE-74 preserves Perplexity continuation and one-pass behavior", () => {
  assert.match(perplexity, /previous_response_id/);
  assert.match(perplexity, /store: false/);
  assert.match(perplexity, /maxRetries: 0/);
});

test("OGE-74 applies bounded READ prompts to all current external model adapters", () => {
  for (const source of [gemini, deepseek, perplexity, xai, meta, execution]) {
    assert.match(source, /boundedReadPrompt/);
  }
});

test("OGE-74 keeps compact four-field result contract", () => {
  assert.deepEqual(policy.result_contract.format, ["RESULT", "EVIDENCE", "BLOCKED", "NEXT"]);
  assert.equal(policy.result_contract.retain_raw_provider_output, false);
  assert.equal(policy.result_contract.retain_verified_summary, true);
});
