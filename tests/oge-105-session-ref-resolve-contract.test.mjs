import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const source=read("worker/session-recovery-api.ts");
const router=read("worker/entry-connectors.ts");
test("OGE-105 exact provider and model session-ref owner lookup",()=>{
 const start=source.indexOf('api.get("/api/1lss/resolve-session"');
 const end=source.indexOf('api.get("/api/1lss/sessions"',start);
 assert.ok(start>0&&end>start);
 const code=source.slice(start,end);
 assert.match(code,/ownerOnly\(c.req.raw, c.env\)/);
 assert.match(code,/EXPLICIT_PROVIDER_REQUIRED/);
 assert.match(code,/MODEL_AND_EFFORT_REQUIRED/);
 assert.match(code,/UNVERIFIED_PROVIDER_MODEL_LOCK/);
 assert.match(code,/OpenAI Agent Session/);
 assert.match(code,/SESSION_REF_AMBIGUOUS/);
 assert.match(code,/can_auto_resume: false/);
 assert.match(code,/explicit_live_validation_required: true/);
 assert.doesNotMatch(code,/INSERT\s+INTO|UPDATE\s+chat_session_refs|DELETE\s+FROM/i);
});
test("OGE-105 support registered A-Z provider references without inventing status",()=>{
 for(const v of ['"line"','"deepseek"','"gemini"','"codex"']) assert.ok(source.includes(v));
 assert.match(source,/FROM chat_session_refs WHERE conversation_id = \? AND source_surface = \?/);
 assert.match(router,/sessionRecoveryApi.fetch\(request, env/);
});
