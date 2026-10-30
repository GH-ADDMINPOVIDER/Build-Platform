import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { admitRequest, taskDigest } from '../scripts/codex-request.mjs';

function fixture(login = 'fixture-gs', id = 101, reservations = new Set()) {
  const issue = { number: 25, title: 'Bounded test task', body: 'Change a test fixture only.', state: 'open', html_url: 'https://github.com/Wave-Runner-2/Build-Platform/issues/25' };
  const sha = 'a'.repeat(40);
  const context = {
    repo: { owner: 'Wave-Runner-2', repo: 'Build-Platform' },
    eventName: 'workflow_dispatch', ref: 'refs/heads/Unified-on-Progress', sha,
    runId: 123, runAttempt: 1, actor: login,
    payload: { sender: { login, id, type: 'User' }, inputs: {
      issue_number: '25', source_sha: sha, task_sha256: taskDigest(issue), confirm_bounded_task: 'true',
    } },
  };
  const effects = [];
  const github = { rest: {
    users: { getByUsername: async () => ({ data: { login, id, type: 'User' } }) },
    repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }) },
    issues: { get: async () => ({ data: issue }) },
    git: {
      getRef: async () => ({ data: { object: { sha } } }),
      createRef: async ({ ref, sha: value }) => {
        if (reservations.has(ref)) throw Object.assign(new Error('exists'), { status: 422 });
        reservations.add(ref); effects.push({ ref, sha: value });
      },
    },
  } };
  return { args: { github, context, allowedActors: '["101","202"]', triggeringActor: login }, issue, effects };
}

for (const [label, id] of [['gs', 101], ['gt', 202]]) {
  test(`authorized ${label} receives the same bounded entry and recovery receipt`, async () => {
    const f = fixture(`fixture-${label}`, id);
    const result = await admitRequest(f.args);
    assert.equal(result.receipt.actor_id, String(id));
    assert.equal(result.receipt.status, 'RESERVED_NOT_EXECUTED');
    assert.equal(result.receipt.task_branch, 'codex/oge-25-123');
    assert.equal(result.receipt.run_url, 'https://github.com/Wave-Runner-2/Build-Platform/actions/runs/123');
    assert.equal(result.receipt.memory, 'owner-main / 1LSS_OWNER_MAIN');
    assert.equal(result.issue.body, 'Change a test fixture only.');
    assert.deepEqual(f.effects, [{ ref: result.receipt.reservation_ref, sha: 'a'.repeat(40) }]);
    assert.match(result.receipt.reservation_ref, /^refs\/heads\/codex\/requests\/[a-f0-9]{64}$/);
  });
}

const denials = [
  ['unknown actor', f => { f.args.context.payload.sender.id = 303; }, 'ACTOR_DENIED'],
  ['forged login', f => { f.args.context.payload.sender.login = 'other'; }, 'ACTOR_DENIED'],
  ['bot actor', f => { f.args.context.payload.sender.type = 'Bot'; }, 'ACTOR_DENIED'],
  ['different rerun actor', f => { f.args.triggeringActor = 'other'; }, 'ACTOR_DENIED'],
  ['rerun', f => { f.args.context.runAttempt = 2; }, 'RERUN_REQUIRES_NEW_REVIEW'],
  ['missing allowlist', f => { f.args.allowedActors = ''; }, 'ACTOR_ALLOWLIST_REQUIRED'],
  ['numeric allowlist', f => { f.args.allowedActors = '[101]'; }, 'ACTOR_ALLOWLIST_REQUIRED'],
  ['missing confirmation', f => { delete f.args.context.payload.inputs.confirm_bounded_task; }, 'CONFIRMATION_REQUIRED'],
  ['false confirmation', f => { f.args.context.payload.inputs.confirm_bounded_task = 'false'; }, 'CONFIRMATION_REQUIRED'],
  ['main', f => { f.args.context.ref = 'refs/heads/main'; }, 'STAGING_DISPATCH_REQUIRED'],
  ['tag', f => { f.args.context.ref = 'refs/tags/Unified-on-Progress'; }, 'STAGING_DISPATCH_REQUIRED'],
  ['other repo', f => { f.args.context.repo.owner = 'other'; }, 'STAGING_DISPATCH_REQUIRED'],
  ['push bypass', f => { f.args.context.eventName = 'push'; }, 'STAGING_DISPATCH_REQUIRED'],
  ['stale source', f => { f.args.context.payload.inputs.source_sha = 'b'.repeat(40); }, 'STALE_SOURCE_SHA'],
  ['different checkout', f => { f.args.context.sha = 'b'.repeat(40); }, 'STALE_SOURCE_SHA'],
  ['edited task', f => { f.issue.body = 'Unreviewed task'; }, 'TASK_CHANGED_RECONFIRM'],
  ['oversized task', f => { f.issue.body = 'x'.repeat(16001); }, 'BOUNDED_OPEN_ISSUE_REQUIRED'],
  ['closed task', f => { f.issue.state = 'closed'; }, 'BOUNDED_OPEN_ISSUE_REQUIRED'],
  ['pull request', f => { f.issue.pull_request = {}; }, 'BOUNDED_OPEN_ISSUE_REQUIRED'],
  ['issue injection', f => { f.args.context.payload.inputs.issue_number = '25\nBAD=1'; }, 'INVALID_TASK_INPUT'],
  ['read-only collaborator', f => { f.args.github.rest.repos.getCollaboratorPermissionLevel = async () => ({ data: { permission: 'read' } }); }, 'REPOSITORY_WRITE_REQUIRED'],
  ['API identity mismatch', f => { f.args.github.rest.users.getByUsername = async () => ({ data: { id: 999, login: 'fixture-gs', type: 'User' } }); }, 'ACTOR_IDENTITY_MISMATCH'],
];
for (const [name, mutate, code] of denials) {
  test(`${name} fails before any reservation or execution`, async () => {
    const f = fixture(); mutate(f);
    await assert.rejects(admitRequest(f.args), { message: code });
    assert.deepEqual(f.effects, []);
  });
}

