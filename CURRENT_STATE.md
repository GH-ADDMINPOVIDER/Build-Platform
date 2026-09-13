# OGENIC GOD TOOLKIT v1.3.0 — Current State

Canonical branch: `main`
Verified head: `44bf20e3a1cf71aced70d664b45825a255bcb99d`

## Verified current state
- PR #4 — **merged** on 2026-09-12: OGENIC GOD TOOLKIT v1.3.0 + Control Tower baseline.
- PR #6 — **merged** on 2026-09-12: evidence-based GitHub/Vercel runtime health adapters and read-only routing fix.
- Vercel project: `ogenic-control-tower`.
- Connected repo: `Ogenicchocolate21debug/Build-Platform`.
- Root Directory: `apps/ogenic-control-tower`.
- Current production deployment for head `44bf20e3a1cf71aced70d664b45825a255bcb99d`: `dpl_6m4zpVK4LWvqUjZuHM3M2ns9yBvR` — `READY`.
- GitHub Actions remote runtime verification run `34723659449` completed successfully against `https://ogenic-control-tower.vercel.app`.
- Audit/Bundle also completed successfully on the same head.
- Runtime mode now uses connected/host execution surfaces and provenance checks. Never fabricate `READY`; report `UNKNOWN`, `HANDOFF`, `BLOCKED`, or authorization-required state when evidence is missing.

## Operating contract
- Direct connected tool first; fall through only to authorized execution surfaces.
- Read before write; verify before reporting success.
- Human Approval remains required immediately before destructive deletion, privilege/credential mutation, consequential external/financial actions, merge to protected production branches, and un-preauthorized production/public publish actions.
- Never expose raw secrets, browser cookies, passwords, private keys, or hidden model reasoning.
- Do not touch Candy resources as part of OGENIC Control Tower maintenance unless the task explicitly scopes them in.

## Known drift / follow-up
- Historical pre-merge instructions that say PR #4 still needs merging are superseded by this file.
- Old deployment `dpl_BgBKm8zhGxuw8z6tyUm8PtjGQwwa` still exists as `READY`/production-targeted historical deployment. Any deletion remains a destructive action and requires a valid Vercel browser/action surface plus fresh Human Approval; do not bypass authentication.
- CN `Main Photo` A1→A5 integrity/lineage status is maintained separately in the OGENIC CORE HARNESS Operate Master. Control Tower runtime success does not prove CN source/build lineage is reconciled.
