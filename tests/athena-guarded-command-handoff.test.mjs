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
  assert.match(execution, /HUMAN_APPROVAL_REQUIRED/);
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
  assert.match(ui, /Owner approval required/);
  assert.match(ui, /No side effect executed/);
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
