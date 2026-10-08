# OGE-95 — GitHub staging Commit Drain, not Control Tower

**Owner instruction (2026-10-08):** When a commit enters the staging branch, GitHub should notice, test the queue, and continue until **all known untested commits** have a test receipt, including commits that arrived faster than the GitHub Actions concurrency queue. Owner should not have to ask ChatGPT to manually start each subsequent CI batch. Keep all work on `phase-vi-provider-incentive-metering` and preserve existing Agent/Manus/OpenAI, Ruby, Yellow, Stone Runner and Green.

## Operational lane

`GitHub push (staging) -> GitHub Commit Drain -> recover previous SHA receipt -> git first-parent backlog -> each SHA npm ci + npm run check -> preserve PASS/FAIL/BLOCKED per SHA -> keep draining until event HEAD -> publish artifact + job summary -> idle until next push`

The `on.push.branches` trigger on `.github/workflows/oge95-commit-drain.yml` has **no paths filter**. It catches every ordinary push to staging, not just workflow changes. `concurrency.cancel-in-progress:false` avoids interrupting a running batch; although GitHub only keeps one pending event in a concurrency group, the next run reconstructs every missing first-parent commit since the previous receipt. There is **no separate controller service, Control Tower, runner clone, D1 schema, production deploy or new API key**.

## Durable, bounded automation

- Uses **existing** `wave-runner-01` self-host machine. No new VM, provider call or paid AI task.
- The initial cursor is the previously green CI commit `9be0a339016ebf23a3a5f4108aaab56af19bd93a`. This is a bootstrap boundary, not a claim that all earlier commits are newly tested. Each run processes up to **six** SHA worktrees at a time until it reaches the trigger event HEAD.
- Full Git history from a SHA-pinned checkout; no privileged tokens are passed into `npm ci` or `npm run check`. A fresh temporary working tree keeps each tested SHA separate from the active staging source.
- The checkpoint and **every** batch's outcome are published as a 30-day GitHub Actions artifact. The next triggered run resumes from the last validated SHA receipt (not its last received push event).
- Failures are recorded, not silently skipped. The remaining commits are audited even when one has a failing test. The Workflow ends **red** if any SHA failed checks. A failed test is not a successful code fix.
- A forced non-fast-forward staging rewrite or damaged checkpoint fails closed; do not silently reset the cursor. The job has a hard 300-minute GitHub runtime limit, so 100% indefinite operation cannot be promised if the host is offline, GitHub is down, permissions fail or work exceeds runner limits.
- The GitHub Actions push trigger is **not** produced automatically by commits using the standard `GITHUB_TOKEN` from another Workflow (GitHub recursion suppression). Such actions must either call an allowed GitHub App writer that emits ordinary pushes, or be followed by an explicit approved event source. This is a platform constraint and is not disguised as guaranteed push detection.

## What it does NOT do

- It does **not** autonomously generate code, decide how to fix every failure, call Manus Plugin from GitHub CI, open paid OpenAI Agent sessions or commit a failed rewrite. That requires a separate, verified Agent dispatch/approval boundary in the existing architecture.
- GitHub Actions results appear in GitHub notifications/UI. **A result appearing in GitHub does not itself cause this ChatGPT conversation to receive a new message.** A supported event delivery integration is needed for proactive chat notifications.
- GitHub workflows added only on the staging branch are intentionally not self-dispatched with `workflow_dispatch` because that trigger has default-branch requirements. Instead each push starts one continuous backlog drain; newer pushes trigger later runs.

## Acceptance evidence

Code: `scripts/oge95-commit-drain.mjs`, `tests/oge95-commit-drain.test.mjs`, `.github/workflows/oge95-commit-drain.yml`. **PASS requires a real Actions run** with a `OGE95_DRAIN_ALL_KNOWN_COMMITS_AUDITED` log, per-SHA artifact and a future push that resumes from the checkpoint. Code committed by itself does **not** prove runtime activation. Continue to mark OGE-95 In Progress until a complete end-to-end proof is available.
