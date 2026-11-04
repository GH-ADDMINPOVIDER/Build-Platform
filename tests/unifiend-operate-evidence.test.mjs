import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const unifiend = read("src/UnifiendNext.tsx");
const app = read("worker/app-api.ts");

test("OGE-50 reuses protected canonical dashboard data without new schema", () => {
  assert.match(app, /api\.use\("\/api\/dashboard", requireProtectedAppRoute\)/);
  assert.match(app, /FROM agent_tasks/);
  assert.match(app, /FROM runs/);
  assert.match(app, /FROM agent_events/);
  assert.doesNotMatch(unifiend, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("Operate renders evidence-backed jobs and recent executions", () => {
  assert.match(unifiend, /dashboard\.tasks/);
  assert.match(unifiend, /Current task queue/);
  assert.match(unifiend, /dashboard\.runs/);
  assert.match(unifiend, /Recent execution/);
  assert.match(unifiend, /Canonical D1 runs/);
  assert.match(unifiend, /redacted error available/);
});

test("history renders safe event references only", () => {
  assert.match(unifiend, /dashboard\.events/);
  assert.match(unifiend, /Recent runtime events/);
  assert.match(unifiend, /safeExternalHref/);
  assert.match(unifiend, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(unifiend, /Open reference ↗/);
  assert.match(unifiend, /No event\/evidence references returned/);
});

test("surface does not invent terminal deploy or checkpoint success", () => {
  assert.doesNotMatch(unifiend, /TERMINAL_READY|DEPLOY_READY|CHECKPOINT_VERIFIED/);
  assert.match(unifiend, /No task rows returned by canonical D1/);
  assert.match(unifiend, /No execution history returned/);
});
