import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const api=readFileSync("worker/unified-ops-api.ts","utf8");
const entry=readFileSync("worker/entry-yellow-stone.ts","utf8");
const dashboard=readFileSync("src/WaveDashboard.tsx","utf8");
const panel=readFileSync("src/UnifiedOpsPanel.tsx","utf8");
const css=readFileSync("src/unified-ops.css","utf8");
const main=readFileSync("src/main.tsx","utf8");

test("GH2 + Codex + Infisical unified mode may dynamically pick solo/dual/triple",()=>{
 assert.match(api,/export function selectOpsLane/);
 for(const x of ['"auto"','"solo"','"dual"','"triple"'])assert.ok(api.includes(x));
 assert.match(api,/selected:picked/);
 assert.match(api,/can_execute:false/);
 assert.match(panel,/\["auto","solo","dual","triple"\]/);
 assert.match(panel,/role="group"/);
});

test("Owner and ATHENA authorization cannot be skipped by showing all capabilities",()=>{
 assert.match(api,/hasOwnerSession\(c\.req\.raw,c\.env\)/);
 assert.match(api,/OWNER_SESSION_REQUIRED/);
 assert.match(api,/ORIGIN_DENIED/);
 assert.match(api,/execution:\{status:"NOT_STARTED",allowed:false/);
 assert.match(api,/GH2_OCIAN_RUNTIME_UNVERIFIED/);
 assert.match(api,/OWNER_ATHENA_PREEXEC_REQUIRED/);
 assert.match(entry,/pathname\.startsWith\("\/api\/ops\/"\)/);
 assert.match(entry,/unifiedOpsApi\.fetch/);
 assert.doesNotMatch(api,/sudo -n|StrictHostKeyChecking=no|allowAllCommands/i);
});

test("Canonical D1 read-only timeline has bounded event/Task limits and exposes no external_ref",()=>{
 assert.match(api,/FROM agent_tasks ORDER BY updated_at DESC LIMIT 18/);
 assert.match(api,/FROM agent_events ORDER BY created_at DESC LIMIT 28/);
 assert.doesNotMatch(api,/SELECT \*/);
 assert.doesNotMatch(api,/external_ref/);
 assert.match(api,/Cache-Control/);
});

test("Dashboard shows auto-refresh timeline, Owner sign in, visible status and safe plan",()=>{
 assert.match(main,/import "\.\/unified-ops\.css"/);
 assert.match(dashboard,/import UnifiedOpsPanel/);
 assert.match(dashboard,/<UnifiedOpsPanel \/>/);
 assert.match(dashboard,/type="password"/);
 assert.match(dashboard,/\/api\/session/);
 assert.match(panel,/\/api\/ops\/status/);
 assert.match(panel,/\/api\/ops\/plan/);
 assert.match(panel,/15000/);
 assert.match(panel,/document\.visibilityState==="visible"/);
 assert.match(panel,/Full 7\/7 E2E: NOT VERIFIED/);
 assert.match(css,/@media\(max-width:760px\)/);
});
