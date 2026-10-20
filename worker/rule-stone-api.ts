import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import rules from "../config/oge95-rules-center.json";

type Env = { Bindings: AuthBindings };
const panel = rules.stone_rule_panel;

export function createRuleStoneApi() {
  const api = new Hono<Env>();
  api.use("/api/rule-stone/*", async (c,next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw,c.env)))
      return c.json({ok:false,code:"REAUTH_REQUIRED"},401);
    await next();
  });
  api.get("/api/rule-stone/panel", (c) => {
    const stones = panel.stones.map((stone) => ({
      ...stone,
      rules: stone.category_ids.map((id) => {
        const category = rules.categories[id as keyof typeof rules.categories];
        return {category_id:id,description:category?.description || "UNDEFINED"};
      }),
    }));
    const categoryCount = Object.keys(rules.categories).length;
    const coverage = new Set(stones.flatMap((stone) => stone.category_ids));
    return c.json({
      ok:true,contract:"RULE_STONE_PANEL_V1",
      source_file:"config/oge95-rules-center.json",
      schema_version:rules.schema_version,
      stone_count:stones.length,
      category_count:categoryCount,
      mapped_category_count:coverage.size,
      canonical_owner:"RULE_STONE_07",
      stones,policy_flow:panel.policy_flow,limits:panel.limits,
      precedence:rules.precedence,
      execution_authority:"YELLOW_STONE_ONLY", // legacy tool-routing identifier
      execution_authority_legacy:true,
      owner_decision_authority:rules.authority_topology.owner_decision_authority,
      yellow_stone_role:rules.authority_topology.yellow_stone_role,
      taxonomy_authority:"RULE_STONE_07",
      no_second_approval_gate:true,
      rules_updated_by:"VERSIONED_GITHUB_STAGING_ONLY",
      controls_all_seven:true,
      runtime_enforcement_claimed:false,
      readonly:true,
    },200,{"Cache-Control":"no-store"});
  });
  return api;
}
