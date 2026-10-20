import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("WAVE command enters through ATHENA admission and delegates to Yellow Stone execution authority", () => {
  const entry = read("worker/entry-yellow-stone.ts");
  assert.match(entry, /pathname === "\/api\/wave\/command"/);
  assert.match(entry, /ATHENA_ACTOR_ID = "athena-command"/);
  assert.match(entry, /buildBlueDiamondRegistry\(env\)/);
  assert.match(entry, /hasOwnerOrOpsAccess\(request, env\)/);
  assert.match(entry, /url\.pathname = "\/api\/capabilities\/execute"/);
  assert.match(entry, /executionApi\.fetch\(delegated/);
  assert.match(entry, /execution_authority: EXECUTION_AUTHORITY/);
  assert.match(entry, /direct_execution_bypass: false/);
});

test("guarded command does not implement a second resolver or provider adapter", () => {
  const entry = read("worker/entry-yellow-stone.ts");
  const execution = read("worker/capability-execution-api.ts");
  assert.doesNotMatch(entry, /resolveCapability\(/);
  assert.doesNotMatch(entry, /api\.github\.com/);
  assert.match(execution, /resolveCapability\(request, candidates\)/);
  assert.match(execution, /descriptor\.permission_class !== "READ"/);
  assert.match(execution, /NO_IMPLEMENTED_NON_READ_ADAPTER/);
  assert.match(execution, /ADAPTER_NOT_IMPLEMENTED/);
});

test("OGE-34 default ATHENA chat remains the exact seven-tool READ-only lane", () => {
  const chat = read("worker/athena-chat-api.ts");
  const entry = read("worker/entry-connectors.ts");
  assert.match(chat, /exactly seven private function tools/i);
  assert.match(chat, /permission_class: "READ"/);
  assert.match(chat, /exact_private_tool_count: verifiedFunctionTools\.length/);
  assert.match(entry, /defaultWaveTextOnly/);
  assert.match(entry, /athenaChatApi\.fetch/);
  assert.doesNotMatch(chat, /\/api\/wave\/command/);
});

test("WAVE Run surface invokes guarded command and renders precise approval or verification state", () => {
  const ui = read("src/WaveNext.tsx");
  assert.match(ui, /fetch\("\/api\/wave\/command"/);
  assert.match(ui, /Run guarded command/);
  assert.match(ui, /Signed Owner Session/);
  assert.match(ui, /commandResult.code === "ADAPTER_NOT_IMPLEMENTED"/);
  assert.match(ui, /Optional GitHub file path for verified READ/);
  assert.match(ui, /capability = "read_file"/);
  assert.match(ui, /provider = "github"/);
});

test("guarded command preserves canonical 1LSS through existing Yellow Stone evidence path", () => {
  const execution = read("worker/capability-execution-api.ts");
  assert.match(execution, /CANONICAL_CONVERSATION = "owner-main"/);
  assert.match(execution, /CANONICAL_SESSION_LINE = "1LSS_OWNER_MAIN"/);
  assert.match(execution, /YELLOW_STONE VERIFIED READ/);
  assert.match(execution, /SECRET_LIKE_CONTENT_REJECTED/);
});


test("signed Owner Session submits a staging command with no second confirmation", () => {
  const entry = read("worker/entry-yellow-stone.ts");
  const ui = read("src/UnifiedChat.tsx");
  const auth = read("worker/app-auth.ts");
  assert.match(entry, /hasOwnerSession\(request, env\)/);
  assert.match(entry, /ORIGIN_DENIED/);
  assert.doesNotMatch(entry, /code: "OWNER_APPROVAL_REQUIRED"/);
  assert.doesNotMatch(entry, /code: "APPROVAL_PLAN_MISMATCH"/);
  assert.match(entry, /OWNER_APPROVED_COMMAND_QUEUED/);
  assert.match(entry, /authorization: "SIGNED_OWNER_SESSION"/);
  assert.match(entry, /INSERT INTO agent_tasks/);
  assert.match(entry, /consumer_proven:\s*false/);
  assert.match(auth, /validSignedToken/);
  assert.match(ui, /WAVE Command/);
  assert.doesNotMatch(ui, /confirmWaveCommand/);
  assert.match(ui, /รอ Runner-1 และ COMMAND_RESULT/);
});

test("chat command routes arbitrary owner text to the bounded Codex self-host queue contract", () => {
  const entry = read("worker/entry-yellow-stone.ts");
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /capability:\s*"codex_selfhost"/);
  assert.match(ui, /provider:\s*"openai"/);
  assert.match(entry, /YELLOW_STONE_CODEX_SELFHOST/);
  assert.match(entry, /completion requires COMMAND_RESULT event/);
});


test("approved Codex command dispatches Runner-1 consumer and records terminal evidence", () => {
  const entry = read("worker/entry-yellow-stone.ts");
  const dispatch = read("worker/wave-command-dispatch.ts");
  const workflow = read(".github/workflows/wave-command-consumer.yml");
  const consumer = read("scripts/wave-command-consumer.mjs");
  assert.match(dispatch, /wave-command-consumer\.yml\/dispatches/);
  assert.match(entry, /COMMAND_CONSUMER_STARTED/);
  assert.match(entry, /COMMAND_RESULT_/);
  assert.match(entry, /capability = 'codex_selfhost'/);
  assert.match(workflow, /runs-on: \[self-hosted, linux, x64, wave\]/);
  assert.match(workflow, /Infisical\/secrets-action/);
  assert.match(consumer, /CODEX_HOME/);
  assert.match(consumer, /spawnSync\("codex", \["exec"/);
  assert.match(consumer, /\/api\/wave\/command\/result/);
});

test("WAVE retains claimable Owner task on Actions-write denial with usable manual GH dispatch", () => {
  const src = read("worker/entry-yellow-stone.ts");
  assert.match(src, /COMMAND_MANUAL_DISPATCH_REQUIRED/);
  assert.match(src, /COMMAND_DISPATCH_DEFERRED/);
  assert.match(src, /manualDispatchDetails/);
  assert.doesNotMatch(src, /async function markDispatchFailure/);
  assert.match(src, /workflow_url: MANUAL_WORKFLOW/);
  assert.match(src, /status: "AWAITING_DISPATCH"/);
  assert.match(src, /hasOwnerSession\(request, env\)/);
  assert.match(src, /pathname === "\/api\/wave\/command\/status"/);
  assert.match(src, /event_type LIKE 'COMMAND_RESULT_%'/);
  assert.match(src, /COMMAND_RESULT_DONE/);
  assert.match(src, /request_id: requestId/);
  assert.match(src, /INVALID_IDEMPOTENCY_KEY/);
});
