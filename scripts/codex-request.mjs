import { createHash } from 'node:crypto';

export const repository = 'Wave-Runner-2/Build-Platform';
export const staging = 'phase-vi-provider-incentive-metering';
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const taskDigest = issue => sha256(JSON.stringify([issue.number, issue.title, issue.body || '']));
const requireValue = (condition, code) => { if (!condition) throw new Error(code); };

// GitHub authenticates the event. Caller-supplied labels such as GS/GT are never identities.
export async function admitRequest({ github, context, allowedActors, triggeringActor }) {
  const { owner, repo } = context.repo;
  const input = context.payload.inputs || {};
  requireValue(`${owner}/${repo}` === repository && context.eventName === 'workflow_dispatch' &&
    context.ref === `refs/heads/${staging}`, 'STAGING_DISPATCH_REQUIRED');
  requireValue(context.runAttempt === 1, 'RERUN_REQUIRES_NEW_REVIEW');
  requireValue(input.confirm_bounded_task === true || input.confirm_bounded_task === 'true', 'CONFIRMATION_REQUIRED');
  requireValue(/^[1-9][0-9]{0,8}$/.test(input.issue_number || '') &&
    /^[a-f0-9]{40}$/.test(input.source_sha || '') &&
    /^[a-f0-9]{64}$/.test(input.task_sha256 || ''), 'INVALID_TASK_INPUT');
  let ids;
  try { ids = JSON.parse(allowedActors); } catch { throw new Error('ACTOR_ALLOWLIST_REQUIRED'); }
  requireValue(Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === 'string' && /^[1-9][0-9]*$/.test(id)), 'ACTOR_ALLOWLIST_REQUIRED');
  const sender = context.payload.sender;
  requireValue(sender?.type === 'User' && sender.login === context.actor && triggeringActor === context.actor &&
    ids.includes(String(sender.id)), 'ACTOR_DENIED');
  const { data: user } = await github.rest.users.getByUsername({ username: context.actor });
  requireValue(user.type === 'User' && user.id === sender.id && user.login === context.actor, 'ACTOR_IDENTITY_MISMATCH');
  const { data: access } = await github.rest.repos.getCollaboratorPermissionLevel({ owner, repo, username: context.actor });
  requireValue(['write', 'maintain', 'admin'].includes(access.permission) || access.user?.permissions?.push === true, 'REPOSITORY_WRITE_REQUIRED');
  const { data: source } = await github.rest.git.getRef({ owner, repo, ref: `heads/${staging}` });
  requireValue(source.object.sha === input.source_sha && context.sha === input.source_sha, 'STALE_SOURCE_SHA');
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: Number(input.issue_number) });
  requireValue(issue.number === Number(input.issue_number) && issue.state === 'open' && !issue.pull_request &&
    typeof issue.title === 'string' && typeof issue.body === 'string' && issue.body.trim().length > 0 &&
    Buffer.byteLength(issue.body) <= 16000 && Buffer.byteLength(issue.title) <= 256, 'BOUNDED_OPEN_ISSUE_REQUIRED');
  requireValue(taskDigest(issue) === input.task_sha256, 'TASK_CHANGED_RECONFIRM');
  const requestId = sha256(JSON.stringify([issue.number, input.source_sha, input.task_sha256]));
  const receipt = {
    schema: 'CODEX_SHARED_REQUEST_V1', status: 'RESERVED_NOT_EXECUTED',
    request_id: requestId, issue_number: issue.number, actor: context.actor, actor_id: String(sender.id),
    source_sha: input.source_sha, task_sha256: input.task_sha256,
    task_branch: `codex/oge-${issue.number}-${context.runId}`,
    reservation_ref: `refs/heads/codex/requests/${requestId}`,
    run_url: `https://github.com/${repository}/actions/runs/${context.runId}`,
    run_attempt: context.runAttempt, memory: 'owner-main / 1LSS_OWNER_MAIN',
    canonical_context: 'CONTEXT_UNAVAILABLE', ruby: 'PENDING', green_retention: false,
  };
  // Atomic create, not a read-then-write lock. Never delete automatically after failure.
  try {
    await github.rest.git.createRef({ owner, repo, ref: receipt.reservation_ref, sha: input.source_sha });
  } catch (error) {
    if (error.status === 422) throw new Error('DUPLICATE_OR_UNAVAILABLE_RESERVATION');
    throw new Error('RESERVATION_UNAVAILABLE');
  }
  return { receipt, issue: { number: issue.number, title: issue.title, body: issue.body, url: issue.html_url } };
}
