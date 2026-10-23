# GS → GH-ADDMINT POVIDER → OCIAN-S HOST → CODEX-TMN → D1
## Canonical invocation and task-context recovery | 2026-10-23 | STAGING ONLY

**Goal:** Finish GH-2 Issue #9 / CP-055, CP-056, CP-057 / WAIT-X18, WAIT-X19, WAIT-X20. Do not create a runner, server, Docker container, or second Codex instance. Historical E2E proof Run 39702219051 / Job 119573896324 is immutable; actor `Wave-Runner-2` dispatched on the repository now called `store`. The active GitHub Provider's human label is **GH-ADDMINT POVIDER**; the current technical GitHub repository is `Wave-Runner-2/Build-Platform`.

### Authoritative topology and roles

```text
GS / Owner (authenticated)
  └─ WAVE Worker  POST /api/wave/command  signed owner session
      ├─ ATHENA planner + Yellow Stone scoped permission
      ├─ Cloudflare D1 agent_tasks / agent_events
      └─ GH-ADDMINT POVIDER (technical account Wave-Runner-2)
          └─ workflow_dispatch wave-command-consumer.yml
              └─ GitHub Actions existing self-host registration
                  └─ OCEAN physical Droplet OCIAN-S HOST (604432491)
                      └─ registered runner service wave-runner-01
                          └─ scripts/wave-terminal-solo.sh (flock)
                              └─ scripts/wave-command-consumer.mjs
                                  └─ codex exec (same host, CODEX_HOME=/home/wave/.codex)
                                      └─ signed task RESULT /api/wave/command/result
                                          └─ D1 persisted DONE + hash
                                              └─ /api/wave/command/status readback
```

**`store`** is archival only. GitHub account/repo technical IDs and legacy `codex-selfhost:wave-runner-01` D1 actor literals remain necessary for historic receipts. `/home/wave/.codex` is an on-host Linux profile, not a remote Codex host.

### The only supported command envelope (existing WAVE API)

The caller MUST have an active signed Owner session; free text / Issue labels / console commands are NOT credentials.
Use existing `POST https://wave.ogenicchocolate.com/api/wave/command`:
```json
{
  "command": "OGE129 READONLY PROOF: verify CODEX-TMN staging workspace only; do not modify code or production",
  "capability": "codex_selfhost",
  "provider": "openai",
  "mode": "read",
  "environment": "staging"
}
```

For authorized edits use `mode: "execute"` plus a *bounded* Owner instruction and unique request id; never turn read-only proof into destructive repair implicitly. The Worker checks `hasOwnerSession`, origin, ATHENA state, policy and D1 binding, then queues `wavecmd_[64 lowercase hex]`. Send one well-formed UUID `Idempotency-Key` and REUSE it on retry. Do not invent a task ID; use the returned `task.id`. Returned HTTP 202 `COMMAND_DISPATCHED` means **accepted**, not DONE. If `COMMAND_MANUAL_DISPATCH_REQUIRED`, use ONLY returned `task_id`, exact GH2 workflow link, and GH2 staging branch. Do not dispatch to `store`.

**Canonical GH2 dispatch:** `https://api.github.com/repos/Wave-Runner-2/Build-Platform/actions/workflows/wave-command-consumer.yml/dispatches`, `ref=phase-vi-provider-incentive-metering`, inputs `{task_id:"wavecmd_..."}`. Workflows and the actual deployed WAVE Worker must contain this routing, otherwise GH2 commands may go to `store` or be deferred. PR #10 changes are staged and MUST NOT be treated as deployed.

**Result readback:** authenticate as Owner, `GET https://wave.ogenicchocolate.com/api/wave/command/status?task_id=<returned wavecmd id>`. Required: `task.status=DONE`, `execution.consumer_proven=true`, `last_event=COMMAND_RESULT_DONE`, 64-hex result SHA, 40-hex Git SHA and exact GH2 Actions run link. Verify `agent_events` row in D1 where authorized and link LINCENC. Failure/queued/busy does not revoke historical PASS-E2E.

### OpenCode architecture used as inspiration ONLY

OpenCode's public engine separates Context Sources, Session History, Tool Registry, permission checks and persisted tool-result messages. Adapt those ideas, NOT its binary/deployment:
- **Task Context**: existing `wave.task.envelope.v1` schema has task ID, context_ref/revision, scope, signed authority and retry/fallback contract.
- **Command executor**: existing `codex_selfhost` route and scripts, not a new generic tool executor or OpenCode daemon.
- **Durability**: D1 `agent_tasks/events/checkpoints` already exists; additive `0018_task_envelope_routing.sql` must be applied to verified STAGING D1 before any API depends on new tables.
- **Tool policy**: Owner signed session + ATHENA/Yellow checks + host flock/idempotency. No credentials in task context, GitHub labels or model outputs.
- **Return**: Result SHA, exact source SHA, GitHub Run/Job ID and D1 independent readback. Human GT inbox independent from Codex.
- OpenCode implementation reference: `https://github.com/anomalyco/opencode/blob/dev/CONTEXT.md` and `https://github.com/anomalyco/opencode/blob/dev/packages/core/src/tool/AGENTS.md`.
- There was no OpenCode file found in the currently indexed ChatGPT Library. This is a PUBLIC architecture reference and no external code was copied.

### Recovery sequence: stop at the failing gate, do not reinstall

