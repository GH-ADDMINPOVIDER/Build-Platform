import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const wave = read("src/WaveNext.tsx");

test("OGE-52 derives all notification classes only from real runtime inputs", () => {
  for (const kind of ["NEW", "APPROVAL", "BLOCKED", "RESULT", "SYNCED", "DEGRADED_PROVIDER"]) {
    assert.match(wave, new RegExp(`kind: "${kind}"`));
  }
  assert.match(wave, /dashboard\.tasks/);
  assert.match(wave, /dashboard\.events/);
  assert.match(wave, /bridge\?\.cross_surface_ready === true/);
  assert.match(wave, /connectors/);
});

test("degraded-provider signal is restricted to explicit degraded states", () => {
  assert.match(wave, /\["DEGRADED", "OFFLINE", "ERROR", "FAILED"\]\.includes\(state\)/);
  assert.doesNotMatch(wave, /"CONFIGURATION_REQUIRED"\]\.includes\(state\)/);
});

test("sync notification requires explicit cross-surface readiness", () => {
  assert.match(wave, /bridge\?\.cross_surface_ready === true/);
  assert.match(wave, /source: "\/api\/1lss\/status"/);
  assert.doesNotMatch(wave, /kind: "SYNCED".*cross_surface_ready !== false/s);
});

test("notifications are deterministic deduplicated and honestly empty", () => {
  assert.match(wave, /const seen = new Set<string>\(\)/);
  assert.match(wave, /if \(seen\.has\(key\)\) return/);
  assert.match(wave, /Only evidence-backed state is shown\. No fake notification dots or synthetic counts\./);
  assert.match(wave, /No current runtime signals\./);
});

test("notification surface adds no side-effect endpoint", () => {
  const block = wave.slice(wave.indexOf("export function buildRuntimeSignals"), wave.indexOf("function State"));
  assert.doesNotMatch(block, /fetch\s*\(/);
  assert.doesNotMatch(block, /POST|PUT|PATCH|DELETE/);
});
