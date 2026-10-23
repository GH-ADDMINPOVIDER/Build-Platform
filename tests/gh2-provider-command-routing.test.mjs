import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Static, non-runtime regression guards for the Owner's GH2 self-host command route.
// GH1 is a historical proof store only. These tests do not perform network calls.
const read = (path) => fs.readFileSync(path, "utf8");
const dispatch = read("worker/wave-command-dispatch.ts");
const entry = read("worker/entry-yellow-stone.ts");
const selfhost = read("worker/openai-selfhost-api.ts");
const consumer = read(".github/workflows/wave-command-consumer.yml");
const executor = read(".github/workflows/wave-openai-selfhost-executor.yml");

test("WAVE owner command dispatch uses GH2 operational repo, never GH1", () => {
  assert.match(dispatch, /api\.github\.com\/repos\/Wave-Runner-2\/Build-Platform\/actions\/workflows\/wave-command-consumer\.yml\/dispatches/);
  assert.doesNotMatch(dispatch, /api\.github\.com\/repos\/Ogenicchocolate21debug\/Build-Platform/);
  assert.match(dispatch, /ref: "phase-vi-provider-incentive-metering"/);
});

test("new owner command tasks target GH2 and historical GH1 receipts remain readable", () => {
  assert.match(entry, /'Wave-Runner-2\/Build-Platform', 'owner-main\/1LSS_OWNER_MAIN'/);
  assert.match(entry, /https:\/\/github\.com\/Wave-Runner-2\/Build-Platform\/actions\/workflows\/wave-command-consumer\.yml/);
  assert.match(entry, /\(\?:Ogenicchocolate21debug\|Wave-Runner-2\)/);
  assert.match(entry, /COMMAND_RESULT_DONE/);
});

test("Codex self-host default dispatch repo is GH2 without changing original task scope", () => {
  assert.match(selfhost, /const DEFAULT_REPOSITORY = "Wave-Runner-2\/Build-Platform";/);
  assert.match(selfhost, /const CANONICAL_STAGING_BRANCH = "phase-vi-provider-incentive-metering";/);
});

test("GitHub Actions validates the runner name, not the Linux hostname", () => {
  for (const workflow of [consumer, executor]) {
    assert.match(workflow, /github\.repository == 'Wave-Runner-2\/Build-Platform'/);
    assert.match(workflow, /\$RUNNER_NAME/);
    assert.doesNotMatch(workflow, /\$\(hostname\)/);
    assert.match(workflow, /runs-on: \[self-hosted, linux, x64, wave\]/);
  }
});

test("command consumer remains bounded and reads secrets through existing OIDC", () => {
  assert.match(consumer, /Infisical\/secrets-action@v1\.0\.9/);
  assert.match(consumer, /bash scripts\/wave-terminal-solo\.sh/);
  assert.match(consumer, /permissions:/);
  assert.doesNotMatch(consumer, /sudo/);
});
