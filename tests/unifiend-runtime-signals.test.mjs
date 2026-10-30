import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const unifiend = read("src/UnifiendNext.tsx");

test("OGE-52 derives all notification classes only from real runtime inputs", () => {
  for (const kind of ["NEW", "APPROVAL", "BLOCKED", "RESULT", "SYNCED", "DEGRADED_PROVIDER"]) {
    assert.match(unifiend, new RegExp(`kind: "${kind}"`));
  }
  assert.match(unifiend, /dashboard\.tasks/);
  assert.match(unifiend, /dashboard\.events/);
  assert.match(unifiend, /bridge\?\.cross_surface_ready === true/);
  assert.match(unifiend, /connectors/);
});

test("degraded-provider signal is restricted to explicit degraded states", () => {
  assert.match(unifiend, /\["DEGRADED", "OFFLINE", "ERROR", "FAILED"\]\.includes\(state\)/);
  assert.doesNotMatch(unifiend, /"CONFIGURATION_REQUIRED"\]\.includes\(state\)/);
});

test("sync notification requires explicit cross-surface readiness", () => {
  assert.match(unifiend, /bridge\?\.cross_surface_ready === true/);
  assert.match(unifiend, /source: "\/api\/1lss\/status"/);
  assert.doesNotMatch(unifiend, /kind: "SYNCED".*cross_surface_ready !== false/s);
});

test("notifications are deterministic deduplicated and honestly empty", () => {
  assert.match(unifiend, /const seen = new Set<string>\(\)/);
  assert.match(unifiend, /if \(seen\.has\(key\)\) return/);
  assert.match(unifiend, /Only evidence-backed state is shown\. No fake notification dots or synthetic counts\./);
  assert.match(unifiend, /No current runtime signals\./);
});

test("notification surface adds no side-effect endpoint", () => {
  const block = unifiend.slice(unifiend.indexOf("export function buildRuntimeSignals"), unifiend.indexOf("function State"));
  assert.doesNotMatch(block, /fetch\s*\(/);
  assert.doesNotMatch(block, /POST|PUT|PATCH|DELETE/);
});
