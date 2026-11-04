# GH-ADDMINPOVIDER same-host registration checkout

Date: 2026-11-01T06:29:22.940Z (UTC; user time Asia/Bangkok)

## Verified results

- Existing DigitalOcean droplet 604432491: OCIAN-S-Host, active, 1 vCPU / 1024 MiB. No new VPS or physical runner.
- Executable source: fe790b7f52ea1269d919027a8624f74cb0aa90c7.
- Actual Cloud Actions: https://github.com/Wave-Runner-2/Build-Platform/actions/runs/41280862162/job/124772330087 — inspect SUCCESS.
- Cloud tests: 52 Node tests and 30 Python tests pass. Pinned package/ACP checks pass without model inference. Local matching Node suite: 51 pass, 1 privilege-environment skip; 30 Python pass.
- Existing Infisical OIDC and exact reference GH_ADDMINPROVIDER-FINE_GRAINED verified principal 342175560 / repository 1429580446.
- Primary registration inventory complete: 0 runners. Therefore physical-host registration migration has NOT occurred.
- Verified live SSH server pin matches Owner Console identity. Existing encrypted client key returns PASSPHRASE_REQUIRED; SSH authentication was not attempted.
- DigitalOcean browser Console returned Site Unavailable in this session. Connected DigitalOcean API exposes machine management, not a host shell.
- Current Runner.Worker process state cannot be independently inspected until host access is available. No service stop or host configuration change was attempted.

## Source changes

Existing cutover targets registration name and sole custom label GH-ADDMINPOVIDER, keeping physical host identity Ocian-S-Host separate. Command consumer workflow and terminal guard use the same exact name/label. Provider config distinguishes requested registration from the last observed historical registration; it does not claim an applied rename.

Source and tests preserve archived repository evidence, Codex profiles and existing work. Existing cutover reuses /opt/wave/actions-runner; verifies the server's own pin, provider identity, repository identity and registration inventory; checks Runner.Worker before stopping; obtains short-lived registration authorization before service stop; preserves local recovery state root-only; configures the same installation; checks new local binding/service and GitHub online inventory. It makes no archived-provider writes, removes no GH1 receipts and adds no VPS. A new GitHub registration ID for the moved installation is not a second physical runner.

Pinned Console entry points now load cutover source 2b0c762bf600c5638df95cfe65df4c4294b80ce8 with cutover SHA256 5d387aa3a8f9b60d13bbb0fae2c55cfc3d85608da912c5d89dbf33f1c341f30c. ops/unifiend-console-apply.sh explicitly applies the migration without optional OpenCode installation. scripts/unifiend-console-cutover-launch.sh defaults to plan; --apply is explicit. Their content/shell syntax was validated, not executed on the host.

Only the main command consumer lane is aligned in this checkout. Legacy proof workflows (including oge-28-provider-codex-closeout.yml) still use historical label sets and have NOT been silently enabled. Queued runs are not host execution evidence. The automatic cleanup switch was disabled for this pass to preserve historical/manual/started evidence.

## Canonical checkpoint

ATHENA VERIFIED_CHECKIN; D1 read VERIFIED; checkpoint write VERIFIED; independent readback true; original certificate D1_DOCUMENT_SHA256_MATCH.

Reference: github-actions://1429580446/41280862162

State hash: 75d8b46ff3671676783870ff46fd43382ef98bff2708d2581e4c95ae3ba9bb24

This checkpoint records the actual blocked host status; it is not successful host E2E. Historical PASS/E2E and green/orange records remain unchanged.

## Exact continuation gate

An authenticated shell on the same existing host is required: either the existing root Console or the existing client key unlocked locally. Do not request new Codex login or replace/copy credentials. Do not enter a passphrase into chat.

From the existing root Console, use ops/unifiend-console-apply.sh from this source. It uses existing codex-terminal Infisical profile and the existing reference; its guarded preflight blocks active Runner.Worker. No installation-root path needs to be guessed. After PRIMARY_ONLINE, independently read target name/labels/busy state and run a narrowly scoped host proof before resuming model-using/legacy jobs. Overall OWNER-28 remains In Progress.

## Failure preserved

First run 41280750354 / job 124772008418 failed before live access because one handoff regression still expected the historical label. Its expectation was corrected and the complete workflow test selection was rerun. The failed run is retained; it is not overwritten by the subsequent successful run.
