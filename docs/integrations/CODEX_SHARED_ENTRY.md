# Shared Codex Entry — GT × GS

Status: SOURCE CHANGE PREPARED; runtime verification pending.
Repository: Ogenicchocolate21debug/Build-Platform
Canonical branch: phase-vi-provider-incentive-metering
Existing runner: .github/workflows/codex-issue-runner-staging.yml
Canonical memory: owner-main / 1LSS_OWNER_MAIN

## Evidence from the first live invocation

Run #38428525240 reached the self-hosted runner, loaded GitHub Issue #25, and created its isolated task branch. Codex itself did not start: the old step read an empty GitHub Actions OPENAI_API_KEY secret and stopped with exit code 86.

Evidence: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38428525240
Issue record: https://github.com/Ogenicchocolate21debug/Build-Platform/issues/25#issuecomment-6149925153

## Fix applied by this bootstrap patch

The staging Codex runner now uses the existing Infisical OIDC identity to fetch only OPENAI_API_KEY from the existing staging secret path. It no longer binds OPENAI_API_KEY from the empty GitHub secret. The secret value is not read or printed by this ChatGPT-side patch; the Infisical action injects it only for subsequent steps of the runner job.

The runner fails closed with exit code 86 if the key remains unavailable. The shared entry contract has a Node test that checks the OIDC permission, single-secret fetch, isolated task branch, fallback status, and absence of merge/deploy commands.

## How GT and GS invoke the existing runner

The current entry remains repository-level and staging-only: an authorized repository writer submits a bounded GitHub issue and triggers a commit whose message contains CODEX-RUN-ISSUE:<issue-number> on phase-vi-provider-incentive-metering. The workflow creates a per-run codex/oge-<issue>-<run> branch and creates a Draft PR only when Codex exits successfully and the current validation step accepts the diff.

2a is a coordination marker, not authentication. GitHub still controls repository write permission. GS's separate GitHub identity and Write permission have not yet been independently verified, so cross-account availability stays NOT_VERIFIED until GS tests with its own connected account.

## Safety and evidence boundaries

- Reuses the existing Infisical identity, project, staging environment, Codex CLI, and self-hosted runner; no new API key or runner service.
- No secrets are changed or duplicated; only one existing key is requested.
- No main, Production, Candy, Worker deploy, D1 schema/data mutation, or paid settings change.
- Codex runtime success remains unverified until this commit's workflow run reaches the actual Codex step and produces an exit/result receipt.
- The direct ChatGPT Codex Work UI is not callable through this ChatGPT instance's tool surface. This repository runner is the connected execution path being repaired.

## Check-in / Check-out

Start SHA: 4707c36a503f90665ed83ca0a749af3ee5347f7d.
Pstack used for this bootstrap: 9 figure-it-out, 18 boundary-discipline, 28 make-operations-idempotent, 34 prove-it-works, 36 separate-before-serializing-shared-state.
Required check-out: final SHA, changed paths, exact test command and exit code, workflow run URL, actual Codex exit/result, Draft PR URL if any, residual risk, next owner action, and restorable pointer to owner-main / 1LSS_OWNER_MAIN.
