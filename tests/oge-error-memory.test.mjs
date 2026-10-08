import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

const catalog = JSON.parse(readFileSync("config/oge-error-memory.json", "utf8"));
const api = readFileSync("worker/knowledge-refinery-api.ts", "utf8");
const lookup = readFileSync("worker/oge-error-memory.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");

function check(...args) {
  return JSON.parse(execFileSync(process.execPath, ["scripts/oge-incident-memory.mjs", "lookup", ...args], { encoding: "utf8" }));
}

test("Incident notebook stores issue-specific evidence without inventing fixes", () => {
  assert.equal(catalog.schema_version, "OGE_INCIDENT_MEMORY_V1");
  assert.equal(catalog.rules.no_new_d1_schema, true);
  assert.ok(catalog.incidents.length >= 3);
  assert.ok(catalog.incidents.find(c => c.issues.includes("OGE-67") && c.status === "FIX_VERIFIED" && c.confidence === "CONFIRMED"));
  assert.ok(catalog.incidents.find(c => c.issues.includes("OGE-35") && c.confidence === "HYPOTHESIS"));
  assert.ok(catalog.incidents.every(c => c.evidence.length && c.diagnostic_steps.length && c.next_action));
});

test("OGE-67 nested 409 maps to actual resolved fix, not generic approval error", () => {
  const result = check("--oge","OGE-67","--http","409","--code","RESOLVER_UNAVAILABLE","--component","maop");
  assert.equal(result.matched,true);
  assert.equal(result.incident.id,"OGE-67-GITHUB-READ-409");
  assert.equal(result.incident.confidence,"CONFIRMED");
});

test("OGE-35 and 36 404 diagnosis remains unproven and must not auto-promote deploy", () => {
  for (const issue of ["OGE-35","OGE-36"]) {
    const result=check("--oge",issue,"--http","404");
    assert.equal(result.matched,true);
    assert.equal(result.incident.confidence,"HYPOTHESIS");
    assert.match(result.incident.guardrail,/Do not enable production deploy/);
  }
});

test("Same HTTP code for OGE-10 or without issue cannot produce wrong diagnosis", () => {
  assert.equal(check("--oge","OGE-10","--http","404").matched,false);
  assert.equal(check("--http","404").matched,false);
  assert.equal(check("--oge","OGE-35","--http","409").matched,false);
  assert.equal(check("--oge","OGE-78","--code","DEPENDENCY_LOCKFILE_NOT_FOUND").matched,true);
});

test("No authorization bypass, auto diagnosis writes, extra API gate or model calls", () => {
  assert.match(api,/hasOwnerOrOpsAccess/);
  assert.match(api,/api\.get\("\/api\/knowledge-refinery\/incident"/);
  assert.match(api,/lookupOgeIncident/);
  assert.match(lookup,/DIAGNOSTIC_ONLY_NEVER_EXECUTION_APPROVAL/);
  assert.match(lookup,/if \(!issue && !code && !component\)/);
  assert.match(entry,/pathname\.startsWith\("\/api\/knowledge-refinery\/"/);
  assert.doesNotMatch(api,/api\.post\("\/api\/knowledge-refinery\/incident/);
});
