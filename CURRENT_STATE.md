# OGENIC GOD TOOLKIT v1.3.0 — Current State

Canonical branch: `main`
Repository tip observed: `abcb4a2a9772b5639316008748e0f37ade3922a8`
Last fully verified runtime head: `44bf20e3a1cf71aced70d664b45825a255bcb99d`

## Verified current state
- PR #4 — **merged** on 2026-09-12: OGENIC GOD TOOLKIT v1.3.0 + Control Tower baseline.
- PR #6 — **merged** on 2026-09-12: evidence-based GitHub/Vercel runtime health adapters and read-only routing fix.
- Vercel project: `ogenic-control-tower`.
- Connected repo: `Ogenicchocolate21debug/Build-Platform`.
- Root Directory: `apps/ogenic-control-tower`.
- Current `main` production deployment observed for repository tip `abcb4a2a9772b5639316008748e0f37ade3922a8`: `dpl_DtVDG6w6rrsvcLEmsXYGMAfUAUb8` — `READY`.
- The last head with a dedicated successful remote runtime verification remains `44bf20e3a1cf71aced70d664b45825a255bcb99d`; GitHub Actions run `34723659449` completed successfully against `https://ogenic-control-tower.vercel.app`, and Audit/Bundle completed successfully on that same head.
- Do not automatically promote the latest repository tip to “fully runtime verified” without equivalent evidence. Runtime mode uses connected/host execution surfaces and provenance checks; report `UNKNOWN`, `HANDOFF`, `BLOCKED`, or authorization-required state when evidence is missing.

## Operating contract
- Direct connected tool first; fall through only to authorized execution surfaces.
- Read before write; verify before reporting success.
- Human Approval remains required immediately before destructive deletion, privilege/credential mutation, consequential external/financial actions, merge to protected production branches, and un-preauthorized production/public publish actions.
- Never expose raw secrets, browser cookies, passwords, private keys, or hidden model reasoning.
- Do not touch Candy resources as part of OGENIC Control Tower maintenance unless the task explicitly scopes them in.

## Known drift / follow-up
- Historical pre-merge instructions that say PR #4 still needs merging are superseded by this file.
- `main` advanced after the last dedicated remote-runtime verification through two Money Control changes (`d43831b3330611544d33ff83e31f03d384b878c9` and `abcb4a2a9772b5639316008748e0f37ade3922a8`). Their latest production deployment is `READY`, but an equivalent remote-runtime verification run for that exact head has not been established in this reconciliation.
- Recent preview deployments from branch `phase-vi-provider-incentive-metering` are failing before build with Vercel error `NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST`: project Root Directory `apps/ogenic-control-tower` is absent on that branch. Treat this as branch/project-layout drift, not as evidence that the current `main` production deployment is down.
- Historical deployment `dpl_BgBKm8zhGxuw8z6tyUm8PtjGQwwa` remains a destructive-delete concern; deletion requires an authenticated Vercel action/browser surface plus fresh Human Approval. Do not bypass authentication.
- CN `Main Photo` A1→A5 integrity/lineage status is maintained separately in the OGENIC CORE HARNESS Operate Master. Control Tower runtime success does not prove CN source/build lineage is reconciled.
