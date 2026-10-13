import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/codex-issue-runner-staging.yml', import.meta.url), 'utf8');

test('shared entry requires dispatch on exact staging ref and authenticates before binding', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  (push|issue_comment|pull_request_target):/m);
  assert.match(workflow, /github.ref == 'refs\/heads\/phase-vi-provider-incentive-metering'/);
  assert.match(workflow, /confirm_bounded_task:/);
  assert.match(workflow, /vars.CODEX_AUTHORIZED_ACTOR_IDS/);
  assert.match(workflow, /admitRequest/);
  assert.ok(workflow.indexOf('admitRequest') < workflow.indexOf('uses: Infisical/'));
  assert.match(workflow, /codex-check-in-/);
  assert.match(workflow, /codex-check-out-/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('Codex gets one existing Infisical secret and never overrides it with an empty GitHub secret', () => {
  assert.match(workflow, /id: contract/);
  assert.match(workflow, /steps\.contract\.outcome == 'success'/);
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


test('sandbox failure stops without host mutation or automatic paid retry', () => {
  assert.match(workflow, /codex sandbox \/bin\/pwd/);
  assert.match(workflow, /codex exec --sandbox workspace-write/);
  assert.match(workflow, /RUNNER_SANDBOX_UNAVAILABLE/);
  assert.match(workflow, /timeout-minutes: 45/);
  assert.doesNotMatch(workflow, /sudo|apt-get|apparmor_parser|execute-hosted-fallback|danger-full-access/);
});

test('Codex task is pinned to the trigger SHA and does not receive the GitHub write token', () => {
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /git switch --create "\$TASK_BRANCH" "\$GITHUB_SHA"/);
  const codexStep = workflow.split('      - name: Run Codex in bounded workspace-write sandbox')[1]?.split('      - name: Validate diff and create draft PR')[0] || '';
  assert.doesNotMatch(codexStep, /^\s+GH_TOKEN:/m);
  assert.match(workflow, /gh auth setup-git/);
  assert.match(workflow, /CODEX_EXIT_ZERO_WITH_NO_DIFF/);
});


test('only confirmed issue snapshot reaches Codex and no deploy command exists', () => {
  assert.doesNotMatch(workflow, /gh issue view.*--json number,title,body/);
  assert.match(workflow, /codex-issue.json/);
  assert.match(workflow, /STALE_SOURCE_REVIEW_REQUIRED/);
  assert.doesNotMatch(workflow, /wrangler|npm run deploy|gh workflow run|repository_dispatch|git push.*main/);
  assert.match(workflow, /canonical_context|Runtime and Ruby verification remain separate/);
});

test('successful preflight cannot substitute for an actual Codex exit when publishing', () => {
  const publish = workflow.split('      - name: Validate diff and create draft PR')[1].split('      - name: Report evidence')[0];
  assert.match(publish, /CODEX_EXIT: \$\{\{ steps\.codex\.outputs\.exit_code \}\}/);
  assert.match(publish, /if \[\[ "\$\{CODEX_EXIT:-1\}" != "0" \]\]/);
  assert.doesNotMatch(publish, /steps\.(sandbox_preflight|openai_preflight)\.outputs/);
});

test('Codex stops before sandbox unless the existing key belongs to the configured OpenAI account', () => {
  const account = workflow.split('      - name: Verify OpenAI API key account')[1]?.split('      - name: Verify existing runner sandbox')[0] || '';
  assert.match(account, /vars.CODEX_EXPECTED_OPENAI_EMAIL/);
  assert.match(account, /https:\/\/api\.openai\.com\/v1\/me/);
  assert.match(account, /OPENAI_ACCOUNT_MATCH/);
  assert.match(account, /OPENAI_ACCOUNT_MISMATCH/);
  assert.match(workflow, /steps\.openai_account\.outcome == 'success'/);
  assert.ok(workflow.indexOf('OPENAI_ACCOUNT_MATCH') < workflow.indexOf('codex sandbox /bin/pwd'));
  assert.doesNotMatch(account, /console\.(log|error)\([^\n]*(user\.email|OPENAI_API_KEY|\$\{key\})/);
});
