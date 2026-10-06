import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const wave = read("src/WaveNext.tsx");
const css = read("src/wave-next.css");
const violet = read("worker/violet-stone-api.ts");
const dashboard = read("worker/app-api.ts");

test("OGE-46 uses authenticated dashboard and Violet telemetry sources", () => {
  assert.match(wave, /fetch\("\/api\/dashboard"/);
  assert.match(wave, /fetch\("\/api\/violet\/status"/);
  assert.match(dashboard, /incentives,/);
  assert.match(violet, /success_rate/);
  assert.match(violet, /accuracy_sample_size/);
});

test("capacity percentages render only when measurable", () => {
  assert.match(wave, /function percentValue/);
  assert.match(wave, /percent === null \? "NOT_MEASURED"/);
  assert.match(wave, /No verified measurable quota source is bound/);
  assert.match(wave, /Availability only · not token quota/);
  assert.doesNotMatch(wave, /Success 92%|Accuracy 88%|Capacity 34%/);
});

test("only real Violet agents are rendered, with no fabricated five-agent deck", () => {
  assert.match(wave, /\(violet\.agents \?\? \[\]\)\.map/);
  assert.match(violet, /OpenAI • Agent • CEO/);
  assert.match(violet, /Codex • Agent • CTO/);
  assert.match(violet, /Manus • Agent • COO/);
  assert.doesNotMatch(wave, /TEAM_5|five agents|5 agents/i);
});

test("agent cards expose evidence-backed Success and Accuracy plus jobs", () => {
  assert.match(wave, /label="Success"/);
  assert.match(wave, /label="Accuracy"/);
  assert.match(wave, /accuracy_state === "MEASURED"/);
  assert.match(wave, /Jobs \{formatCount\(agent\.stats\?\.jobs_assigned\)\}/);
  assert.match(wave, /Blocked \{formatCount\(agent\.stats\?\.blocked\)\}/);
});

test("status deck is compact and mobile stacked", () => {
  assert.match(css, /\.wnStatusGrid/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:760px\)\{\.wnStatusGrid\{grid-template-columns:1fr\}/);
});
