# GitHub #25 shared Codex invocation evidence

## RESULT

Source implementation and focused local tests passed. Activation BLOCKED; shared dispatch RUNTIME NOT VERIFIED. No OGE closure is proposed. GitHub issue #25 must not be confused with the separate Linear OGE-25.

Correlation: `2a-CODEX-GT-GS-SHARED-ENTRY`.

## CHANGED

- `.github/workflows/codex-issue-runner-staging.yml`: replaces push-marker invocation with authenticated, confirmed dispatch; adds durable reservation, exact issue snapshot, check-in/check-out, 45-minute agent bound and prepublication SHA checks. Removes automatic host repair and the duplicated hosted fallback. Publishing requires an actual Codex zero exit. Existing Infisical single-key binding is preserved.
- `scripts/codex-request.mjs`: validates identity, permission, staging SHA, task digest and limits; atomically reserves one issue/source/task tuple.
- `tests/codex-request.test.mjs`: 27 behavioral tests, including both fictional GS/GT identities, denial cases, concurrent duplicate/crash retry and execution of the workflow's real admission script with GitHub context getters.
- `tests/codex-shared-entry-workflow.test.mjs`: seven workflow contracts, including no deployment, no hidden fallback and no successful-preflight substitution for actual execution.
- `docs/integrations/CODEX_SHARED_ENTRY.md`: three-workflow audit, exact setup, invocation, recovery and limitations.
- This directory: evidence README, skill fingerprints, source receipt, matching Mermaid and SVG. The grayscale SVG is a deterministic rendering of the Mermaid nodes and edges; it is not a runtime screenshot.

## TESTS

| Command | Exit | Observed result |
| --- | --- | --- |
| `node tests/codex-request.test.mjs` | 0 | 27/27 behavioral cases passed |
| `node tests/codex-shared-entry-workflow.test.mjs` | 0 | 7/7 workflow contracts passed |
| `node --test tests/codex-request.test.mjs tests/codex-shared-entry-workflow.test.mjs` | 0 | Both test files passed after final runner edits |
| `npm test` | 1 | 102 test files; 93 passed, 9 failed. Eight lacked TypeScript/esbuild dependencies; incident-memory tests failed on subprocess `EPERM` in this sandbox. |
| `node tests/oge-error-memory.test.mjs` | 1 | 2 passed, 3 failed; observed `spawnSync /usr/bin/node EPERM` |
| `npm install --ignore-scripts --package-lock=false --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` | 1 | `EAI_AGAIN registry.npmjs.org`; no dependency setup completed |
| `npm run typecheck` | 127 | `tsc: not found` |
| `npm run build` | 127 | `vite: not found` |
| Python PyYAML unique-key parse plus `bash -n` for each workflow shell step | 0 | YAML structure and shell syntax passed; not an Actions runtime validation |
| Python XML / Mermaid label-edge validation and SHA256 skill verification | 0 | Diagram and five read skill fingerprints match source |
| `git diff --check` | 0 | No whitespace errors |

The repository-wide test summary counts test files, while direct focused commands expose their individual cases. No live GS/GT dispatch, provider call, sandbox repair, deployment or Ruby attestation was performed by this implementation session.

## EVIDENCE

Check-in:

- Local branch: `codex/oge-25-38466079874`, clean at start.
- Local HEAD and independently connected GitHub staging HEAD matched `96e0f7ae8bf5de0fb970db2dccc8f7f81d625a10`. The task branch starts at that SHA. Intake SHA `5a340b9a4da6c5da2d3ae06baacb87c523b4bbe6` had already advanced.
- Canonical repository remote was verified. Shell `gh api` lacked authentication; connector reads succeeded. No shell authentication repair, remote rewrite, credential discovery, commit or push was attempted.
- [Source commit](https://github.com/Ogenicchocolate21debug/Build-Platform/commit/96e0f7ae8bf5de0fb970db2dccc8f7f81d625a10).
- [Current runner invocation](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38466079874): connector returned job `115536883960`, status `in_progress`, conclusion null. Step query returned `steps: []`. Binding/sandbox preflight results are READ_UNAVAILABLE through that receipt; no successful final runner result or CI is claimed.
- [Issue #25](https://github.com/Ogenicchocolate21debug/Build-Platform/issues/25) is open. [PR #24](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/24) is an open draft on a different branch; no concurrent edits or delegation were made.
- Canonical session lock, OGE-22 architecture/registry references and earlier shared-entry decisions were read. Live prior session content remains `CONTEXT_UNAVAILABLE`.

Pstack actually read and applied, with exact paths and SHA256 values in [skill-read-receipt.json](skill-read-receipt.json):

- 24 `principle-fix-root-causes`
- 28 `principle-make-operations-idempotent`
- 34 `principle-prove-it-works`
- 39 `principle-test-behavior-not-implementation`
- 50 `unslop`

Check-out:

- Changes remain uncommitted on the supplied task branch; there is no new commit SHA, CI result or draft PR receipt to report.
- [source-receipt.json](source-receipt.json) hashes the reviewable implementation, tests, documentation and circuit against the attested base.
- Memory/recovery target: `owner-main / 1LSS_OWNER_MAIN`. No D1 write or Green promotion. Restore this branch, source receipt and the linked invocation before continuing; re-attest upstream and do not concurrently edit it.
- Next authorized stage is workflow/owner diff review. Dependency-enabled CI must rerun tests, typecheck and build. Activation requires the separate setup described below; no deploy is needed or authorized by this change.

## RESIDUAL RISK

- Activation is blocked by default-branch registration: GitHub API reports `main` as default, while this task forbids changing main. Owner must separately authorize the staging-guarded dispatch registration. No default-branch or repository-permission change was made.
- `CODEX_AUTHORIZED_ACTOR_IDS` must be populated with independently verified GS/GT account IDs, and each needs current Write permission and an Actions-dispatch-capable client. No username, setting or cross-account success is invented.
- The current runner invocation is the old push route. The proposed authenticated shared route has only local behavioral/contract proof; runtime, Ruby and both-account receipts remain pending.
- Network restrictions prevented dependency installation and full validation. The unrelated incident-memory subprocess restriction remains.
- Reservation is at-most-once admission for a fixed issue/source/task tuple. A crash can leave a reservation without check-out; a revised tuple needs fresh review. GitHub concurrency may replace pending requests, so always inspect the exact run rather than assuming dispatch implies execution.
- Existing publish filters are not a complete semantic safety review. The duration bound is not a monetary quota. Existing Yellow authorization/spend policy still applies. Third-party deployment hooks were not exercised or configured.
- Protected scopes, alternate workflows, secrets, provider settings, deployed Worker, D1 and PR #24 were untouched. No merge or deployment was performed.
