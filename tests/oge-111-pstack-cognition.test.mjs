import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const rd=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const js=ts.transpileModule(rd("worker/violet-pstack-selector.ts"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {selectPstackSkillStack,planSkillLearning}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const skills=JSON.parse(rd("config/pstack-full-catalog.json")).skills;
test("learning plan covers each of 51 exactly once, never claims memory",()=>{
 const p=planSkillLearning(skills),all=p.unifiends.flatMap(w=>w.source_refs);
 assert.equal(p.skill_count,51);
 assert.equal(p.unifiends.length,6);
 assert.equal(all.length,51);
 assert.equal(new Set(all.map(x=>x.id)).size,51);
 assert.ok(all.every(x=>/^[0-9a-f]{64}$/.test(x.hash)));
 assert.equal(p.learning_state,"NOT_DISPATCHED");
 assert.equal(p.green_retention,"NOT_WRITTEN");
});
test("Violet task picks existing memory Skill and two principles, without dispatch",()=>{
 const r=selectPstackSkillStack("กู้ความจำเซสชัน 1LSS ก่อนส่งต่อ",skills);
 assert.equal(r.ok,true);
 assert.equal(r.family,"session_memory");
 assert.equal(r.capability,"context_load");
 assert.ok(r.selected.some(x=>x.id==="recall"));
 assert.ok(r.selected.some(x=>x.id==="principle-guard-the-context-window"));
 assert.equal(r.execution_state,"NOT_DISPATCHED");
});
test("explicit swarm is favored and unknown input fails closed",()=>{
 const r=selectPstackSkillStack("swarm parallel agents",skills);
 assert.equal(r.selected[0].id,"swarm");
 assert.ok(r.selected.length<=5);
 assert.equal(selectPstackSkillStack("",skills).ok,false);
 assert.equal(selectPstackSkillStack("x".repeat(601),skills).code,"TASK_REQUIRED_OR_TOO_LONG");
 assert.equal(selectPstackSkillStack({task:"swarm"},skills).ok,false);
});
test("Violet authenticated API is planning only, no direct provider or D1 write",()=>{
 const api=rd("worker/violet-stone-api.ts");
 assert.match(api,/api.post\("\/api\/violet\/pstack\/select"/);
 assert.match(api,/api.get\("\/api\/violet\/pstack\/learning-plan"/);
 assert.match(api,/planning_only:true/);
 assert.match(api,/prior_context_loaded:false/);
 assert.match(api,/automatic_dispatch:false/);
 assert.match(rd("AGENTS.md"),/OGE-111 — pstack source-backed cognition/);
});

test("existing Violet plan and handoff embed skill references before any actual Agent execution",()=>{
 const api=rd("worker/violet-stone-api.ts");
 const plan=api.slice(api.indexOf("export async function buildVioletPlan"),api.indexOf("function createHandoff"));
 const handoff=api.slice(api.indexOf("function createHandoff"),api.indexOf("function merge"));
 assert.match(plan,/pstack_skill_stack:selectPstackSkillStack\(intent,pstackFullCatalog\.skills\)/);
 assert.match(plan,/pstack_source_full_text_loaded:false/);
 assert.match(handoff,/pstack_skill_stack:selectPstackSkillStack/);
 assert.match(handoff,/full_skill_source_read_by_provider:false/);
});
test("mobile Violet UI can request read-only skill selection and 51-skill learning syllabus",()=>{
 const ui=rd("src/VioletDistributionPanel.tsx");
 assert.match(ui,/Violet pstack Skill Intelligence/);
 assert.match(ui,/\/api\/violet\/pstack\/select/);
 assert.match(ui,/\/api\/violet\/pstack\/learning-plan/);
 assert.match(ui,/Choose Skills \(read-only\)/);
 assert.match(ui,/Planning only: no agent has run/);
 assert.match(ui,/none certified as learned/);
});
