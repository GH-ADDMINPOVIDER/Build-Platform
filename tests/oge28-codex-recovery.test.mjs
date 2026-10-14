import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/codex-issue-runner.yml', import.meta.url), 'utf8');

test('legacy executor never checks out main for provider execution', () => {
  assert.match(workflow, /ref: phase-vi-provider-incentive-metering/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /git switch --create "\$TASK_BRANCH"/);
  assert.match(workflow, /github\.actor == 'Ogenicchocolate21debug'/);
});

test('Codex CLI invocation uses a supported sandboxed command and local account, not another account key', () => {
  assert.doesNotMatch(workflow, /codex exec --full-auto/);
  assert.match(workflow, /codex exec --sandbox workspace-write - < "\$RUNNER_TEMP\/codex-task\.md"/);
  assert.match(workflow, /env -u OPENAI_API_KEY -u CODEX_API_KEY/);
  assert.match(workflow, /GH_TOKEN: ""/);
  assert.match(workflow, /GITHUB_TOKEN: ""/);
});

test('provider usage limit is distinguishable from environment and authentication failures', () => {
  assert.match(workflow, /CODEX_USAGE_LIMIT_RETRY_AFTER_RESET/);
  assert.match(workflow, /CODEX_AUTH_REQUIRED/);
  assert.match(workflow, /CODEX_EXECUTION_FAILED/);
  assert.match(workflow, /Codex exit code: \$rc/);
  assert.match(workflow, /Codex provider status: \$CLASSIFICATION/);
});

test('operator does not silently deploy, mutate secrets, or mark exhausted inference successful', () => {
  assert.doesNotMatch(workflow, /(?:wrangler deploy|gh pr merge|git push origin HEAD:main|git push origin main)/);
  assert.match(workflow, /exit "\$rc"/);
  assert.match(workflow, /Do not commit, push or open a PR from within Codex/);
});
