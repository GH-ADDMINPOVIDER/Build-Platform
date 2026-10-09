import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ctx=read("worker/d1-context.ts");
const manus=read("worker/manus-api.ts");
const agent=read("worker/connector-app-api.ts");
test("OGE-106 D1 binding is not equivalent to live retrieved memory",()=>{
 assert.match(ctx,/state: "LIVE" \| "UNBOUND" \| "UNAVAILABLE"/);
 assert.match(ctx,/canonicalRowCount === 0/);
 assert.match(ctx,/state: "UNAVAILABLE"/);
 assert.match(ctx,/HISTORICAL_CONTEXT_INDEX_NOT_FULL_MEMORY/);
 assert.match(ctx,/message_text_loaded: false/);
 assert.match(ctx,/SOURCE_POINTERS_ONLY/);
 assert.match(ctx,/recent_turn_pointers: recentTurns.length/);
 assert.match(ctx,/session_reference_surfaces: sessionIndex.length/);
});
test("OGE-106 no provider session created when D1 is absent",()=>{
 assert.match(manus,/d1Context.state !== "LIVE"/);
 assert.match(manus,/CANONICAL_CONTEXT_UNAVAILABLE/);
 const from=agent.indexOf("const d1Context = await readCanonicalD1Context");
 const until=agent.indexOf('const agentResponse = await fetch(',from);
 assert.ok(from>=0&&until>from);
 assert.match(agent.slice(from,until),/CANONICAL_CONTEXT_UNAVAILABLE/);
});
