import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const importer=read("scripts/oge-110-import-portable-pstack.mjs");
const workflow=read(".github/workflows/oge-110-violet-pstack-intake.yml");
test("OGE-110 pinned complete portable pstack source mirror, no vendor execution",()=>{
  for(const m of ["EXPECTED_SKILLS=51","EXPECTED_AGENTS=2","MIT License","IMPORTED_NOT_EXECUTED","VIOLET_STONE_04","YELLOW_STONE","INERT_SOURCE_ONLY"])assert.ok(importer.includes(m),m);
  assert.match(importer,/if \(fs\.existsSync\(dest\)/);
  assert.match(importer,/isSymbolicLink\(\)/);
  assert.match(importer,/chmodSync\(root,0o644\)/);
  assert.match(workflow,/3a604672c46cd8187d2b19980eae0a34f9f91138/);
  assert.match(workflow,/STALE_STAGING_SHA_ABORT/);
  assert.match(workflow,/branch(es)?: \[phase-vi-provider-incentive-metering\]|branches:\s*\[phase-vi-provider-incentive-metering\]/);
  assert.match(workflow,/git add -- \.agents\/skills third_party\/pstack-portable config\/pstack-full-catalog\.json/);
  assert.doesNotMatch(workflow,/npm run.*pstack|npm install.*pstack|wrangler deploy|d1 migrations/i);
});
test("OGE-110 vendor catalog requires real source import, cannot fake successful execution",()=>{
  if(!fs.existsSync(new URL("../config/pstack-full-catalog.json",import.meta.url)))return;
  const m=JSON.parse(read("config/pstack-full-catalog.json"));
  assert.equal(m.owner_stone,"VIOLET_STONE_04");
  assert.equal(m.authority_stone,"YELLOW_STONE");
  assert.equal(m.skill_count,51);
  assert.equal(m.agent_definition_count,2);
  assert.equal(m.execution_state,"NOT_DISPATCHED");
  assert.equal(m.full_native_cursor_plugin_installed,false);
  for(const s of m.skills)assert.ok(fs.existsSync(new URL("../"+s.agent_skill_path,import.meta.url)),s.id);
});
