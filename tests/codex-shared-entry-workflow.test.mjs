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
  assert.ok(workflow.indexOf('admitRequest') < workflow.indexOf('CODEX_LOCAL_ACCOUNT_MATCH'));
  assert.match(workflow, /codex-check-in-/);
  assert.match(workflow, /codex-check-out-/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('Codex uses the verified local Suthi login and never loads a repository secret', () => {
  assert.match(workflow, /id: local_auth/);
  assert.match(workflow, /vars.CODEX_EXPECTED_OPENAI_EMAIL_SHA256/);
  assert.match(workflow, /\.codex.*auth\.json/);
  assert.match(workflow, /CODEX_LOCAL_ACCOUNT_MATCH/);
  assert.match(workflow, /CODEX_LOCAL_ACCOUNT_MISMATCH/);
  assert.doesNotMatch(workflow, /Infisical|OPENAI_API_KEY|id-token: write/);
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

test('Codex stops before sandbox unless the local login belongs to the configured account', () => {
  const account = workflow.split('      - name: Verify local Codex login')[1]?.split('      - name: Verify existing runner sandbox')[0] || '';
  assert.match(account, /vars.CODEX_EXPECTED_OPENAI_EMAIL_SHA256/);
  assert.match(account, /createHash\('sha256'\)/);
  assert.match(account, /CODEX_LOCAL_ACCOUNT_MATCH/);
  assert.match(account, /CODEX_LOCAL_ACCOUNT_MISMATCH/);
  assert.match(workflow, /steps\.local_auth\.outcome == 'success'/);
  assert.ok(workflow.indexOf('CODEX_LOCAL_ACCOUNT_MATCH') < workflow.indexOf('codex sandbox /bin/pwd'));
  assert.doesNotMatch(account, /console\.(log|error)\([^\n]*(email|auth|token)/);
});
