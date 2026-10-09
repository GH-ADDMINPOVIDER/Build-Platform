import {readFileSync,writeFileSync} from "node:fs";
import assert from "node:assert/strict";

const read=(path)=>readFileSync(path,"utf8");
const rules=JSON.parse(read("config/oge95-rules-center.json"));
const panel=rules.stone_rule_panel;
const src={
  green:read("worker/unified-chat-api.ts"),
  yellow:read("worker/entry-yellow-stone.ts"),
  blue:read("worker/blue-diamond-registry.ts"),
  violet:read("worker/violet-stone-api.ts"),
  ruby:read("worker/ruby-stone-api.ts"),
  runner:read("scripts/replica-runner/verify.mjs"),
  rule:read("worker/rule-stone-api.ts"),
};
const checks=[
  ["canonical_registry",rules.canonical_paths.policy_file==="config/oge95-rules-center.json"],
  ["seven_locked_stones",panel.stones.length===7],
  ["all_categories_covered",Object.keys(rules.categories).every(id=>panel.stones.some(s=>s.category_ids.includes(id)))],
  ["green_owns_1lss",src.green.includes("owner-main")&&src.green.includes("1LSS_OWNER_MAIN")],
  ["yellow_runs_tools",src.yellow.includes("createCapabilityExecutionApi")&&src.yellow.includes("/api/capabilities/execute")],
  ["blue_owns_registry",src.blue.includes("buildBlueDiamondRegistry")&&src.blue.includes("actor_id")],
  ["violet_reads_blue",src.violet.includes("buildBlueDiamondRegistry")&&src.violet.includes("planVioletDistribution")],
  ["violet_no_yellow_bypass",src.violet.includes('execution_authority:"YELLOW_STONE_ONLY"')&&src.violet.includes("execution_dispatched:false")],
  ["ruby_still_verifies",src.ruby.includes("RUBY")&&src.ruby.includes("RUBY_EVAL")],
  ["runner_is_isolated",src.runner.includes("LOCAL_")&&src.runner.includes("local_db_only")],
  ["rule_reads_single_source",src.rule.includes('../config/oge95-rules-center.json')&&src.rule.includes("hasOwnerOrOpsAccess")],
  ["rule_never_second_approval",panel.separate_approval_gateway===false&&panel.yellow_only_exec_authority===true],
  ["no_remote_schema_edits",panel.limits.remote_schema_change===false],
  ["no_unapproved_paid_auto_dispatch",panel.limits.unapproved_paid_auto_dispatch===false],
];
const failed=checks.filter(([,passed])=>!passed).map(([id])=>id);
const receipt={
  schema_version:"RULE_STONE_SEVEN_STONE_GOVERNANCE_AUDIT_V1",
  source_sha:process.env.GITHUB_SHA||"local",
  branch:process.env.GITHUB_REF_NAME||"local",
  canonical_file:"config/oge95-rules-center.json",
  rule_stone:7,stones:7,
  checks:checks.map(([id,passed])=>({id,passed})),
  passed:checks.length-failed.length,failed,
  result:failed.length?"FAIL":"PASS",
  runtime_side_effects:0,
  independent_semantic_reviewer:false,
  runtime_authority:"YELLOW_STONE_ONLY",
};
writeFileSync("rule-stone-governance-evidence.json",JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({result:receipt.result,passed:receipt.passed,total:checks.length,
  failed,evidence:"rule-stone-governance-evidence.json"}));
if(failed.length)process.exitCode=1;
