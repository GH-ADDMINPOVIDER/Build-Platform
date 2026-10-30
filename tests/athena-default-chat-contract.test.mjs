import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("default Unifiend text chat routes through ATHENA while attachments keep the existing model lane", async () => {
  const entry = await read("worker/entry-connectors.ts");
  assert.match(entry, /createAthenaChatApi/);
  assert.match(entry, /pathname === "\/api\/chat\/model" && await defaultUnifiendTextOnly/);
  assert.match(entry, /url\.pathname = "\/api\/chat\/athena"/);
  assert.match(entry, /attachment_ids/);
  assert.match(entry, /attachments\.length === 0/);
  assert.match(entry, /chatModelApi\.fetch\(canonicalRequest/);
  assert.match(entry, /const failedOutput = typeof result\?\.text === "string"/);
  assert.match(entry, /SAVED_WITH_FAILURE/);
  assert.match(entry, /suppliedRequestKey \|\| pathname !==/);
  assert.match(entry, /return await dispatchAndFinishTurn\(/);
  assert.match(entry, /async function dispatchAndFinishTurn/);
  assert.match(entry, /return finishTurnWithReceipt\(request, response, env, prepared\)/);
  assert.match(entry, /UNHANDLED_CHAT_HANDLER_ERROR/);
  assert.match(entry, /prepareTurnBeforeExecution\(request, env, pathname\)/);
  assert.match(entry, /memory_persistence: receipt/);
  assert.match(entry, /X-OGENIC-1LSS-PERSISTENCE/);
});

test("ATHENA reuses exactly the OGE-32 verified private tool registry and never auto-enables hosted search", async () => {
  const api = await read("worker/athena-chat-api.ts");
  const verified = await read("worker/verified-function-tools.ts");
  assert.match(api, /verifiedFunctionTools/);
  assert.match(api, /executeVerifiedTool/);
  assert.match(api, /requestBody\.tools = verifiedFunctionTools/);
  assert.match(api, /exact_private_tool_count: verifiedFunctionTools\.length/);
  assert.equal((verified.match(/type: "function", name:/g) ?? []).length, 8);
  const workflow = await read(".github/workflows/oge-34-athena-default-chat-proof.yml");
  assert.match(workflow, /\.blue_diamond\.exact_private_tool_count == 8/);
  assert.match(verified, /certificate_lincenc_status/);
  assert.match(api, /NOT Vercel SSL\/TLS Certs API/);
  assert.doesNotMatch(api, /type: "web_search"/);
  assert.doesNotMatch(api, /type: "file_search"/);
  assert.doesNotMatch(api, /vector_store_ids/);
});

test("ATHENA has bounded tool rounds, canonical 1LSS context, and fail-closed execution authority", async () => {
  const api = await read("worker/athena-chat-api.ts");
  assert.match(api, /MAX_TOOL_ROUNDS = 4/);
  assert.match(api, /for \(let round = 0; round <= MAX_TOOL_ROUNDS/);
  assert.match(api, /const canCallTools = round < MAX_TOOL_ROUNDS/);
  assert.match(api, /if \(canCallTools\)/);
  assert.match(api, /requestBody\.tools = verifiedFunctionTools/);
  assert.match(api, /type: "function_call_output"/);
  assert.match(api, /if \(!canCallTools\)/);
  assert.match(api, /CONVERSATION_ID = "owner-main"/);
  assert.match(api, /SESSION_LINE = "1LSS_OWNER_MAIN"/);
  assert.match(api, /ATHENA_ACTOR_ID = "athena-command"/);
  assert.match(api, /COMMANDER_CANDIDATE/);
  assert.match(api, /YELLOW_STONE_ONLY/);
  assert.match(api, /eight auto-called verification tools are READ ONLY/);
  assert.match(api, /Unifiend Chat supports \/OG.RUN/);
  assert.match(api, /Fresh GitHub or Linear verification/i);
});

test("ATHENA uses per-round idempotency and stamps verified tool evidence back through the existing 1LSS path", async () => {
  const api = await read("worker/athena-chat-api.ts");
  const entry = await read("worker/entry-connectors.ts");
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /:round:\$\{round\}/);
  assert.match(api, /verified_tool_calls/);
  assert.match(entry, /await stampFunctionTurn\(request\.clone\(\), response, env\)/);
  assert.match(entry, /\[TOOL \$\{name\}\] \$\{state\}/);
  assert.match(entry, /appendOneLine\(env, "assistant"/);
  assert.match(entry, /\[TURN_FAILURE\]/);
  assert.match(entry, /PERSISTENCE_WRITE_FAILED/);
  assert.match(entry, /redactOneLineContent\(content\)/);
  assert.doesNotMatch(entry, /stampFunctionTurn\(stampRequest, response, env\)\.catch\(\(\) => undefined\)/);
});

test("verified private reads surface rejected provider credentials as REAUTH_REQUIRED instead of generic failure", async () => {
  const verified = await read("worker/verified-function-tools.ts");
  assert.match(verified, /status === 401 \|\| status === 403/);
  assert.match(verified, /code: "REAUTH_REQUIRED"/);
  assert.match(verified, /refresh the server-side credential before fresh verification/);
  assert.match(verified, /verified: false/);
  assert.match(verified, /read_only: true/);
});
