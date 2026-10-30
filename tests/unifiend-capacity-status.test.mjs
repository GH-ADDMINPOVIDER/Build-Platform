import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const unifiend = read("src/UnifiendNext.tsx");
const css = read("src/unifiend-next.css");
const violet = read("worker/violet-stone-api.ts");
const dashboard = read("worker/app-api.ts");

test("OGE-46 uses authenticated dashboard and Violet telemetry sources", () => {
  assert.match(unifiend, /fetch\("\/api\/dashboard"/);
  assert.match(unifiend, /fetch\("\/api\/violet\/status"/);
  assert.match(dashboard, /incentives,/);
  assert.match(violet, /success_rate/);
  assert.match(violet, /accuracy_sample_size/);
});

test("capacity percentages render only when measurable", () => {
  assert.match(unifiend, /function percentValue/);
  assert.match(unifiend, /percent === null \? "NOT_MEASURED"/);
  assert.match(unifiend, /No verified measurable quota source is bound/);
  assert.match(unifiend, /Availability only · not token quota/);
  assert.doesNotMatch(unifiend, /Success 92%|Accuracy 88%|Capacity 34%/);
});

test("only real Violet agents are rendered, with no fabricated five-agent deck", () => {
  assert.match(unifiend, /\(violet\.agents \?\? \[\]\)\.map/);
  assert.match(violet, /OpenAI • Agent • CEO/);
  assert.match(violet, /Codex • Agent • CTO/);
  assert.match(violet, /Manus • Agent • COO/);
  assert.doesNotMatch(unifiend, /TEAM_5|five agents|5 agents/i);
});

test("agent cards expose evidence-backed Success and Accuracy plus jobs", () => {
  assert.match(unifiend, /label="Success"/);
  assert.match(unifiend, /label="Accuracy"/);
  assert.match(unifiend, /accuracy_state === "MEASURED"/);
  assert.match(unifiend, /Jobs \{formatCount\(agent\.stats\?\.jobs_assigned\)\}/);
  assert.match(unifiend, /Blocked \{formatCount\(agent\.stats\?\.blocked\)\}/);
});

test("status deck is compact and mobile stacked", () => {
  assert.match(css, /\.wnStatusGrid/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:760px\)\{\.wnStatusGrid\{grid-template-columns:1fr\}/);
});