| Gate | Check | Required proof / safe fix |
|---|---|---|
| 0. Cert | prior green Run39702219051 / Job119573896324 | immutable, old E2E |
| 1. GH2 Repo | private GH2 repo, workflow `wave-command-consumer.yml` at exact staging ref | GH2 workflow source SHA; code guard targets technical repo |
| 2. Runner binding | OCIAN registered GitHub Actions runner online + assigned to **GH2 repo or shared accessible runner group**; labels include `self-hosted,linux,x64,wave` | GH2 runner ID/online/busy; do NOT create a second service; update existing registration through authorized host administrator only |
| 3. Codex local | accepted GH2 self-host job `RUNNER_NAME=wave-runner-01`, Codex CLI available in same host | exact `run_id/job_id/runner_name`; never confuse Linux HOSTNAME with GitHub RUNNER_NAME |
| 4. Credentials | GH2 repo trust at Infisical OIDC STAGING, worker `GITHUB_TOKEN` Actions dispatch permission for GH2 | authorized OIDC receipt; do not use GH1 tokens or copy values into issue |
| 5. Owner command | correct `codex_selfhost/openai` WAVE signed command | D1 `wavecmd_...`, `OWNER_APPROVED_COMMAND_QUEUED`, Actions Run |
| 6. Actual result | Codex local command, script/result hash, D1 DONE/readback | `COMMAND_RESULT_DONE` + independently fetched evidence |
| 7. Envelope Context | apply 0018 to staging after checking binding, then signed envelope→TMN+result | `waveenv_...` transitions + receipts; no fake green |
| 8. n8n bridge | existing Railway n8n OGE-70 and OGE-6/57 workflow, currently disabled | turn on only after upstream gates; `WAIT-X20` independent E2E |

### Read-only recovery checks for authenticated OCIAN operator

Run as current authorized runner service account using existing SSH/terminal (never paste secrets). Capture only safe metadata:
```bash
hostname
whoami
systemctl list-units --type=service --all 'actions.runner*' --no-pager
ps -eo user,args | grep '[R]unner.Listener' | cut -c1-240
test -x /opt/wave/actions-runner/run.sh && echo EXISTING_RUNNER_PRESENT
command -v codex && codex --version
test -d /home/wave/.codex && echo CODEX_HOME_PRESENT
```
Do **not** run `config.sh remove`, delete runner credentials, restart production, or register a duplicate blindly. When exact service registration scope is known, change the **existing** repo binding safely with audit/rollback, then re-run the GH2 smoke job and capture a real Codex result.

### Special handling of current tasks

- `CP-055`: Task envelope + two-step TMN/D1 routing; CONTRACT present, real GH2 execution pending.
- `CP-056`: `lnwjud`/A2A candidate; no install until compatibility/resources verified (OCIAN is 1GB/1vCPU).
- `CP-057` + `WAIT-X19`: GH2 self-host route; GH2 Run 39838575588 Job120033260231 QUEUED at last verification, not Codex failed.
- `CP-059` + `CP-060` + `WAIT-X20`: existing Railway n8n context normalization to WAVE signed D1 TMN route. Inactive, don't auto-enable.
- `WAIT-X18`: full envelope/lnwjud runtime E2E not accepted.

### Acceptance and rollback

No green PASS/orange E2E from code-only, hosted CI or queued runner. Old certified green remains unchanged. Every new event should capture timestamp/principal, exact Git SHA, runner/job, task/context revision, result hash, D1 readback. All testing STAGING ONLY; do not merge to main/production without actual acceptance. If fresh changes regress an old certified gate, revert only the new staging change to last passing SHA; append regression and recovery evidence; preserve original proof.

## Owner correction — Docker Runtime is REQUIRED (not optional)

**Current target:** `GH-ADDMINT POVIDER` (human label) authenticates/dispatches via GitHub.com; a pre-existing GitHub Actions agent on the physical `OCIAN-S HOST` accepts the job. **Docker Engine runs on this server**, launching a scoped ephemeral staging container to execute `CODEX-TMN` and return cryptographic result hashes to existing WAVE/D1. No new physical runner, Provider or server.

- Historical Docker evidence exists from `store` Run `39124078680`, where `docker run --rm --network none --read-only` inspected the host Codex runtime and /root/.codex context. It does **not** prove the new GH-ADDMINT POVIDER repository can run CODEX-TMN inside Docker today.
- Previous signed Owner→Codex→D1 green was `store` Run `39702219051` with **GitHub actor technical ID `Wave-Runner-2`**. The repository workflow was still located in `store`. Do not conflate these two separate historic proofs.
- Present Draft PR #10 uses **direct host Codex CLI** via `scripts/wave-command-consumer.mjs`, NOT Docker. This is an outstanding IMPLEMENTATION GAP against Owner's new required runtime; **do not deploy it as compliant** until an existing Docker image and Codex CLI dependencies, read-only credential mount, context workspace, rootless UID/GID, CPU/RAM envelope, network policy and GH-ADDMINT POVIDER runner binding are verified on OCIAN.
- Migration order: prove runner registration/labels for active GitHub repository → identify current OCIAN Docker Engine/image/working Codex profiles without printing secrets → execute read-only Codex container smoke and capture job+SHA → wire the safe Docker call under the **existing** host terminal SOLO lock → signed WAVE TaskEnvelope → D1 result and independent readback; then report E2E Orange on a **new** checkpoint row. Historical Green remains immutable.
- `CODEX-TMN` is a **human-visible functional executor role**. Its existing internal capability `codex_selfhost`, D1 actor `codex-selfhost:wave-runner-01` and existing host profile paths remain unchanged until independently migrated. This avoids breaking currently certified receipts.
