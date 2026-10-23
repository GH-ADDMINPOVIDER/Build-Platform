import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const policy = JSON.parse(fs.readFileSync("config/owner-runtime-labels.json", "utf8"));
const dispatch = fs.readFileSync("worker/wave-command-dispatch.ts","utf8");
test("exactly one operational GitHub provider is GH-2 Addmin Provider", () => {
  assert.equal(policy.active_provider.label, "GH-2 Addmin Provider");
  assert.equal(policy.active_provider.role, "SOLE_OPERATIONAL_GITHUB_PROVIDER");
  assert.equal(policy.active_provider.technical_repo, "Wave-Runner-2/Build-Platform");
  assert.ok(!Array.isArray(policy.active_providers));
});
test("old Github is store and forbidden as runtime executor", () => {
  assert.equal(policy.archive_store.label, "store");
  assert.equal(policy.archive_store.can_receive_new_commands,false);
  assert.equal(policy.archive_store.can_be_runtime_executor,false);
  assert.match(dispatch, /repos\/Wave-Runner-2\/Build-Platform\/actions\/workflows\/wave-command-consumer\.yml/);
  assert.doesNotMatch(dispatch, /repos\/Ogenicchocolate21debug\/Build-Platform\/actions\/workflows/);
});
test("Codex is on OCIAN; frozen display names do not override required technical IDs", () => {
  assert.equal(policy.active_provider.execution_host, "OCIAN-S-Host");
  assert.equal(policy.active_provider.codex_executor, "Codex S-Host");
  assert.equal(policy.active_provider.github_runner_service, "wave-runner-01");
  assert.equal(policy.active_provider.codex_profile_path, "/home/wave/.codex");
  assert.ok(policy.frozen_legacy_display_aliases.includes("GH-runner-1"));
  assert.ok(policy.frozen_legacy_display_aliases.includes("GH-1"));
});
