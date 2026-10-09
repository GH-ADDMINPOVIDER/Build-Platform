import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(path)=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("worker/session-recovery-api.ts");
const agent=read("AGENTS.md");
const spec=read("docs/OGENIC_SESSION_LOCK_CANONICAL.md");
test("OGE-104 owner-only bounded old 1LSS recall",()=>{
 const start=source.indexOf('api.get("/api/1lss/context-recall"');
 const end=source.indexOf('api.get("/api/1lss/sessions"',start);
 assert.ok(start>=0&&end>start);
 const h=source.slice(start,end);
 assert.match(h,/ownerOnly\(c.req.raw, c.env\)/);
 assert.match(h,/REAUTH_REQUIRED/);
 assert.match(h,/CONVERSATION_ID, query, limit/);
 assert.match(h,/chat_messages/);
 assert.match(h,/sequence_no DESC/);
 assert.match(h,/UNVERIFIED_SOURCE/);
 assert.match(h,/RUBY_VERIFICATION_REQUIRED/);
 assert.match(h,/AUTHENTICATED_OWNER_ONLY/);
 assert.match(h,/automatic_provider_dispatch: false/);
 assert.doesNotMatch(h,/INSERT\s+INTO|UPDATE\s+chat_messages|DELETE\s+FROM/i);
});
test("OGE-104 scoped query and redaction",()=>{
 assert.match(source,/clampLimit\(c.req.query\("limit"\), 8, 12\)/);
 assert.match(source,/clean\(message.content, 1200\)/);
 assert.match(source,/REDACTED_SECRET/);
 assert.match(source,/QUERY_REQUIRED/);
});
test("no-forget agent source preflight",()=>{
 assert.match(agent,/Mandatory continuity preflight/);
 assert.match(agent,/OGENIC_SESSION_LOCK_CANONICAL.md/);
 assert.match(spec,/OGE-105/);
 assert.match(spec,/UNVERIFIED_SOURCE/);
 assert.match(spec,/OGE-102/);
});
