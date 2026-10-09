import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const rd=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const vio=rd("worker/violet-stone-api.ts");
const panel=rd("src/VioletDistributionPanel.tsx");
const manifest=JSON.parse(rd("config/pstack-full-catalog.json"));
test("OGE-110 Violet authoritative catalog source is complete and not executable",()=>{
 assert.equal(manifest.skill_count,51);
 assert.equal(manifest.agent_definition_count,2);
 assert.equal(manifest.owner_stone,"VIOLET_STONE_04");
 assert.equal(manifest.execution_state,"NOT_DISPATCHED");
 assert.match(vio,/pstackFullCatalog/);
 assert.match(vio,/api.get\("\/api\/violet\/pstack\/catalog"/);
 assert.match(vio,/SOURCE_AVAILABLE_NOT_RUNTIME_VERIFIED/);
 assert.match(vio,/automation_state: "INERT_SOURCE_ONLY"/);
 assert.match(vio,/execution_state: "NOT_DISPATCHED"/);
 assert.match(vio,/authority: "YELLOW_STONE_ONLY"/);
});
test("OGE-110 authenticated Violet UI displays source catalog, not instant agent execution",()=>{
 assert.match(panel,/\/api\/violet\/pstack\/catalog/);
 assert.match(panel,/aria-label="Violet pstack complete skill source"/);
 assert.match(panel,/Search installed skill source/);
 assert.match(panel,/source present ≠ Agent executed/i);
 assert.match(panel,/matchedSkills.map/);
 assert.doesNotMatch(panel,/\/add-plugin pstack/);
 assert.match(rd("AGENTS.md"),/Full portable pstack source belongs to VIOLET STONE/);
 assert.match(rd("docs/OGENIC_STONES_CANONICAL.md"),/Owner routing clarification — OGE-110 pstack/);
});
