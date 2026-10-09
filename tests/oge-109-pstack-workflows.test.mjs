import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const conf=JSON.parse(read("config/pstack-workflows.json"));
const chat=read("src/UnifiedChat.tsx");
test("pstack original MIT license and honest integration state",()=>{
 assert.equal(conf.origin.license,"MIT");
 assert.equal(conf.integration_state,"GUIDED_WORKFLOW_PRESETS");
 assert.equal(conf.native_cursor_plugin_installed,false);
 assert.equal(conf.model_calls_triggered_by_selection,0);
 assert.deepEqual(conf.workflows.map(x=>x.id),["investigation","session-pickup","bug-fix","babysit"]);
 assert.match(read("third_party/pstack/LICENSE"),/Copyright \(c\) 2026 Lauren Tan/);
});
test("pstack WAVE tool drawer only prepares prompt and never invokes model immediately",()=>{
 const start=chat.indexOf('aria-label="pstack workflow presets"'),end=chat.indexOf('{visibleTools.map',start);
 assert.ok(start>0&&end>start);
 const x=chat.slice(start,end);
 assert.match(x,/setDraft\(/);
 assert.match(x,/setToolDock\(false\)/);
 assert.match(x,/No Agent has been called/);
 assert.doesNotMatch(x,/void send\(|fetch\(|createAgentSession\(/);
 assert.match(x,/Cursor plugin not installed/);
});
test("original 1LSS, Yellow and Ruby authority retained",()=>{
 assert.match(read("AGENTS.md"),/pstack guided workflows/);
 assert.match(read("skills/ogenic-phase-vi/SKILL.md"),/OGE-109 pstack/);
 assert.match(read("skills/ogenic-pstack/SKILL.md"),/Yellow retains sole execution approval/);
});
