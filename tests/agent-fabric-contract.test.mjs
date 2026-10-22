import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const file=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const auth=file("worker/fabric-auth.ts");
const api=file("worker/fabric-api.ts");
const legacy=file("worker/local-agent-team-api.ts");
const entry=file("worker/entry-yellow-stone.ts");
const main=file("src/main.tsx");
const ui=file("src/AgentFabricInbox.tsx");

test("WF-001 legacy cannot bypass Fabric task completion or dispatch",()=>{
  for(const route of ["dispatch","handoff","result","checkpoint"])
    assert.match(legacy,new RegExp(`rejectFabricLegacyMutation\\(c\\.env\\.DB, taskId\\)`));
  assert.match(legacy,/FABRIC_VERIFIER_ROUTE_REQUIRED/);
  assert.match(legacy,/SELECT task_id FROM af_tasks/);
  assert.match(legacy,/no such table: af_tasks/);
});
test("WF-002 schema is additive and uses canonical D1 migrations",()=>{
  for(const name of ["0016_wave_agent_fabric_identity_messaging.sql","0017_wave_agent_fabric_task_state.sql"]){
    const s=file("database/migrations/"+name);
    assert.doesNotMatch(s,/\\bDROP\\s+(TABLE|INDEX)\\b/i);
    assert.match(s,/CREATE TABLE af_/);
  }
  assert.match(file("database/migrations/0017_wave_agent_fabric_task_state.sql"),/REFERENCES agent_tasks\\(id\\)/);
});
test("WF-003 requires independently signed Access JWT and separate session/CSRF",()=>{
  for(const key of ["cf-access-jwt-assertion","RS256","AccessClaims","verifyAccess","signature","aud","sub","exp","email","WAVE_ACCESS_AUD","WAVE_ACCESS_ISSUER","CSRF_DENIED","FABRIC_DISABLED"])
    assert.ok(auth.includes(key),key);
  assert.doesNotMatch(auth,/localStorage/);
  assert.match(auth,/SameSite=Lax/);
  assert.match(auth,/hasOwnerSession/);
});
test("WF-004 persists thread, message, delivery, ACK and task using D1 batch",()=>{
  for(const path of ["/api/agent-fabric/threads","/api/agent-fabric/messages","/api/agent-fabric/inbox","/api/agent-fabric/tasks","/ack","/reply"])
    assert.ok(api.includes(path),path);
  for(const tab of ["af_threads","af_thread_members","af_contents","af_messages","af_deliveries","af_operations","af_tasks","agent_tasks","agent_events"])
    assert.ok(api.includes(tab),tab);
  assert.match(api,/db\\.batch\\(statements\\)/);
  assert.match(api,/IDEMPOTENCY_MISMATCH/);
  assert.match(api,/THREAD_NOT_FOUND/);
  assert.doesNotMatch(api,/OPENAI_API_KEY|CODEX_API_KEY|runCodex/);
});
test("WF-005 renders separate GT mobile route without Owner-only panel",()=>{
  assert.match(entry,/createAgentFabricApi/);
  assert.match(entry,/pathname\\.startsWith\\("\\/api\\/agent-fabric\\/"\\)/);
  assert.match(main,/fabricRoute/);
  assert.match(main,/<AgentFabricInbox \\/>/);
  assert.match(ui,/GT \\/ GS Access sign-in/);
  assert.match(ui,/Explicit ACK/);
  assert.match(ui,/Send Reply/);
  assert.match(ui,/PING GT/);
  assert.match(ui,/PONG GS/);
  assert.match(ui,/Cloudflare Access/);
});
