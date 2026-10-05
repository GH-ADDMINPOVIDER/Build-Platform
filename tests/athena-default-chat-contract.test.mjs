import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("default WAVE text chat routes through ATHENA while attachments keep the existing model lane", async () => {
  const entry = await read("worker/entry-connectors.ts");
  assert.match(entry, /createAthenaChatApi/);
  assert.match(entry, /pathname === "\/api\/chat\/model" && await defaultWaveTextOnly/);
  assert.match(entry, /url\.pathname = "\/api\/chat\/athena"/);
  assert.match(entry, /attachment_ids/);
  assert.match(entry, /attachments\.length === 0/);
  assert.match(entry, /return chatModelApi\.fetch\(canonicalRequest/);
});

test("ATHENA reuses exactly the OGE-32 verified private tool registry and never auto-enables hosted search", async () => {
  const api = await read("worker/athena-chat-api.ts");
  const verified = await read("worker/verified-function-tools.ts");
  assert.match(api, /verifiedFunctionTools/);
  assert.match(api, /executeVerifiedTool/);
  assert.match(api, /tools: verifiedFunctionTools/);
  assert.match(api, /exact_private_tool_count: verifiedFunctionTools\.length/);
  assert.equal((verified.match(/type: "function", name:/g) ?? []).length, 7);
  assert.doesNotMatch(api, /type: "web_search"/);
  assert.doesNotMatch(api, /type: "file_search"/);
  assert.doesNotMatch(api, /vector_store_ids/);
});

test("ATHENA has bounded tool rounds, canonical 1LSS context, and fail-closed execution authority", async () => {
  const api = await read("worker/athena-chat-api.ts");
  assert.match(api, /for \(let round = 0; round < 4/);
  assert.match(api, /type: "function_call_output"/);
  assert.match(api, /CONVERSATION_ID = "owner-main"/);
  assert.match(api, /SESSION_LINE = "1LSS_OWNER_MAIN"/);
  assert.match(api, /ATHENA_ACTOR_ID = "athena-command"/);
  assert.match(api, /COMMANDER_CANDIDATE/);
  assert.match(api, /YELLOW_STONE_ONLY/);
  assert.match(api, /Never execute writes from this lane/);
  assert.match(api, /Fresh GitHub or Linear verification/i);
});

test("ATHENA uses per-round idempotency and stamps verified tool evidence back through the existing 1LSS path", async () => {
  const api = await read("worker/athena-chat-api.ts");
  const entry = await read("worker/entry-connectors.ts");
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /:round:\$\{round\}/);
  assert.match(api, /verified_tool_calls/);
  assert.match(entry, /stampFunctionTurn\(stampRequest, response, env\)/);
  assert.match(entry, /\[TOOL \$\{name\}\] \$\{state\}/);
  assert.match(entry, /appendOneLine\(env, "assistant"/);
});
