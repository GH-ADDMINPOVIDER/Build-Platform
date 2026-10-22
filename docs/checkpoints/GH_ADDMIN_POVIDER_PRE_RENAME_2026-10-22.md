# GH_ADDMIN_POVIDER pre-rename checkpoint

Recorded: 2026-10-22 UTC
Authorized target rename: `Wave-Runner-2/codex-action` -> `Wave-Runner-2/GH_ADDMIN_POVIDER`

## Verified evidence

- Connector write/merge proof: merge `f74b6ce08e060154bbfe754de34fa5db19e59e13`
- Current pre-rename default-branch checkpoint: `c7ccb585d6ccb2baf0dc4fc025034e2b8317432a`
- GitHub-hosted E2E: run `39760560987`, job `119763382454`, success
- TypeScript verification: run `39760560936`, job `119763381633`, success
- Infisical OIDC binding: verified
- Private source mirror: run `39762627255`, success
- Yellow Stone policy/tool-option E2E: run `39762868426`, job `119771071168`, success
- Yellow Stone audit/bundle: runs `39762868403` and `39763079269`, success
- Private operational source main after policy migration: `91afa04e0ab01d46909353b8ad8f2026c9f0d2fa`

## Required invariants

- Operational role name is exactly `GH_ADDMIN_POVIDER`.
- Yellow Stone is only a selectable tool option with `authority: none`.
- GH1 remains read-only recovery storage.
- No secret values are stored in this checkpoint.

## Open host blocker

The existing self-hosted runner remains unbound because both approved SSH key references are rejected by `wave@165.232.174.32` with `Permission denied (publickey)`. Infisical OIDC succeeds; the remaining repair is the host `authorized_keys` trust path.
