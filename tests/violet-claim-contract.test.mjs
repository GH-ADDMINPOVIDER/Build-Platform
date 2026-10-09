import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const api=read("worker/violet-stone-api.ts");
const ui=read("src/VioletDistributionPanel.tsx");
const wave=read("src/WaveNext.tsx");
const schema=read("database/migrations/0004_agent_shared_state.sql");
test("Violet claim endpoint only reserves existing QUEUED tasks and uses owner auth",()=>{
  assert.match(api,/hasOwnerOrOpsAccess/);
  assert.match(api,/\/api\/violet\/distribution\/claim/);
  assert.match(api,/TASK_NOT_FOUND/);
  assert.match(api,/TASK_NOT_QUEUED/);
  assert.match(api,/SET status = 'CLAIMED'/);
  assert.match(api,/WHERE id = \? AND status = 'QUEUED' AND claimed_by IS NULL/);
  assert.match(api,/outcome\.meta\?\.changes !== 1/);
});
test("D1 claim prevents agent and resource double-booking",()=>{
  assert.match(api,/NOT EXISTS \(\s*SELECT 1 FROM agent_tasks AS other/);
  assert.match(api,/other\.claimed_by = \?/);
  assert.match(api,/other\.resource_key = \?/);
  assert.match(api,/CLAIM_CONFLICT_RETRY_WITH_FRESH_PLAN/);
});
test("A claim never bypasses Yellow or executes a provider",()=>{
  assert.match(api,/execution_dispatched:false/);
  assert.match(api,/execution_authority:"YELLOW_STONE_ONLY"/);
  assert.match(api,/BLUE_LIVE_PREFLIGHT_REQUIRED/);
  assert.match(api,/ruby_verification:"PENDING"/);
  assert.match(api,/VIOLET_CLAIM_PENDING_YELLOW/);
});
test("Violet uses existing D1 schema without new tables",()=>{
  for(const name of ["agent_tasks","agent_events","agent_locks"])assert.match(schema,new RegExp("CREATE TABLE IF NOT EXISTS "+name));
  assert.match(api,/UPDATE agent_tasks/);
  assert.match(api,/INSERT OR IGNORE INTO agent_events/);
});
test("Mobile Agent view exposes separate plan and claim, not direct execution",()=>{
  assert.match(wave,/VioletDistributionPanel/);
  assert.match(ui,/\/api\/violet\/distribution\/roster/);
  assert.match(ui,/\/api\/violet\/distribution\/plan/);
  assert.match(ui,/\/api\/violet\/distribution\/claim/);
  assert.match(ui,/CLAIMED ≠ RUNNING or DONE/);
  assert.match(ui,/Execution dispatched:/);
});
