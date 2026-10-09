import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const rules=JSON.parse(read("config/oge95-rules-center.json"));
const stones=rules.stone_rule_panel.stones;
const api=read("worker/rule-stone-api.ts");
const entry=read("worker/entry-yellow-stone.ts");
const ui=read("src/StoneRulePanel.tsx");
const view=read("src/WaveNext.tsx");
const shell=read("src/main.tsx");

test("Rule Stone #07 owns one rules registry with exact seven locked names",()=>{
  assert.equal(stones.length,7);
  assert.deepEqual(stones.map(x=>x.name),[
    "GREEN STONE","YELLOW STONE","BLUE DIAMOND","VIOLET STONE",
    "RUBY STONE","STONE RUNNER","RULE STONE",
  ]);
  assert.equal(rules.stone_rule_panel.canonical_owner,"RULE_STONE_07");
  assert.equal(rules.stone_rule_panel.yellow_only_exec_authority,true);
  assert.equal(rules.stone_rule_panel.separate_approval_gateway,false);
});
test("Every stone has meaningful mapped canonical rule categories; no duplicate center",()=>{
  const categories=Object.keys(rules.categories);
  const found=new Set();
  for(const s of stones){
    assert.ok(s.category_ids.length>=2);
    for(const category of s.category_ids){
      assert.ok(categories.includes(category));
      found.add(category);
    }
  }
  assert.equal(found.size,categories.length);
  assert.equal(rules.canonical_paths.policy_file,"config/oge95-rules-center.json");
  assert.equal(rules.operator_focus.rule_stone,"TAXONOMY_NOT_SECOND_GATE");
});
test("Owner-authenticated panel is read-only and does not bypass Yellow",()=>{
  assert.match(api,/hasOwnerOrOpsAccess/);
  assert.match(api,/REAUTH_REQUIRED/);
  assert.match(api,/GET|api\.get/);
  assert.match(api,/\.get\("\/api\/rule-stone\/panel"/);
  assert.doesNotMatch(api,/\.post\(|\.put\(|\.delete\(/);
  assert.match(api,/runtime_enforcement_claimed:false/);
  assert.match(api,/execution_authority:"YELLOW_STONE_ONLY"/);
  assert.match(entry,/createRuleStoneApi/);
  assert.match(entry,/pathname\.startsWith\("\/api\/rule-stone\/"\)/);
});
test("Rule Stone Panel visible in WAVE tabs, fails closed on missing policy",()=>{
  assert.match(view,/StoneRulePanel/);
  assert.match(view,/tab === "rules"/);
  assert.match(view,/"rules" \| "session"/);
  assert.match(shell,/stone-rule-panel\.css/);
  assert.match(ui,/STONE_REGISTRY_MISMATCH/);
  assert.match(ui,/rules_updated_by|source_file/);
});

test("Stone Runner host and locked stone colors match canonical staging architecture",()=>{
  assert.equal(rules.categories["06_replica_compute"].host,"SELF_HOSTED_WAVE_RUNNER_01");
  assert.equal(rules.runtime_contracts.replica.job_host,"self-hosted/linux/x64/wave");
  assert.equal(rules.runtime_contracts.replica.cost_policy.uses_existing_github_hosted_allowance,false);
  assert.equal(stones[0].color,"#16A34A");
  assert.equal(stones[6].color,"#6B7280");
  assert.equal(rules.stone_rule_panel.separate_approval_gateway,false);
  assert.equal(rules.stone_rule_panel.yellow_only_exec_authority,true);
});
