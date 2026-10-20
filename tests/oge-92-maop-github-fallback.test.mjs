import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resolver = readFileSync("worker/capability-resolver-api.ts", "utf8");
const executor = readFileSync("worker/capability-execution-api.ts", "utf8");
const maop = readFileSync("worker/maop-lab-api.ts", "utf8");

test("OGE-92 allows only the existing GitHub read_file compatibility fallback with a populated provider_capabilities table", () => {
  assert.match(resolver, /FROM compatibility_map AS compat/);
  assert.match(resolver, /compat\.provider_id = 'github'/);
  assert.match(resolver, /compat\.capability_id = 'read_file'/);
  assert.match(resolver, /NOT EXISTS \(\s*SELECT 1 FROM provider_capabilities AS explicit/);
  assert.match(resolver, /explicit\.provider_id = compat\.provider_id/);
  assert.match(resolver, /explicit\.capability_id = compat\.capability_id/);
  assert.match(resolver, /JOIN capabilities c ON c\.id = pc\.capability_id/);
  assert.match(resolver, /JOIN providers p ON p\.id = pc\.provider_id/);
  assert.match(resolver, /LEFT JOIN provider_bindings b ON b\.provider_id = p\.id/);
});

test("OGE-92 does not promote disabled permission classes or bypass Yellow auth and Green verification", () => {
  assert.match(executor, /hasOwnerOrOpsAccess/);
  assert.match(executor, /descriptor\.permission_class !== "READ"/);
  assert.match(executor, /hasOwnerSession/);
  assert.match(executor, /NO_IMPLEMENTED_NON_READ_ADAPTER/);
  assert.match(executor, /appendCanonicalEvidence/);
  assert.match(maop, /createCapabilityExecutionApi/);
  assert.match(maop, /provider: "github"/);
  assert.match(maop, /retention_eligible remains false/);
});
