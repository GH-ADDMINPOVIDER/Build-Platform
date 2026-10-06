import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const contracts = read("packages/maop-core/src/contracts.ts");
const runtime = read("packages/maop-core/src/runtime.ts");
const adapter = read("packages/maop-core/src/reference-adapter.ts");
const githubBridge = read("packages/maop-github-harness/src/bridge.ts");

test("OGE-49 MA-OP core defines protocol primitives and lifecycle", () => {
  for (const marker of [
    "MaopActor", "MaopCapability", "MaopCredentialRef", "MaopTask",
    "MaopEvidence", "MaopResult", "DISCOVER", "ADMIT", "CHECK_READINESS",
    "CHECK_COST", "CHECK_POLICY", "SELECT_ROUTE", "APPROVE_IF_REQUIRED",
    "OPERATE", "VERIFY", "RETAIN",
  ]) assert.match(contracts, new RegExp(marker));
});

test("reference runtime requires Yellow and Ruby and has no direct provider transport", () => {
  assert.match(runtime, /YELLOW_BINDING_REQUIRED/);
  assert.match(runtime, /RUBY_BINDING_REQUIRED/);
  assert.match(runtime, /yellow_authorize/);
  assert.match(runtime, /ruby_verify/);
  assert.doesNotMatch(runtime, /api\.github\.com|api\.openai\.com|api\.anthropic\.com|api\.perplexity\.ai/);
  assert.doesNotMatch(runtime, /fetch\s*\(/);
});

test("reference adapter is local READ-only and sanitizes secret-like fields", () => {
  assert.match(adapter, /REFERENCE_ADAPTER_READ_ONLY/);
  assert.match(adapter, /local_fixture: true/);
  assert.match(adapter, /REDACTED/);
  assert.doesNotMatch(adapter, /fetch\s*\(/);
});

test("existing OGE-43 GitHub live bridge remains Yellow-only", () => {
  assert.match(githubBridge, /executeYellow/);
  assert.match(githubBridge, /verifyRuby/);
  assert.doesNotMatch(githubBridge, /api\.github\.com/);
  assert.doesNotMatch(githubBridge, /Authorization/);
  assert.doesNotMatch(githubBridge, /fetch\s*\(/);
});
