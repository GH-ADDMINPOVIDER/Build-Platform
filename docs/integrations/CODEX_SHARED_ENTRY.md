# Shared Codex entry for GS and GT

Status: implementation prepared on an isolated task branch; shared dispatch RUNTIME NOT VERIFIED.
Correlation: `2a-CODEX-GT-GS-SHARED-ENTRY`, GitHub issue #25, not a closure of Linear OGE-25.
Canonical memory remains `owner-main / 1LSS_OWNER_MAIN`.

## Audit at source 96e0f7ae8bf5de0fb970db2dccc8f7f81d625a10

| Existing workflow | Actual entry and prerequisites | Limitation |
| --- | --- | --- |
| `codex-issue-runner-staging.yml` | Staging push with `CODEX-RUN-ISSUE:<number>`; self-hosted Linux/x64 runner labeled `wave`; Codex CLI and working bubblewrap sandbox; GitHub contents/issues/PR write and OIDC; existing Infisical staging `OPENAI_API_KEY` | No dispatch input or verified GS/GT identity policy. Required a special staging push. Host repair and a sandbox-failure hosted fallback were automatic. |
| `oge-98-codex-hosted-fallback.yml` | Manual confirmation; staging only; existing Infisical OIDC binding; `openai/codex-action`; disposable worktree, fixed smoke-test task | Despite the name, both jobs specify self-hosted `wave`. It is a fixed proof, not a general task intake. Its recursive secret fetch is broader than the issue runner. Left unchanged. |
| `wave-openai-selfhost-executor.yml` | Manual dispatch with existing `OPENAI_EXECUTOR_API_KEY`, provisioned environment and session IDs, allowed OpenAI remote URL; `wave-runner-01`, `codex exec-server` | Connects a provisioned session. It neither accepts a bounded issue nor provisions/authenticates a GS/GT request. Left unchanged. |

PR #24 is a separate, open draft documentation change on `feat/2a-discovery-intake-catalog`; it was read, not edited. Its relay claims remain blocked. The canonical session lock and OGE-22 architecture references were read. Live prior owner-main content was unavailable: `CONTEXT_UNAVAILABLE`; no Green retention is claimed.

## Proposed single invocation

The issue runner now accepts only `workflow_dispatch` on the exact canonical staging ref. Push markers no longer invoke it. Both identities use this same route. GitHub authenticates the request; no GS/GT label or guessed username grants authority.

Before loading the existing single secret, `scripts/codex-request.mjs` verifies:

1. Exact repository, event, staging branch, first run attempt, and explicit `confirm_bounded_task=true`.
2. The event sender is a human GitHub user, matches both actor and triggering actor, is in `CODEX_AUTHORIZED_ACTOR_IDS`, and still has repository write/maintain/admin permission. A separate user API read checks the immutable ID against the login. Failed API reads deny the request.
3. `source_sha` matches both the workflow checkout SHA and the current remote staging HEAD.
4. The open issue is not a PR, has a nonempty body no larger than 16,000 UTF-8 bytes, and matches the confirmed task digest. The digest is SHA256 of UTF-8 `JSON.stringify([issue.number, issue.title, issue.body || ''])` with no trailing newline.
5. An atomic Git ref creation reserves SHA256 of `JSON.stringify([issue.number, source_sha, task_sha256])` under `refs/heads/codex/requests/<digest>`. A duplicate or uncertain reservation stops before inference. GS and GT share this key. The ref points at existing staging source; it adds no source commit or memory store.

The exact issue snapshot is used for the prompt. An issue edited afterward cannot silently change the confirmed task. One issue has one concurrency group, with no cancellation of an active run. Every accepted run gets an isolated `codex/oge-<issue>-<run>` branch. The Codex step has a 45-minute timeout within the 90-minute job. There is no automatic inference retry, host repair, or hosted fallback. Sandbox failure requires host-owner intervention.

The workflow preserves the existing single-secret Infisical binding. The agent step is not given the GitHub write token. The workflow rechecks the task branch, unchanged base HEAD and current remote staging SHA before publishing a draft. Only an actual Codex exit code of zero can reach publishing; a successful binding or sandbox probe cannot substitute for it. Raw model logs are not uploaded or pasted into issues. No merge, deployment, migration or D1 operation is added.

## Required owner setup, not performed here

