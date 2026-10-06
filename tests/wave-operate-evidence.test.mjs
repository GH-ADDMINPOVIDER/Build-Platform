import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const wave = read("src/WaveNext.tsx");
const app = read("worker/app-api.ts");

test("OGE-50 reuses protected canonical dashboard data without new schema", () => {
  assert.match(app, /api\.use\("\/api\/dashboard", requireProtectedAppRoute\)/);
  assert.match(app, /FROM agent_tasks/);
  assert.match(app, /FROM runs/);
  assert.match(app, /FROM agent_events/);
  assert.doesNotMatch(wave, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("Operate renders evidence-backed jobs and recent executions", () => {
  assert.match(wave, /dashboard\.tasks/);
  assert.match(wave, /Current task queue/);
  assert.match(wave, /dashboard\.runs/);
  assert.match(wave, /Recent execution/);
  assert.match(wave, /Canonical D1 runs/);
  assert.match(wave, /redacted error available/);
});

test("history renders safe event references only", () => {
  assert.match(wave, /dashboard\.events/);
  assert.match(wave, /Recent runtime events/);
  assert.match(wave, /safeExternalHref/);
  assert.match(wave, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(wave, /Open reference ↗/);
  assert.match(wave, /No event\/evidence references returned/);
});

test("surface does not invent terminal deploy or checkpoint success", () => {
  assert.doesNotMatch(wave, /TERMINAL_READY|DEPLOY_READY|CHECKPOINT_VERIFIED/);
  assert.match(wave, /No task rows returned by canonical D1/);
  assert.match(wave, /No execution history returned/);
});
