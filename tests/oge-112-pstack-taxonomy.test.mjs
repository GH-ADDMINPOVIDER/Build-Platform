import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const r=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const manifest=JSON.parse(r("config/pstack-full-catalog.json"));
const tax=JSON.parse(r("config/pstack-task-taxonomy.json"));
const js=ts.transpileModule(r("worker/violet-pstack-taxonomy.ts"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {classifyPstackIntent,numberPstackSkills}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
test("51 permanent numbers preserve exact source SHA, many-to-many rules and original order",()=>{
 assert.equal(tax.skills.length,51);
 for(const [i,s] of tax.skills.entries()){
  assert.equal(s.number,i+1);
  assert.equal(s.id,manifest.skills[i].id);
  assert.equal(s.sha256,manifest.skills[i].source_sha256);
  assert.ok(s.categories.length>=1&&s.categories.every(c=>c in tax.task_categories));
 }
 assert.equal(tax.canonical_owner,"RULE_STONE_07");
 assert.equal(tax.consumer,"VIOLET_STONE_04");
});
test("Pstack: 1,9,24,36 exact canonical mapping never changes by display grouping",()=>{
 assert.deepEqual([1,9,24,36].map(n=>tax.skills[n-1].id),[
 "architect","figure-it-out","principle-fix-root-causes","principle-separate-before-serializing-shared-state"
 ]);
 const r=numberPstackSkills(["architect","principle-fix-root-causes"],tax);
 assert.deepEqual(r.map(x=>x.number),[1,24]);
});
test("task taxonomy surfaces unsupported and ambiguous, does not guess agent",()=>{
 const r=classifyPstackIntent("แก้บั๊ก error ใน CI",tax);
 assert.equal(r.ok,true);assert.ok(r.categories.includes("DEBUG"));
 assert.equal(r.execution_state,"NOT_DISPATCHED");
 const u=classifyPstackIntent("zqlbk unknown",tax);assert.equal(u.needs_clarification,true);
 assert.equal(classifyPstackIntent("",tax).ok,false);
});
test("one Rule Stone source, Violet read-only consumer, Yellow solely authorizes",()=>{
 const rules=JSON.parse(r("config/oge95-rules-center.json"));
 assert.equal(rules.stone_rule_panel.pstack_task_taxonomy.metadata_index,"config/pstack-task-taxonomy.json");
 assert.equal(rules.stone_rule_panel.pstack_task_taxonomy.approval_gateway,false);
 const violet=r("worker/violet-stone-api.ts");
 assert.match(violet,/classifyPstackIntent/);assert.match(violet,/numberPstackSkills/);
 assert.match(violet,/pstack_numbered/);
 assert.match(violet,/YELLOW_STONE_ONLY/);
});

test("Violet category-first routing uses curated numbered defaults, not LLM guessing",()=>{
 const code=r("worker/violet-pstack-taxonomy.ts");
 assert.match(code,/choosePstackCategoryStack/);
 assert.match(code,/TASK_CATEGORY_NEEDS_CLARIFICATION/);
 const tax=JSON.parse(r("config/pstack-task-taxonomy.json"));
 for(const [category,meta] of Object.entries(tax.task_categories)){
  assert.ok(meta.recommended_workflow_numbers.length>=1);
  assert.ok(meta.recommended_principle_numbers.length>=1);
  for(const n of [...meta.recommended_workflow_numbers,...meta.recommended_principle_numbers]){
   assert.ok(tax.skills[n-1].categories.includes(category));
  }
 }
 const api=r("worker/violet-stone-api.ts");
 assert.match(api,/ruleSelection\.capability/);
 assert.match(api,/rule_selection:ruleSelection/);
 const ui=r("src/VioletDistributionPanel.tsx");
 assert.match(ui,/Task category · Rule Stone → Violet/);
 assert.match(ui,/stable_numbers/);
});
