import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const contract = fs.readFileSync("worker/wave-command-contract.ts", "utf8");
const entry = fs.readFileSync("worker/entry-yellow-stone.ts", "utf8");

test("autonomous WAVE command has one normalized contract", () => {
  assert.match(contract, /body\.command \?\? body\.intent/);
  assert.match(contract, /"autonomous"/);
  assert.match(contract, /environment: "staging"/);
  assert.match(contract, /explicit_structured/);
});

test("autonomous command remains Yellow-controlled and canonical", () => {
  assert.match(contract, /execution_authority: "YELLOW_STONE_ONLY"/); // backward compatible tool route
  assert.match(contract, /owner_decision_authority: "SIGNED_OWNER_SESSION"/);
  assert.match(contract, /yellow_stone_role: "TOOLS_ADAPTER_ONLY"/);
  assert.match(entry, /owner_decision_authority: "SIGNED_OWNER_SESSION"/);
  assert.match(contract, /owner-main \/ 1LSS_OWNER_MAIN/);
  assert.match(contract, /direct_execution_bypass: false/);
  assert.match(entry, /normalizeWaveCommandBody/);
  assert.match(entry, /waveCommandPolicy/);
});

test("command contract rejects arbitrary URLs, secrets and non-staging scope", () => {
  assert.match(contract, /SECRET_LIKE_INPUT_REJECTED/);
  assert.match(contract, /ENVIRONMENT_SCOPE_MISMATCH/);
  assert.match(contract, /URL_LIKE/);
});
