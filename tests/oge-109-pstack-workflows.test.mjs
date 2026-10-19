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
 assert.deepEqual(conf.workflows.map(x=>x.id),["investigation","session-pickup","bug-fix","babysit","diagram-design","engineering-loop","agent-harness-guardrails"]);
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

test("pstack guided prompt buttons are usable on existing mobile dock",()=>{
 const css=read("src/unified-chat.css");
 assert.ok(css.includes(".ucPstackPresets"));
 assert.match(chat,/ucPstackPresets/);
});

test("typed @pstack must open workflow picker locally, not default generic AI status",()=>{
 const start=chat.indexOf("async function send()");
 const end=chat.indexOf("function startNew",start);
 assert.ok(start>0&&end>start);
 const text=chat.slice(start,end);
 assert.match(text,/pstackCommand/);
 assert.match(text,/setCapabilityQuery\("pstack"\)/);
 assert.match(text,/setToolDock\(true\)/);
 assert.match(text,/setDraft\(args\)/);
 assert.match(text,/const preset = pstackWorkflows\.workflows\.find/);
 assert.match(text,/if \(pstackCommand\)/);
 assert.ok(text.indexOf("if (pstackCommand)")<text.indexOf("setSending(true)"));
 const handler=text.slice(text.indexOf("if (pstackCommand)"),text.indexOf("setSending(true)"));
 assert.doesNotMatch(handler,/await runChat\(|await runAgentAI\(|fetch\(/);
 assert.match(handler,/return;/);
});

test("mobile preset selection is exclusive, not a chain of repeated prompt text",()=>{
 assert.match(chat,/function withoutPstackTemplates/);
 assert.match(chat,/task = task\.split\(preset\.prompt\)\.join\(""\)/);
 assert.match(chat,/const \[selectedPstackId, setSelectedPstackId\]/);
 const a=chat.indexOf('aria-label="pstack workflow presets"');
 const b=chat.indexOf('{visibleTools.map',a);
 const chooser=chat.slice(a,b);
 assert.match(chooser,/setSelectedPstackId\(preset\.id\)/);
 assert.match(chooser,/setDraft\(withoutPstackTemplates\(draft\)\)/);
 assert.doesNotMatch(chooser,/setDraft\(\[preset\.prompt/);
 assert.match(chat,/Clear pstack selection/);
});
test("no concrete task: no model/tool call even if multiple guided buttons were tapped",()=>{
 const a=chat.indexOf("async function send()"),b=chat.indexOf("function startNew",a);
 const action=chat.slice(a,b);
 assert.match(action,/if \(selectedPstackPreset && !pstackTask\)/);
 assert.match(action,/USER TASK:/);
 assert.ok(action.indexOf("if (selectedPstackPreset && !pstackTask)")<action.indexOf("setSending(true)"));
 assert.match(action,/runChat\(effectivePrompt\)/);
 assert.match(action,/runAgentAI\(effectivePrompt\)/);
});

test("legacy multi-preset iPhone drafts are repaired locally before agent invocation",()=>{
 const from=chat.indexOf("async function send()");
 const until=chat.indexOf("function startNew",from);
 const source=chat.slice(from,until);
 assert.match(source,/pstackWorkflows\.workflows\.some\(\(preset\) => prompt\.includes\(preset\.prompt\)\)/);
 assert.match(source,/setDraft\(withoutPstackTemplates\(prompt\)\)/);
 assert.match(source,/Old stacked pstack prompts removed/);
 assert.match(source,/setToolDock\(true\)/);
 assert.ok(source.indexOf("Old stacked pstack prompts removed") < source.indexOf("setSending(true)"));
});


test("curated OGENIC extensions have independent provenance and do not replace canonical P-Stack source",()=>{
 assert.equal(conf.curated_extensions.integration_state,"LOCAL_OGENIC_ADAPTATIONS");
 assert.equal(conf.curated_extensions.no_new_runtime_or_database,true);
 assert.ok(conf.curated_extensions.sources_reviewed.some(x=>x.id==="diagram-design"&&x.license==="MIT"));
 assert.ok(conf.curated_extensions.sources_reviewed.some(x=>x.id==="claude-mem"&&x.decision.includes("not installed")));
 assert.match(read("skills/ogenic-pstack/SKILL.md"),/Keep the original 51 numbered P-Stack source manifest/);
});
