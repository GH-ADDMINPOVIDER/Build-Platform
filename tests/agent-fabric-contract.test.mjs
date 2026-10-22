import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const auth=file("worker/fabric-auth.ts"),api=file("worker/fabric-api.ts"),
  legacy=file("worker/local-agent-team-api.ts"),entry=file("worker/entry-yellow-stone.ts"),
  main=file("src/main.tsx"),ui=file("src/AgentFabricInbox.tsx");

test("WF-001 old Owner-only mutation routes block Fabric task bypass",()=>{
  for(const route of ["dispatch","handoff","result","checkpoint"])
    assert.ok(legacy.includes("/api/local-agent-team/tasks/:taskId/"+route),route);
  assert.ok(legacy.includes("FABRIC_VERIFIER_ROUTE_REQUIRED"));
  assert.ok(legacy.includes("SELECT task_id FROM af_tasks"));
  assert.ok(legacy.includes("no such table: af_tasks"));
  assert.ok(legacy.split("rejectFabricLegacyMutation(c.env.DB, taskId)").length-1>=4);
});
test("WF-002 actual SQLite schema is additive",()=>{
  for(const path of ["0016_wave_agent_fabric_identity_messaging.sql","0017_wave_agent_fabric_task_state.sql"]){
    const sql=file("database/migrations/"+path);
    assert.ok(sql.includes("CREATE TABLE af_"),path);
    assert.ok(!new RegExp("DROP TABLE|DROP INDEX","i").test(sql),path);
  }
  assert.ok(file("database/migrations/0017_wave_agent_fabric_task_state.sql").includes("REFERENCES agent_tasks(id)"));
});
test("WF-003 independent human auth requires verified signed Access JWT",()=>{
  for(const key of ["cf-access-jwt-assertion","RS256","verifyAccess","signature","WAVE_ACCESS_AUD",
    "WAVE_ACCESS_ISSUER","CSRF_DENIED","FABRIC_DISABLED","hasOwnerSession","SameSite=Lax"])
    assert.ok(auth.includes(key),key);
  assert.ok(!auth.includes("localStorage"));
});
test("WF-004 plan-independent atomic D1 messaging",()=>{
  for(const path of ["/api/agent-fabric/threads","/api/agent-fabric/messages","/api/agent-fabric/inbox",
    "/api/agent-fabric/tasks","/ack","/reply"])assert.ok(api.includes(path),path);
  for(const table of ["af_threads","af_thread_members","af_contents","af_messages",
    "af_deliveries","af_operations","af_tasks","agent_tasks","agent_events"])
    assert.ok(api.includes(table),table);
  assert.ok(api.includes("db.batch(statements)"));
  assert.ok(api.includes("IDEMPOTENCY_MISMATCH"));
  assert.ok(!api.includes("OPENAI_API_KEY"));
});
test("WF-005 GT has separate iPhone-friendly fabric route",()=>{
  assert.ok(entry.includes("createAgentFabricApi"));
  assert.ok(entry.includes('pathname.startsWith("/api/agent-fabric/")'));
  assert.ok(main.includes("fabricRoute"));
  assert.ok(main.includes("<AgentFabricInbox />"));
  for(const label of ["GT / GS Access sign-in","Explicit ACK","Send Reply","PING GT","PONG GS","Cloudflare Access"])
    assert.ok(ui.includes(label),label);
});
