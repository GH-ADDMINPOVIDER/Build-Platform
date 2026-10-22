import { Hono } from "hono";
import {
  type FabricEnv, type FabricDb, type DbStmt, type FabricActor,
  FabricError, requireFabricDb, requireFabricActor, createOwnerFabricSession,
  issueEnrollment, exchangeAccessSession, hashHex, utf8
} from "./fabric-auth";

type Env = { Bindings: FabricEnv };
const app = new Hono<Env>();
const now = () => Date.now();
const id = (prefix: string) => prefix + crypto.randomUUID().replaceAll("-", "");
const txt = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const charset = (body: string, max: number) =>
  body.length > 0 && utf8(body).byteLength <= max;
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const replies = (v: unknown): string[] =>
  Array.isArray(v) && v.length > 0 && v.length <= 16 &&
  v.every(x => typeof x === "string" && /^human:(gs|gt|owner)$/.test(x))
    ? [...new Set(v as string[])] : [];
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type":"application/json", "Cache-Control":"no-store", ...headers },
  });
async function input(c: { req: { raw: Request } }) {
  const request = c.req.raw;
  if (Number(request.headers.get("content-length") || "0") > 32768) throw new FabricError(413,"FABRIC_INPUT_TOO_LARGE");
  return asObject(await request.json().catch(() => null));
}
async function actorOf(c: { req: { raw: Request }, env: FabricEnv }) {
  return requireFabricActor(c.req.raw,c.env);
}
async function membership(db: FabricDb, who: string, threadId: string, send = false) {
  const found = await db.prepare(`SELECT 1 AS ok FROM af_thread_members m
    JOIN af_principals p ON p.principal_id=m.principal_id
    WHERE m.thread_id=? AND m.principal_id=? AND m.revoked_at IS NULL
    AND p.status='ACTIVE' AND (?=0 OR m.can_send=1)`)
    .bind(threadId,who,send?1:0).first();
  if (!found) throw new FabricError(404,"THREAD_NOT_FOUND");
}
async function activeRecipient(db:FabricDb,p:string) {
  const found=await db.prepare("SELECT 1 AS ok FROM af_principals WHERE principal_id=? AND status='ACTIVE'")
    .bind(p).first();
  if (!found) throw new FabricError(422,"RECIPIENT_NOT_ENROLLED");
}
async function priorOperation(db:FabricDb,principal:string,name:string,key:string,hash:string) {
  const found=await db.prepare(`SELECT request_sha256,response_json,http_status FROM af_operations
    WHERE principal_id=? AND name=? AND idempotency_key=?`)
    .bind(principal,name,key).first<{request_sha256:string;response_json:string;http_status:number}>();
  if (!found) return null;
  if (found.request_sha256!==hash) throw new FabricError(409,"IDEMPOTENCY_MISMATCH");
  return json(JSON.parse(found.response_json),found.http_status);
}
function operationHeader(c: {req:{raw:Request}}) {
  const key=c.req.raw.headers.get("idempotency-key") || "";
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(key)) throw new FabricError(400,"IDEMPOTENCY_KEY_REQUIRED");
  return key;
}
async function commitOperation(db:FabricDb,actor:FabricActor,name:string,key:string,
  request:unknown,response:unknown,status:number,build:(opId:string,createdAt:number)=>DbStmt[]) {
  const digest=await hashHex(JSON.stringify(request)),known=await priorOperation(db,actor.principalId,name,key,digest);
  if(known)return known;
  const opId=id("op_"),time=now();
  const statements=[
    db.prepare(`INSERT INTO af_operations
      (operation_id,principal_id,name,idempotency_key,request_sha256,response_json,http_status,created_at)
      VALUES(?,?,?,?,?,?,?,?)`)
      .bind(opId,actor.principalId,name,key,digest,JSON.stringify(response),status,time),
    ...build(opId,time)
  ];
  try { await db.batch(statements); }
  catch(err) {
    const duplicate=await priorOperation(db,actor.principalId,name,key,digest);
    if(duplicate)return duplicate;
    throw err;
  }
  return json(response,status);
}
app.onError((error) => {
  const issue=error instanceof FabricError ? error : new FabricError(503,"FABRIC_TRANSACTION_FAILED");
  return json({ok:false,code:issue.code},issue.status);
});
app.get("/api/agent-fabric/status", async(c)=>{
  const db=requireFabricDb(c.env);
  const actor=await actorOf(c);
  const schema=await db.prepare("SELECT name FROM sqlite_master WHERE name='af_messages' AND type='table'").first();
  return json({ok:true,authenticated_principal:actor.principalId,schema_ready:Boolean(schema),inference_required:false});
});
app.post("/api/agent-fabric/auth/owner-session",async(c)=>{
  const s=await createOwnerFabricSession(c.req.raw,c.env);
  return json({ok:true,principal_id:"human:owner",csrf:s.csrf,expires_at:new Date(s.expiresAt).toISOString()},200,s.headers);
});
app.post("/api/agent-fabric/principals/enrollments",async(c)=>{
  const actor=await actorOf(c),payload=await input(c);
  const issued=await issueEnrollment(c.req.raw,c.env,actor,payload);
  return json({ok:true,...issued},201);
});
app.post("/api/agent-fabric/auth/access-exchange",async(c)=>{
  if(c.req.raw.headers.get("origin")!==new URL(c.req.url).origin)throw new FabricError(403,"ORIGIN_DENIED");
  const payload=await input(c);
  const token=typeof payload.enrollment_token==="string"?payload.enrollment_token:"";
  const exchange=await exchangeAccessSession(c.req.raw,c.env,token);
  return json({ok:true,principal_id:exchange.principal_id,csrf:exchange.csrf,expires_at:new Date(exchange.expiresAt).toISOString()},
    200,exchange.headers);
});
app.post("/api/agent-fabric/auth/logout",async(c)=>{
  const actor=await actorOf(c);
  const db=requireFabricDb(c.env);
  await db.prepare("UPDATE af_sessions SET revoked_at=? WHERE token_sha256=?")
    .bind(now(),actor.tokenHash).run();
  return json({ok:true},200,{"Set-Cookie":"__Host-wave_fabric=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"});
});
app.get("/api/agent-fabric/auth/me",async(c)=>{
  const actor=await actorOf(c);
  return json({ok:true,principal_id:actor.principalId,kind:actor.kind});
});
app.post("/api/agent-fabric/threads",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env);
  if(!["human:gs","human:owner"].includes(actor.principalId))throw new FabricError(403,"THREAD_CREATE_NOT_GRANTED");
  const body=await input(c),key=operationHeader(c);
  const title=txt(body.title,160);
  const recipients=replies(body.recipient_principals).filter(p=>p!==actor.principalId);
  if(!title||recipients.length===0)throw new FabricError(400,"INVALID_THREAD");
  for(const p of recipients)await activeRecipient(db,p);
  const threadId=id("thread_");
  const result={ok:true,thread_id:threadId,members:[actor.principalId,...recipients]};
  return commitOperation(db,actor,"thread:create",key,{title,recipients},result,201,(op,t)=>[
    db.prepare("INSERT INTO af_threads(thread_id,title,created_by,created_at) VALUES(?,?,?,?)")
      .bind(threadId,title,actor.principalId,t),
    ...[actor.principalId,...recipients].map(p=>db.prepare(`INSERT INTO af_thread_members
      (thread_id,principal_id,can_send,joined_at) VALUES(?,?,1,?)`).bind(threadId,p,t)),
    db.prepare(`INSERT INTO agent_events(id,event_type,actor,correlation_id,external_ref,created_at)
      VALUES(?,?,?, ?,?,CURRENT_TIMESTAMP)`)
      .bind(id("ev_"),"FABRIC_THREAD_CREATED",actor.principalId,threadId,JSON.stringify({thread_id:threadId,operation_id:op}))
  ]);
});
app.get("/api/agent-fabric/threads/:threadId",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env),threadId=c.req.param("threadId");
  await membership(db,actor.principalId,threadId);
  const thread=await db.prepare("SELECT thread_id,title,version,created_at FROM af_threads WHERE thread_id=?")
    .bind(threadId).first();
  const messages=await db.prepare(`SELECT m.message_id,m.thread_id,m.task_id,m.sender_principal,m.authorship,
      m.reply_to,m.correlation_id,m.created_at,c.inline_utf8 AS body
    FROM af_messages m JOIN af_contents c ON c.content_ref=m.body_ref
    WHERE m.thread_id=? ORDER BY m.created_at,m.message_id LIMIT 100`)
    .bind(threadId).all();
  return json({ok:true,thread,messages:messages.results||[]});
});
async function sendMessage(db:FabricDb,actor:FabricActor,key:string,data:{
  thread_id:string;recipient_principals:string[];body:string;task_id?:string;reply_to?:string;
},name="message:send") {
  await membership(db,actor.principalId,data.thread_id,true);
  for(const p of data.recipient_principals) {
    if(p===actor.principalId)throw new FabricError(422,"RECIPIENT_CANNOT_BE_SENDER");
    await membership(db,p,data.thread_id);
  }
  if(!charset(data.body,16384))throw new FabricError(400,"INVALID_MESSAGE_BODY");
  const taskId=data.task_id||null;
  if(taskId) {
    const linked=await db.prepare(`SELECT 1 AS ok FROM af_tasks
      WHERE task_id=? AND thread_id=?`).bind(taskId,data.thread_id).first();
    if(!linked)throw new FabricError(404,"TASK_NOT_FOUND");
  }
  const messageId=id("msg_"),contentRef=id("content_"),corr=taskId||id("corr_");
  const payload={thread_id:data.thread_id,recipients:data.recipient_principals,body:data.body,task_id:taskId,reply_to:data.reply_to||null};
  const result={ok:true,message_id:messageId,thread_id:data.thread_id,task_id:taskId,
    correlation_id:corr,sender_principal:actor.principalId,recipients:data.recipient_principals,authorship:"HUMAN"};
  const bodyHash=await hashHex(data.body);
  return commitOperation(db,actor,name,key,payload,result,201,(op,t)=>[
    db.prepare(`INSERT INTO af_contents
      (content_ref,thread_id,media_type,sha256,inline_utf8,byte_length,created_by,created_at)
      VALUES(?,?,'text/plain',?,?,?,?,?)`)
      .bind(contentRef,data.thread_id,bodyHash,data.body,utf8(data.body).byteLength,actor.principalId,t),
    db.prepare(`INSERT INTO af_messages
      (message_id,thread_id,task_id,correlation_id,sender_principal,authorship,body_ref,reply_to,operation_id,created_at)
      VALUES(?,?,?,?,?,'HUMAN',?,?,?,?)`)
      .bind(messageId,data.thread_id,taskId,corr,actor.principalId,contentRef,data.reply_to||null,op,t),
    ...data.recipient_principals.map(p=>db.prepare(`INSERT INTO af_deliveries
      (message_id,recipient_principal,created_at) VALUES(?,?,?)`).bind(messageId,p,t)),
    db.prepare("UPDATE af_threads SET version=version+1 WHERE thread_id=?").bind(data.thread_id),
    db.prepare(`INSERT INTO agent_events(id,task_id,event_type,actor,correlation_id,external_ref,created_at)
      VALUES(?,?,'FABRIC_MESSAGE_AVAILABLE',?,?,?,CURRENT_TIMESTAMP)`)
      .bind(id("ev_"),taskId,actor.principalId,corr,JSON.stringify({message_id:messageId,body_sha256:bodyHash,operation_id:op}))
  ]);
}
app.post("/api/agent-fabric/messages",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env),body=await input(c),key=operationHeader(c);
  const thread=String(body.thread_id||"");
  const recipients=replies(body.recipient_principals);
  const text=typeof asObject(body.body).text==="string"?String(asObject(body.body).text):"";
  if(!/^thread_[a-f0-9]{32}$/.test(thread)||!recipients.length)throw new FabricError(400,"INVALID_MESSAGE_ENVELOPE");
  return sendMessage(db,actor,key,{thread_id:thread,recipient_principals:recipients,
    body:text,task_id:typeof body.task_id==="string"?body.task_id:undefined});
});
app.get("/api/agent-fabric/inbox",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env);
  const after=Number(c.req.query("after")||"0"),limit=Number(c.req.query("limit")||"50");
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit))throw new FabricError(400,"INVALID_CURSOR");
  const rows=await db.prepare(`SELECT d.seq,d.delivered_at,d.read_at,d.ack_id,d.acked_at,
      m.message_id,m.thread_id,m.task_id,m.reply_to,m.correlation_id,
      m.sender_principal,m.authorship,m.created_at,c.inline_utf8 AS body
    FROM af_deliveries d JOIN af_messages m ON m.message_id=d.message_id
    JOIN af_contents c ON c.content_ref=m.body_ref
    JOIN af_thread_members tm ON tm.thread_id=m.thread_id AND tm.principal_id=d.recipient_principal
    WHERE d.recipient_principal=? AND d.seq>? AND tm.revoked_at IS NULL
    ORDER BY d.seq LIMIT ?`)
    .bind(actor.principalId,after,Math.min(100,Math.max(1,limit))).all();
  const items=rows.results||[];
  return json({ok:true,principal_id:actor.principalId,items,
    next_cursor:items.length?String((items[items.length-1] as {seq:number}).seq):String(after)});
});
app.post("/api/agent-fabric/messages/:messageId/ack",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env),messageId=c.req.param("messageId");
  const delivery=await db.prepare(`SELECT d.ack_id,m.thread_id FROM af_deliveries d
    JOIN af_messages m ON m.message_id=d.message_id
    WHERE d.message_id=? AND d.recipient_principal=?`)
    .bind(messageId,actor.principalId).first<{ack_id:string|null;thread_id:string}>();
  if(!delivery)throw new FabricError(404,"DELIVERY_NOT_FOUND");
  await membership(db,actor.principalId,delivery.thread_id);
  if(delivery.ack_id)return json({ok:true,ack_id:delivery.ack_id,idempotent_replay:true});
  const ack=id("ack_"),time=now();
  await db.prepare(`UPDATE af_deliveries
    SET delivered_at=COALESCE(delivered_at,?),read_at=COALESCE(read_at,?),
    ack_id=COALESCE(ack_id,?),acked_at=COALESCE(acked_at,?)
    WHERE message_id=? AND recipient_principal=? AND ack_id IS NULL`)
    .bind(time,time,ack,time,messageId,actor.principalId).run();
  const verified=await db.prepare(`SELECT ack_id FROM af_deliveries
    WHERE message_id=? AND recipient_principal=?`).bind(messageId,actor.principalId).first<{ack_id:string}>();
  if(!verified?.ack_id)throw new FabricError(409,"ACK_CONFLICT");
  return json({ok:true,ack_id:verified.ack_id,idempotent_replay:verified.ack_id!==ack});
});
app.post("/api/agent-fabric/messages/:messageId/reply",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env),key=operationHeader(c);
  const original=await db.prepare(`SELECT m.message_id,m.sender_principal,m.thread_id,m.task_id
    FROM af_messages m JOIN af_deliveries d ON d.message_id=m.message_id
    WHERE m.message_id=? AND d.recipient_principal=?`)
    .bind(c.req.param("messageId"),actor.principalId)
    .first<{message_id:string;sender_principal:string;thread_id:string;task_id:string|null}>();
  if(!original)throw new FabricError(404,"MESSAGE_NOT_FOUND");
  const body=await input(c);
  const text=typeof asObject(body.body).text==="string"?String(asObject(body.body).text):"";
  return sendMessage(db,actor,key,{thread_id:original.thread_id,
    recipient_principals:[original.sender_principal],body:text,
    task_id:original.task_id||undefined,reply_to:original.message_id},"message:reply");
});
app.post("/api/agent-fabric/tasks",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env),inputBody=await input(c),key=operationHeader(c);
  if(!["human:owner","human:gs"].includes(actor.principalId))throw new FabricError(403,"TASK_CREATE_NOT_GRANTED");
  const thread=String(inputBody.thread_id||""),assigned=String(inputBody.assigned_principal||"");
  const title=txt(inputBody.title,180),context=String(asObject(inputBody.context).text||"");
  const initial=String(asObject(inputBody.initial_message).text||"");
  if(!title||!charset(context,32768)||!/^human:(gt|gs)$/.test(assigned))
    throw new FabricError(400,"INVALID_TASK_REQUEST");
  await membership(db,actor.principalId,thread,true);
  await membership(db,assigned,thread);
  if(initial&&!charset(initial,16384))throw new FabricError(400,"INVALID_INITIAL_MESSAGE");
  const taskId=id("fabric_"),corr=id("corr_"),ctxId=id("content_"),msgId=initial?id("msg_"):null,
    msgRef=initial?id("content_"):null,ctxHash=await hashHex(context),msgHash=initial?await hashHex(initial):null;
  const result={ok:true,task_id:taskId,thread_id:thread,assigned_principal:assigned,
    status:"ASSIGNED",initial_message_id:msgId,correlation_id:corr,execution:"NOT_STARTED"};
  return commitOperation(db,actor,"task:create",key,
    {thread,assigned,title,context,initial},result,201,(op,t)=>[
    db.prepare(`INSERT INTO agent_tasks(id,title,capability,status,priority,resource_key,
      correlation_id,source_ref,attempt_count,created_at,updated_at)
      VALUES (?,?,'agent_fabric','QUEUED',50,?,?,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(taskId,title,"agent-fabric:staging:"+thread,corr,"GH_ADDMIN_POVIDER"),
    db.prepare(`INSERT INTO af_contents
      (content_ref,thread_id,media_type,sha256,inline_utf8,byte_length,created_by,created_at)
      VALUES(?,?,'text/plain',?,?,?,?,?)`).bind(ctxId,thread,ctxHash,context,utf8(context).byteLength,actor.principalId,t),
    db.prepare(`INSERT INTO af_tasks
      (task_id,thread_id,logical_agent_id,assigned_principal,status,context_ref,correlation_id,created_at,updated_at)
      VALUES(?,?,'GT',?,'ASSIGNED',?,?,?,?)`).bind(taskId,thread,assigned,ctxId,corr,t,t),
    ...(initial&&msgId&&msgRef&&msgHash?[
      db.prepare(`INSERT INTO af_contents
        (content_ref,thread_id,media_type,sha256,inline_utf8,byte_length,created_by,created_at)
        VALUES(?,?,'text/plain',?,?,?,?,?)`).bind(msgRef,thread,msgHash,initial,utf8(initial).byteLength,actor.principalId,t),
      db.prepare(`INSERT INTO af_messages
        (message_id,thread_id,task_id,correlation_id,sender_principal,authorship,body_ref,operation_id,created_at)
        VALUES(?,?,?,?,?,'HUMAN',?,?,?)`).bind(msgId,thread,taskId,corr,actor.principalId,msgRef,op,t),
      db.prepare(`INSERT INTO af_deliveries(message_id,recipient_principal,created_at) VALUES(?,?,?)`)
        .bind(msgId,assigned,t)
    ]:[]),
    db.prepare(`INSERT INTO agent_events(id,task_id,event_type,actor,correlation_id,external_ref,created_at)
      VALUES(?,?,'FABRIC_TASK_CREATED',?,?,?,CURRENT_TIMESTAMP)`)
      .bind(id("ev_"),taskId,actor.principalId,corr,JSON.stringify({operation_id:op,assigned_principal:assigned,context_sha256:ctxHash}))
  ]);
});
app.get("/api/agent-fabric/tasks/:taskId",async(c)=>{
  const actor=await actorOf(c),db=requireFabricDb(c.env),taskId=c.req.param("taskId");
  const task=await db.prepare(`SELECT task_id,thread_id,assigned_principal,status,
    logical_agent_id,version,fence,correlation_id,result_ref FROM af_tasks WHERE task_id=?`)
    .bind(taskId).first<{thread_id:string}>();
  if(!task)throw new FabricError(404,"TASK_NOT_FOUND");
  await membership(db,actor.principalId,task.thread_id);
  return json({ok:true,task});
});
export function createAgentFabricApi(){return app;}
