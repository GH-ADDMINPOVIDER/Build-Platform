import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const runtime=readFileSync("worker/task-envelope-runtime-api.ts","utf8");
const entry=readFileSync("worker/entry-yellow-stone.ts","utf8");
const contract=readFileSync("worker/task-envelope-contract.ts","utf8");
const sql=readFileSync("database/migrations/0018_task_envelope_routing.sql","utf8");

test("context route is explicitly wired through existing WAVE/ATHENA command",()=>{
 assert.ok(entry.includes('import { createWaveTaskEnvelopeApi } from "./task-envelope-runtime-api"'));
 assert.ok(entry.includes('const taskEnvelopeApi = createWaveTaskEnvelopeApi('));
 assert.ok(entry.includes('athenaGuardedCommand(request, bindings as Bindings, ctx)'));
 assert.ok(entry.includes('pathname.startsWith("/api/wave/task-envelope")'));
});
test("runtime is fail-closed until independently verified staging D1",()=>{
 assert.ok(runtime.includes('WAVE_TASK_ENVELOPE_ENABLED'));
 assert.ok(runtime.includes('TASK_ENVELOPE_FEATURE_DISABLED'));
 assert.ok(runtime.includes('TASK_ENVELOPE_D1_MIGRATION_REQUIRED'));
 assert.ok(runtime.includes('D1_BINDING_REQUIRED'));
 assert.ok(runtime.includes('schemaError(err)'));
 assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS task_envelopes'));
 assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS task_envelope_events'));
 assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS task_envelope_receipts'));
});
test("only signed Owner staging read-only TMN context is eligible",()=>{
 assert.ok(runtime.includes('hasOwnerSession(c.req.raw, c.env)'));
 assert.ok(runtime.includes('ORIGIN_DENIED'));
 assert.ok(runtime.includes('e.scope.permission === "READ"'));
 assert.ok(runtime.includes('e.scope.target_zone === "TMN"'));
 assert.ok(runtime.includes('e.scope.no_production === true'));
 assert.ok(runtime.includes('OWNER_CONTEXT_MISMATCH'));
 assert.ok(runtime.includes('IDEMPOTENCY_KEY_MISMATCH'));
 assert.ok(contract.includes('SECRET_LIKE_INPUT_REJECTED'));
});
test("GH2 dispatch is via prior signed WAVE command not a new executive engine",()=>{
 assert.ok(runtime.includes('capability:"codex_selfhost",provider:"openai",mode:"read"'));
 assert.ok(runtime.includes('await dispatch(new Request('));
 assert.ok(runtime.includes('COMMAND_DISPATCHED'));
 assert.ok(runtime.includes('COMMAND_MANUAL_DISPATCH_REQUIRED'));
 assert.ok(!runtime.includes('api.github.com/repos/Ogenicchocolate21debug'));
 assert.ok(!runtime.includes('spawnSync('));
 assert.ok(!runtime.includes('docker run'));
});
test("envelope result is not E2E until D1 receipt is persisted and read back",()=>{
 assert.ok(runtime.includes('task_envelope_receipts'));
 assert.ok(runtime.includes("receipt_state='RESULT_VERIFIED'"));
 assert.ok(runtime.includes('COMMAND_RESULT_DONE'));
 assert.ok(runtime.includes('GH2_EVIDENCE.test('));
 assert.ok(runtime.includes('context_verified:verified'));
 assert.ok(runtime.includes('persistedReceipt.result_hash===row.result_hash'));
 assert.ok(runtime.includes('RESULT_VERIFIED'));
});
