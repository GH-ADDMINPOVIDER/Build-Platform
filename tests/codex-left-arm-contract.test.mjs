import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../worker/codex-left-arm-api.ts", import.meta.url), "utf8");
const entry = await readFile(new URL("../worker/entry-yellow-stone.ts", import.meta.url), "utf8");

test("Codex left arm exposes four stable control contracts", () => {
  assert.match(api, /codex_selfhost_status/);
  assert.match(api, /codex_dispatch/);
  assert.match(api, /codex_run_status/);
  assert.match(api, /codex_result/);
  assert.match(entry, /createCodexLeftArmApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/codex\/"\)/);
});

test("dispatch is staging locked and fail closed behind Yellow Stone approval", () => {
  assert.match(api, /phase-vi-provider-incentive-metering/);
  assert.match(api, /Wave-Runner-2\/Build-Platform/);
  assert.match(api, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(api, /YELLOW_STONE_OGE_26/);
  assert.match(api, /FAIL_CLOSED_UNTIL_EXACT_APPROVAL_BINDING_IS_VERIFIED/);
});

test("dispatch requires scope, paths, acceptance criteria and idempotency", () => {
  for (const field of ["work_scope", "allowed_paths", "acceptance_criteria", "idempotency_key"]) {
    assert.match(api, new RegExp(field));
  }
  assert.match(api, /SENSITIVE_PATH|sensitivePath/);
  assert.match(api, /SECRET_LIKE_INPUT_REJECTED/);
  assert.match(api, /correlation_id = \?/);
  assert.match(api, /IDEMPOTENT_REPLAY/);
});

test("executor environment key stays distinct from broad application key", () => {
  assert.match(api, /OPENAI_EXECUTOR_API_KEY/);
  assert.match(api, /OPENAI_ENVIRONMENT_KEY/);
  assert.match(api, /DO_NOT_SUBSTITUTE_OPENAI_API_KEY/);
  assert.match(api, /openai_application/);
  assert.match(api, /openai_executor_environment/);
});

test("status and result reuse existing D1 agent state without schema changes", () => {
  assert.match(api, /FROM agent_tasks/);
  assert.match(api, /FROM agent_locks/);
  assert.match(api, /FROM agent_events/);
  assert.match(api, /FROM agent_checkpoints/);
  assert.match(api, /FROM chat_messages/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("contracts never expose private SSH or provider key values", () => {
  assert.doesNotMatch(api, /private_key\s*:/i);
  assert.doesNotMatch(api, /ssh_private/i);
  assert.match(api, /NO_SECRET_OUTPUT/);
  assert.match(api, /SANITIZED_REFERENCES_ONLY/);
});
