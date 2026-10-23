// CP-055/060: guarded, additive Task Context -> existing signed WAVE command bridge.
// This endpoint is DISABLED until staging D1 migration 0018 is verified and deployed.
// No new terminal, OpenCode daemon, GH provider, n8n activation, or production action.
import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";
import { validateWaveTaskEnvelope, type WaveTaskEnvelopeV1 } from "./task-envelope-contract";

type Prepared = {
  bind: (...values: unknown[]) => Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type TaskDb = { prepare: (sql: string) => Prepared };
type Env = AuthBindings & { DB?: TaskDb; WAVE_TASK_ENVELOPE_ENABLED?: string };
type HonoEnv = { Bindings: Env };
type Dispatch = (request: Request, env: Env, ctx: unknown) => Promise<Response>;
type TaskState = {
  task_id: string;
  idempotency_key: string;
  context_ref: string;
  context_revision: number;
  execution_state: string;
  command_task_id: string | null;
  result_hash: string | null;
  evidence_ref: string | null;
};
const GATE = "WAVE_TASK_ENVELOPE_ENABLED";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK = /^waveenv_[a-f0-9]{32,128}$/;
const GH2_EVIDENCE = /^https:\/\/github\.com\/Wave-Runner-2\/Build-Platform\/actions\/runs\/\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const COMMAND = /^wavecmd_[a-f0-9]{64}$/;

async function hashText(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function response(code: string, status: 400 | 401 | 403 | 409 | 422 | 503) {
  return Response.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });
}
function isValidReadOnly(e: WaveTaskEnvelopeV1) {
  return e.scope.target_zone === "TMN" && e.scope.permission === "READ"
    && e.scope.environment === "staging" && e.scope.no_production === true
    && e.execution.executor === "TMN" && e.execution.state === "TASK_IN"
    && e.execution.attempt === 0 && e.execution.max_attempts === 1
    && e.fallback.allowed === false
    && (e.fallback.mode === "NO_FALLBACK" || e.fallback.mode === "HOLD_FOR_OWNER");
}
async function task(db: TaskDb, taskId: string) {
  return db.prepare(
    "SELECT task_id,idempotency_key,context_ref,context_revision,execution_state,command_task_id,result_hash,evidence_ref FROM task_envelopes WHERE task_id = ? LIMIT 1",
  ).bind(taskId).first<TaskState>();
}
function schemaError(err: unknown) {
  return /no such table: task_envelopes|no such table: task_envelope_events|no such table: task_envelope_receipts/i.test(String(err));
}
export function createWaveTaskEnvelopeApi(dispatch: Dispatch) {
  const api = new Hono<HonoEnv>();
  api.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ ok:false, code:"ORIGIN_DENIED" },403);
    if (!(await hasOwnerSession(c.req.raw, c.env))) return c.json({ ok:false, code:"REAUTH_REQUIRED" },401);
    await next();
  });
  api.post("/api/wave/task-envelope", async c => {
    if (c.env.WAVE_TASK_ENVELOPE_ENABLED !== "true") return response("TASK_ENVELOPE_FEATURE_DISABLED", 503);
    if (!c.env.DB) return response("D1_BINDING_REQUIRED", 503);
    const json: unknown = await c.req.json().catch(() => null);
    const validated = validateWaveTaskEnvelope(json);
    if (!validated.ok) return c.json({ ok:false, code:validated.code },400);
    const e = validated.envelope;
    if (!isValidReadOnly(e)) return response("SCOPE_NOT_ALLOWLISTED",422);
    if (e.authorization.owner_session !== "owner-main/1LSS_OWNER_MAIN") return response("OWNER_CONTEXT_MISMATCH",403);
    const key = c.req.header("Idempotency-Key") || "";
    if (!UUID.test(key) || key !== e.idempotency_key) return response("IDEMPOTENCY_KEY_MISMATCH",400);
    const db = c.env.DB;
    let existing: TaskState | null;
    try { existing = await task(db,e.task_id); }
    catch(err){ return response(schemaError(err)?"TASK_ENVELOPE_D1_MIGRATION_REQUIRED":"TASK_ENVELOPE_D1_READ_FAILED",503); }
    if(existing){
      if(existing.idempotency_key!==key || existing.context_ref!==e.context.context_ref
        || existing.context_revision!==e.context.context_revision) return response("TASK_ID_REUSE_CONFLICT",409);
      return c.json({ok:true,idempotent_replay:true,task:existing,consumer_proven:existing.execution_state==="RESULT_VERIFIED"},200);
    }
    const instructionHash = await hashText(e.instruction);
    try {
      await db.prepare(
        `INSERT INTO task_envelopes (
          task_id,version,idempotency_key,title,instruction_sha256,context_ref,context_revision,
          context_sha256,a2a_context_id,a2a_task_id,scope_json,target_zone,permission,
          authority_ref,signed_gate,execution_state,attempt_count,max_attempts,
          fallback_mode,fallback_reason
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'TASK_IN',0,?,?,?)`,
      ).bind(
        e.task_id,e.version,key,e.title,instructionHash,e.context.context_ref,e.context.context_revision,
        e.context.context_sha256||null,e.context.a2a_context_id||null,e.a2a?.task_id||null,
        JSON.stringify(e.scope),"TMN","READ",e.authorization.authority_ref,"ATHENA_YELLOW",
        1,e.fallback.mode,e.fallback.reason,
      ).run();
      await db.prepare(
        "INSERT OR IGNORE INTO task_envelope_events(event_id,task_id,event_type,actor,correlation_id,metadata_json) VALUES (?,?,'TASK_IN_ACCEPTED','owner-main',?,?)",
      ).bind("event-in-"+e.task_id,e.task_id,e.task_id,JSON.stringify({context_ref:e.context.context_ref,context_revision:e.context.context_revision})).run();
    } catch(err) {
      return response(schemaError(err)?"TASK_ENVELOPE_D1_MIGRATION_REQUIRED":"TASK_ENVELOPE_INSERT_FAILED",503);
    }
    // Forward the same signed Owner bearer/cookie and idempotency key to existing
    // ATHENA/YELLOW admission. Never dispatch the GitHub workflow directly here.
    const url = new URL(c.req.url);
    url.pathname="/api/wave/command";
    url.search="";
    const cmd = {
      command:`OGE129 READONLY PROOF: ${e.title}; context ${e.context.context_ref} revision ${e.context.context_revision}; ${e.instruction}`,
      capability:"codex_selfhost",provider:"openai",mode:"read",environment:"staging",
    };
    let downstream: Response;
    try {
      downstream=await dispatch(new Request(url.toString(),{
        method:"POST",headers:c.req.raw.headers,body:JSON.stringify(cmd),
      }),c.env,c.executionCtx);
    } catch {
      return c.json({ok:false,code:"SIGNED_DISPATCH_UNAVAILABLE",task_id:e.task_id,execution_state:"TASK_IN"},503);
    }
    const outcome=await downstream.json().catch(()=>({})) as {
      ok?:boolean;code?:string;task?:{id?:string};dispatch?:{workflow_url?:string};
    };
    const commandId = String(outcome.task?.id||"");
    const admitted = outcome.ok===true && COMMAND.test(commandId) && [
      "COMMAND_DISPATCHED","COMMAND_ALREADY_QUEUED","COMMAND_MANUAL_DISPATCH_REQUIRED","COMMAND_ALREADY_DONE",
    ].includes(String(outcome.code||""));
    if(!admitted){
      await db.prepare("UPDATE task_envelopes SET execution_state='BLOCKED',updated_at=CURRENT_TIMESTAMP WHERE task_id=?").bind(e.task_id).run();
      await db.prepare(
        "INSERT OR IGNORE INTO task_envelope_events(event_id,task_id,event_type,actor,correlation_id,external_ref) VALUES (?,?,'ATHENA_YELLOW_REJECTED','athena-command',?,?)",
      ).bind("event-reject-"+e.task_id,e.task_id,e.task_id,String(outcome.code||"SIGNED_COMMAND_REJECTED").slice(0,80)).run();
      return c.json({ok:false,code:"SIGNED_COMMAND_REJECTED",task_id:e.task_id,execution_state:"BLOCKED"},409);
    }
    const dispatched=outcome.code==="COMMAND_DISPATCHED" || outcome.code==="COMMAND_ALREADY_QUEUED";
    await db.prepare(
      "UPDATE task_envelopes SET command_task_id=?,executor_ref='GH-2 Addmin Provider',execution_state=?,updated_at=CURRENT_TIMESTAMP WHERE task_id=?",
    ).bind(commandId,dispatched?"ROUTED":"AUTHORIZED",e.task_id).run();
    await db.prepare(
      "INSERT OR IGNORE INTO task_envelope_events(event_id,task_id,event_type,actor,correlation_id,external_ref) VALUES (?,?,'ATHENA_YELLOW_AUTHORIZED','athena-command',?,?)",
    ).bind("event-authorized-"+e.task_id,e.task_id,e.task_id,commandId).run();
    if(dispatched) await db.prepare(
      "INSERT OR IGNORE INTO task_envelope_events(event_id,task_id,event_type,actor,correlation_id,external_ref) VALUES (?,?,'ROUTED_TO_TMN','GH-2 Addmin Provider',?,?)",
    ).bind("event-routed-"+e.task_id,e.task_id,e.task_id,commandId).run();
    return c.json({
      ok:true,task_id:e.task_id,command_task_id:commandId,context_ref:e.context.context_ref,
      context_revision:e.context.context_revision,execution_state:dispatched?"ROUTED":"AUTHORIZED",
      dispatch_status:outcome.code,manual_workflow:dispatched?null:outcome.dispatch?.workflow_url||null,
      consumer_proven:false,readback:"/api/wave/task-envelope/status?task_id="+e.task_id,
    },202);
  });
  api.get("/api/wave/task-envelope/status", async c => {
    if (c.env.WAVE_TASK_ENVELOPE_ENABLED !== "true") return response("TASK_ENVELOPE_FEATURE_DISABLED",503);
    const db=c.env.DB;
    if(!db) return response("D1_BINDING_REQUIRED",503);
    const taskId=c.req.query("task_id")||"";
    if(!TASK.test(taskId)) return response("INVALID_TASK_ID",400);
    let row: TaskState | null;
    try { row=await task(db,taskId); }
    catch(err) { return response(schemaError(err)?"TASK_ENVELOPE_D1_MIGRATION_REQUIRED":"TASK_ENVELOPE_D1_READ_FAILED",503); }
    if(!row) return c.json({ok:false,code:"TASK_NOT_FOUND"},404);
    let evidence:Record<string,unknown>|null=null;
    if(row.command_task_id && COMMAND.test(row.command_task_id)) {
      const result = await db.prepare(
        "SELECT t.status,e.event_type,e.external_ref FROM agent_tasks t LEFT JOIN agent_events e ON e.task_id=t.id AND e.event_type='COMMAND_RESULT_DONE' WHERE t.id=? LIMIT 1",
      ).bind(row.command_task_id).first<{status:string,event_type?:string,external_ref?:string}>();
      if(result?.status==="DONE" && result.event_type==="COMMAND_RESULT_DONE"){
        let parsed:Record<string,unknown>={};
        try { parsed=JSON.parse(result.external_ref||"{}") as Record<string,unknown>; } catch { /* unverified */ }
        if(typeof parsed.result_sha256==="string" && HASH.test(parsed.result_sha256)
          && typeof parsed.git_sha==="string" && GIT_SHA.test(parsed.git_sha)
          && typeof parsed.evidence_ref==="string" && GH2_EVIDENCE.test(parsed.evidence_ref)){
          evidence=parsed;
          if(row.execution_state!=="RESULT_VERIFIED"){
            const receiptId="receipt-"+taskId;
            await db.prepare(
              "INSERT OR IGNORE INTO task_envelope_receipts(receipt_id,task_id,receipt_state,result_hash,evidence_ref,executor_ref) VALUES (?,?,'RESULT_VERIFIED',?,?,'Codex S-Host')",
            ).bind(receiptId,taskId,parsed.result_sha256,parsed.evidence_ref).run();
            await db.prepare(
              "INSERT OR IGNORE INTO task_envelope_events(event_id,task_id,event_type,actor,correlation_id,external_ref) VALUES (?,?,'RESULT_OUT_RECEIVED','Codex S-Host',?,?)",
            ).bind("event-out-"+taskId,taskId,taskId,row.command_task_id).run();
            await db.prepare(
              "INSERT OR IGNORE INTO task_envelope_events(event_id,task_id,event_type,actor,correlation_id,external_ref) VALUES (?,?,'RESULT_VERIFIED','WAVE-D1',?,?)",
            ).bind("event-verified-"+taskId,taskId,taskId,receiptId).run();
            await db.prepare(
              "UPDATE task_envelopes SET execution_state='RESULT_VERIFIED',result_receipt_id=?,result_hash=?,evidence_ref=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE task_id=? AND command_task_id=?",
            ).bind(receiptId,parsed.result_sha256,parsed.evidence_ref,taskId,row.command_task_id).run();
            row=await task(db,taskId);
          }
        }
      }
    }
    const persistedReceipt=row?.execution_state==="RESULT_VERIFIED"
      ? await db.prepare(
        "SELECT receipt_id,result_hash,evidence_ref FROM task_envelope_receipts WHERE task_id=? AND receipt_state='RESULT_VERIFIED' LIMIT 1",
      ).bind(taskId).first<{receipt_id:string,result_hash:string,evidence_ref:string}>()
      :null;
    const verified=Boolean(row?.execution_state==="RESULT_VERIFIED" && persistedReceipt
      && HASH.test(String(persistedReceipt.result_hash||"")) && GH2_EVIDENCE.test(String(persistedReceipt.evidence_ref||""))
      && persistedReceipt.result_hash===row.result_hash && persistedReceipt.evidence_ref===row.evidence_ref);
    return c.json({ok:true,task:row,receipt:verified?persistedReceipt:null,
      execution:{consumer_proven:verified,context_verified:verified,command_task_id:row?.command_task_id||null},
      evidence_ref:verified?row?.evidence_ref:null},200,{"Cache-Control":"no-store"});
  });
  return api;
}