- Verify the actual GitHub accounts used by GS and GT. Read each account's GitHub numeric `id`, then set repository Actions variable `CODEX_AUTHORIZED_ACTOR_IDS` to a JSON array of **decimal strings** containing those verified IDs. No default identities are supplied. If both surfaces use the same account, GitHub cannot distinguish GS from GT; the receipt truthfully records that account only.
- Both accounts need repository Write or higher and permission to dispatch Actions. A fine-grained token or GitHub App used for dispatch needs Actions write. Existing workflow token permissions must permit the reservation, issue report and draft PR. The repository must allow Actions to create PRs. No permission or variable was changed in this task.
- GitHub requires a dispatch workflow to exist on the default branch. The connected API reports this repository's default branch is `main`. Activation is therefore **BLOCKED** until the owner separately authorizes and installs a staging-guarded registration there, or chooses an authorized repository setup. This task does not edit main or change the default branch. Merely merging source into staging is not enough to establish dispatch availability. See [GitHub's manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
- Set repository Actions variable `CODEX_EXPECTED_OPENAI_EMAIL` to the Owner-confirmed OpenAI account email. After the existing Infisical single-secret binding, the workflow calls OpenAI's `/v1/me` with that key and requires an exact case-insensitive email match before sandbox or inference. It logs only match/mismatch codes, never the key or returned email. A service-account key or unavailable account endpoint fails closed; the key-to-account identity has **not** been verified live yet.
- Keep the existing runner, CLI, sandbox and Infisical OIDC trust operational. No new account, API key, runner service, database or paid setting is needed. Sandbox health, binding readiness and both real accounts must be checked by the deployed workflow, not inferred from these tests.

## Request procedure after activation

Read the current staging SHA and issue using the requester's authenticated GitHub connection. Review the exact bounded task, including permitted paths and acceptance checks. Never put credentials or sensitive context in the issue.

For CLI callers, the following produces the digest from the issue that was reviewed. Replace `25` with the intended issue number. The local snapshot is for review only.

```sh
gh issue view 25 --repo Ogenicchocolate21debug/Build-Platform --json number,title,body > /tmp/codex-reviewed-issue.json
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {taskDigest} from "./scripts/codex-request.mjs"; console.log(taskDigest(JSON.parse(readFileSync("/tmp/codex-reviewed-issue.json", "utf8"))))'
gh api repos/Ogenicchocolate21debug/Build-Platform/git/ref/heads/phase-vi-provider-incentive-metering --jq .object.sha
```

After explicit review, dispatch with those exact values:

```sh
gh workflow run codex-issue-runner-staging.yml \
  --repo Ogenicchocolate21debug/Build-Platform \
  --ref phase-vi-provider-incentive-metering \
  -f issue_number=25 \
  -f source_sha=REPLACE_WITH_REVIEWED_STAGING_SHA \
  -f task_sha256=REPLACE_WITH_REVIEWED_TASK_DIGEST \
  -f confirm_bounded_task=true
```

A connected GitHub client may use the equivalent Actions dispatch API with the same ref and four inputs. This document does not claim that every GS/GT connector exposes that API. A connector without Actions dispatch must use an already authorized CLI/browser route; do not substitute a push.

## Check-in, check-out and recovery

Check-in artifact `codex-check-in-<run>-<attempt>` records actor ID, issue, task digest, source SHA, request ID, reservation ref, task branch, exact run URL and canonical memory pointer before binding access. The run display name includes issue, source SHA and task digest to locate the exact dispatch if reservation succeeds but artifact upload fails.

Check-out artifact `codex-check-out-<run>-<attempt>` records actual Codex, sandbox and binding outcomes, checkout SHA, changed paths and draft PR pointer. Artifacts are retained for 30 days and contain no issue body, secret or raw model output. GitHub remains the task/evidence index; this is not a second canonical memory. Ruby is pending and Green retention is false until independently verified.

Reservations intentionally survive crashes and failures. Re-running the same Actions run is denied, and a second run with the same issue/source/task is denied even from the other account. Do not delete the reservation to retry. Inspect the original run, PR, branch and check-in first; a separately reviewed task revision or new source SHA needs fresh confirmation. This is at-most-once admission for a fixed issue/source/task tuple, not an exactly-once completion guarantee. A revised tuple can be admitted, so reviewers must check earlier work before confirming it.

Cancellation, runner loss or the overall job timeout may prevent check-out. The earlier check-in and reservation remain recovery pointers; absence of check-out is not success. Do not concurrently edit the task branch. A subsequent session must restore these pointers and perform checkout attestation again. Live owner-main retrieval remains `CONTEXT_UNAVAILABLE` until an authorized recall; no provider-memory parity is invented.

## Evidence and remaining limits

See [the local evidence receipt](../evidence/codex-shared-entry-25/README.md) and matching [Mermaid](../evidence/codex-shared-entry-25/circuit.mmd) / [SVG](../evidence/codex-shared-entry-25/circuit.svg).

This is source and local-test evidence only. The current invocation uses the old push workflow. No new shared dispatch has run. A 45-minute timeout is a duration bound, not a dollar cap; existing owner/Yellow spend and provider policies still apply. The existing draft publication filter checks filenames and whitespace, not arbitrary semantic safety. Owner review and independent Ruby verification remain required. Third-party hosting hooks outside this workflow were not exercised or reconfigured.