test('concurrent GS/GT duplicate requests reserve once, including retry after a crash', async () => {
  const reservations = new Set();
  const gs = fixture('fixture-gs', 101, reservations);
  const gt = fixture('fixture-gt', 202, reservations);
  gt.args.context.runId = 124;
  const result = await Promise.allSettled([admitRequest(gs.args), admitRequest(gt.args)]);
  assert.equal(result[0].status, 'fulfilled');
  assert.equal(result[1].reason.message, 'DUPLICATE_OR_UNAVAILABLE_RESERVATION');
  await assert.rejects(admitRequest(gt.args), { message: 'DUPLICATE_OR_UNAVAILABLE_RESERVATION' });
  assert.equal(gs.effects.length + gt.effects.length, 1);
});

test('unavailable GitHub permission or reservation service never grants execution', async () => {
  const f = fixture();
  f.args.github.rest.repos.getCollaboratorPermissionLevel = async () => { throw new Error('API unavailable'); };
  await assert.rejects(admitRequest(f.args), /API unavailable/);
  assert.deepEqual(f.effects, []);
  const g = fixture();
  g.args.github.rest.git.createRef = async () => { throw new Error('network uncertain'); };
  await assert.rejects(admitRequest(g.args), { message: 'RESERVATION_UNAVAILABLE' });
});

test('actual workflow admission script preserves GitHub context getters and saves the confirmed snapshot', async () => {
  const workflow = await readFile(new URL('../.github/workflows/codex-issue-executor-staging.yml', import.meta.url), 'utf8');
  const script = workflow.split('          script: |\n')[1].split('\n      - name:')[0]
    .split('\n').map(line => line.replace(/^            /, '')).join('\n');
  const f = fixture();
  const { repo, ...properties } = f.args.context;
  const context = Object.assign(Object.create({ get repo() { return repo; } }), properties);
  const folder = await mkdtemp(join(tmpdir(), 'codex-request-test-'));
  const outputs = {};
  const core = { setOutput: (key, value) => { outputs[key] = value; }, setFailed: message => { throw new Error(message); } };
  const execute = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', 'process', 'require', script);
  try {
    await execute(f.args.github, context, core, { env: {
      GITHUB_WORKSPACE: fileURLToPath(new URL('..', import.meta.url)), RUNNER_TEMP: folder,
      GITHUB_RUN_ATTEMPT: '1', ALLOWED_ACTOR_IDS: '["101","202"]', TRIGGERING_ACTOR: 'fixture-gs',
    } }, createRequire(import.meta.url));
    assert.deepEqual(outputs, { number: 25 });
    const receipt = JSON.parse(await readFile(join(folder, 'codex-check-in.json'), 'utf8'));
    assert.equal(receipt.task_branch, 'codex/oge-25-123');
    assert.equal(receipt.actor_id, '101');
    assert.deepEqual(JSON.parse(await readFile(join(folder, 'codex-issue.json'), 'utf8')), {
      number: 25, title: 'Bounded test task', body: 'Change a test fixture only.',
      url: 'https://github.com/Wave-Runner-2/Build-Platform/issues/25',
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
