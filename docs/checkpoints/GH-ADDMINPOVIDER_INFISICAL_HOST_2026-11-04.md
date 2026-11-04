# GH-ADDMINPOVIDER × Infisical × Existing Host — Verified 2026-11-04

Scope: existing DigitalOcean OCIAN-S-Host (604432491), existing installation `/opt/wave/actions-runner`, repository ID 1429580446, principal ID 342175560. No additional host or runner installation.

## Verified native receipts

- Run: https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/41809961986
- Workflow source commit: bccc0b60b48b02b4daf02f473fb15caadb1bed00
- Existing-host cutover job 126506461228: SUCCESS, PRIMARY_ONLINE, registration ID 21.
- Self-hosted proof job 126506617469: SUCCESS, SELF_HOSTED_GITHUB_INFISICAL_E2E_PASS.
- Runner name and sole scoped label: GH-ADDMINPOVIDER.
- Physical host OS hostname remains wave-runner-01; this is not a separate runner.
- Infisical CLI on the actual host: 0.43.143.
- GitHub Actions OIDC authenticated Machine Identity b0962d69-bd33-4ac3-b4f4-48589535ca38.
- Infisical project e8cfba67-ea99-4d79-bc9f-87b862f9129c, environment staging, metadata count 46.

## Existing credential mapping

- GH_ADDMINPROVIDER-FINE_GRAINED: existing GitHub principal credential; authenticated ID 342175560.
- SSH_PRIVATE_KEY: encrypted existing SSH client key.
- SSH_OWNER_KEY: existing key passphrase; successfully unlocks SSH_PRIVATE_KEY. It is not a private key file.
- SSH identity and secret values were neither printed nor committed. Temporary client key files were removed after the job.
- No new Infisical credential or App Connection was required.

## Host reconciliation

The existing systemd service was active but its local `.service` marker was missing. The marker was recovered only after verifying the native systemd User=wave, ActiveState=active, ExecStart=/opt/wave/actions-runner/runsvc.sh, and no active Runner.Worker.

The pinned existing cutover implementation preserved the prior local configuration under the root-only `.unifiend-cutover` recovery directory, stopped the original service, and registered the same installation against the verified canonical repository. Native readback confirmed the primary runner online before the self-hosted proof job executed.

Preservation: no archived-provider API writes; Codex profiles unchanged; no additional physical host or runner installation. Existing certificate history is retained; this checkpoint records new native evidence and does not replace historical receipts.

## Boundaries

These receipts prove GitHub/Infisical authentication and a real job on the canonical self-hosted runner. Claude user-account authorization, a running MCP gateway, paid model inference, and Railway/n8n recovery are separate and are not marked complete by this proof.

Earlier diagnostic host inspection found no MCP-matching processes under its bounded process-name scan; this is not a full service or container inventory.

## Owner-accepted checkpoint — 2026-11-04

PASS_GREEN is scoped to GH-ADDMINPOVIDER/Build-Platform → GitHub Actions OIDC → Infisical staging → the existing OCIAN-S-Host. Owner accepted runner name/label GH-ADDMINPOVIDER; OS hostname remains wave-runner-01.

- Native run #3: https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/41809961986
- Proof job: https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/41809961986/job/126506617469
- Source bccc0b60b48b02b4daf02f473fb15caadb1bed00; event push; actual self-hosted receipt SELF_HOSTED_GITHUB_INFISICAL_E2E_PASS.
- Service audit run 41811274454/job 126510849855: one installed/active service, one Listener, zero Workers at audit; old service inactive/not-found; GitHub Online/Idle.
- Infisical CLI 0.43.143; staging secret metadata count 46.
- Current Owner CERT v2 CP-001/CP-005, account roles and EV-060 updated and read back: https://docs.google.com/spreadsheets/d/1zYJw3C-9bnIK5CDJ8hN1qjZonAbg51R6GhXLnLcBlRw/edit
- Canonical D1 certificate oge-128-wave-runner-01-baseline-20261018 updated by append-only evidence (28→29). CAS/readback hash 8bae9d9b7c3c3cf5d58dc57a92ddb0ef30c0e85912bb7760d01bc518bbecc392. All previous history, permissions and source_commit preserved.
- D1 write receipt run 41843738350/job 126621737983: D1 write PASS_GREEN, subsequent WAVE/Athena owner session POST /api/session HTTP 403. Whole sync job failed at that separate hop; Athena acknowledgement remains pending.
- Claude account GitHub connector connected, but private Build-Platform test visibly denied access. Official Claude GitHub App approval is prepared for this repository only; final authorization not submitted because it includes read/write code, workflows, Actions, hooks, issues and PRs and needs action-time Owner confirmation.
- MCP runtime, Codex inference and Railway/n8n recovery are not certified by this receipt. Broad OWNER-28 and PR #23 remain open; [Old Data] CERT and all historical evidence retained.
