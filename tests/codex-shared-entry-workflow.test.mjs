import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/codex-issue-runner-staging.yml', import.meta.url), 'utf8');

test('shared Codex runner uses the existing staging-only entry path', () => {
  assert.match(workflow, /branches:\s*\n\s*- phase-vi-provider-incentive-metering/);
  assert.match(workflow, /CODEX-RUN-ISSUE:\[0-9\]\+/);
  assert.match(workflow, /TASK_BRANCH="codex\/oge-\$\{issue_number\}-\$\{GITHUB_RUN_ID\}"/);
  assert.match(workflow, /CODEX_EXIT: \$\{\{ steps\.codex\.outputs\.exit_code \|\| steps\.sandbox_preflight\.outputs\.exit_code \|\| steps\.openai_preflight\.outputs\.exit_code \}\}/);
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


test('Codex repairs and checks the host bubblewrap/AppArmor sandbox before bounded execution', () => {
  assert.match(workflow, /id: sandbox_preflight/);
  assert.match(workflow, /Repair and verify bubblewrap sandbox on existing WAVE runner/);
  assert.match(workflow, /bubblewrap apparmor-profiles apparmor-utils/);
  assert.match(workflow, /bwrap-userns-restrict/);
  assert.match(workflow, /apparmor_parser -r/);
  assert.match(workflow, /codex sandbox linux -- \/bin\/pwd/);
  assert.match(workflow, /codex exec --sandbox workspace-write/);
  assert.doesNotMatch(workflow, /use_legacy_landlock/);
  assert.doesNotMatch(workflow, /--sandbox danger-full-access/);
  assert.match(workflow, /RUNNER_HOST_ADMIN_REQUIRED/);
  assert.match(workflow, /sudo_noninteractive=\$sudo_n_success/);
  assert.match(workflow, /if \[\[ "\$EUID" -eq 0 \]\]/);
  assert.match(workflow, /profile_loaded=\$profile_loaded/);
  assert.match(workflow, /profile_probe_readable=\$profile_probe_readable/);
  assert.match(workflow, /Reading AppArmor's kernel status may be denied/);
  assert.match(workflow, /need_packages" == "1" \|\| "\$target_matches" != "1/);
  assert.match(workflow, /let Codex's real sandbox probe decide/);
  assert.match(workflow, /tail -n 30 "\$RUNNER_TEMP\/codex-sandbox-preflight\.log"/);
});

test('Codex task is pinned to the trigger SHA and does not receive the GitHub write token', () => {
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /git switch --create "\$TASK_BRANCH" "\$GITHUB_SHA"/);
  const codexStep = workflow.split('      - name: Run Codex in bounded workspace-write sandbox')[1]?.split('      - name: Validate diff and create draft PR')[0] || '';
  assert.doesNotMatch(codexStep, /^\s+GH_TOKEN:/m);
  assert.match(workflow, /gh auth setup-git/);
  assert.match(workflow, /CODEX_EXIT_ZERO_WITH_NO_DIFF/);
});


test('hosted ephemeral fallback is restricted to the self-host sandbox/admin blocker and reuses Infisical', () => {
  assert.ok(workflow.includes('execute-hosted-fallback'));
  assert.ok(workflow.includes("needs.execute.outputs.sandbox_exit_code"));
  assert.ok(workflow.includes('runs-on: ubuntu-latest'));
  assert.ok(workflow.includes('uses: Infisical/secrets-action@v1.0.17'));
  assert.ok(workflow.includes('codex exec --sandbox workspace-write'));
  assert.ok(workflow.includes('No merge, production deployment, migration, secret change, or D1 schema change'));
  assert.doesNotMatch(workflow, /gh pr merge/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
});
