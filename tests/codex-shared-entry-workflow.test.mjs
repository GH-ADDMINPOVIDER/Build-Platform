import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/codex-issue-runner-staging.yml', import.meta.url), 'utf8');

test('shared Codex runner uses the existing staging-only entry path', () => {
  assert.match(workflow, /branches:\s*\n\s*- phase-vi-provider-incentive-metering/);
  assert.match(workflow, /CODEX-RUN-ISSUE:\[0-9\]\+/);
  assert.match(workflow, /TASK_BRANCH="codex\/oge-\$\{issue_number\}-\$\{GITHUB_RUN_ID\}"/);
  assert.match(workflow, /CODEX_EXIT: \$\{\{ steps\.codex\.outputs\.exit_code \|\| steps\.openai_preflight\.outputs\.exit_code \}\}/);
});

test('Codex gets one existing Infisical secret and never overrides it with an empty GitHub secret', () => {
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /uses: Infisical\/secrets-action@v1\.0\.17/);
  assert.match(workflow, /secret-name: OPENAI_API_KEY/);
  assert.match(workflow, /secret-path: \/\n\s+secret-name: OPENAI_API_KEY/);
  assert.match(workflow, /include-imports: false/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /OPENAI_APPLICATION_BINDING_MISSING/);
});

test('the invocation stays isolated and the workflow does not merge or deploy', () => {
  assert.match(workflow, /git switch --create \"\$TASK_BRANCH\"/);
  assert.match(workflow, /gh pr create --draft/);
  assert.doesNotMatch(workflow, /gh pr merge/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
});
