# OGE-131 — WAVE Connector Endpoint: 15-mode Runtime Closure Matrix
**Date:** 2026-10-19 · **Scope:** staging / one existing Runner-1 · **Document status:** source-grounded engineering checkpoint; not proof of full E2E.

## Authoritative references
- Same Certificate lincenc ID: `oge-128-wave-runner-01-baseline-20261018`, GitHub branch `task/oge-128-runtime-certificate-20261018`, OGE-130 inventory event #14.
- D1 same-row readback: Actions Run [39202417749](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39202417749), SHA-256 `9d3d2525ed20bbe00ee0765e222d6e4fd876e62f9575943be9d7f08f3de80cc5`.
- Source routes: `worker/entry-yellow-stone.ts`, `worker/connector-endpoint-api.ts`, `worker/mcp-config-api.ts`, `worker/connector-runtime.ts`.
- Existing WAVE Owner-read / Approval negative-run evidence: [39186105154](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39186105154).
- Existing source/typecheck/build evidence: [39199805747](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39199805747).

## Important classification rule
The Certificate's **15 entries are 15 capabilities/modes/categories**, **NOT** 15 directly executable processes. Secret, Token, Credential are identity resources. npm is a package manager, NPX is a Runner CLI invocation form, SDK is a programming interface, webhook is an authenticated inbound event. They must NOT be given an unrestricted remote shell or provider command endpoint simply to count as 15 E2E executors.

## Audited mode inventory
| # | Certificate category | Original implementation and evidence | New OGE-131 Endpoint route | Current verified boundary | Still required for live E2E |
|---|---|---|---|---|---|
| 1 | MCP | `mcp-config-api.ts`, remote `initialize` + `tools/list`; PR #21 | `mcp` read-only `/probe?mode=mcp&provider=<id>` | Source implementation; authenticated real provider discovery only | A registered enabled staging provider, valid auth binding, real `tools/call` tool with permission classification and receipt |
| 2 | n8n | `connector-runtime.ts`, OGE-129 live health PASS | `n8n` read-only `/probe?mode=n8n` | Health/API reachability, NOT workflow run | Owner-approved bounded workflow execution and result readback, handle quota |
| 3 | REST API | `live-tools.ts`, `connector-runtime.ts` | `rest_api`; bounded GitHub READ only | GitHub read verified; no arbitrary HTTP URL execution | Per-provider scope and staging-only call/result evidence |
| 4 | Token | `config/providers.json`, `live-tools.ts` | `token` metadata, never execution | Secret value not returned | Provider-by-provider scope/expiry audit, no raw token output |
| 5 | Secret | Infisical GitHub OIDC, D1 readback Run 39202417749 | `secret` metadata, never execution | OIDC and scoped D1 credential use PASS | Complete scope audit; no unverified claim of 1:1 Infisical document mirror |
| 6 | Credential | D1 provider_bindings and WAVE Owner Session | `credential` metadata, never execution | Owner auth/plan ID checks PASS | Credential-to-provider permission binding in each Env/identity |
| 7 | Repository/PR API | `verified-function-tools.ts`; staged GitHub READ | `repository_api_pr_api` + Yellow `read_file/github` | READ PASS; PR write NOT enabled by this route | Approved PR operation, Actions dispatch permission and result evidence |
| 8 | Agent API | `connector-app-api.ts`, `/api/chat/agent` | `agent_api` + owner-gated `codex_selfhost/openai` | Agent route source; existing WAVE owner gate | Runnable authorized job/CLAIM/RESULT, account-specific identity |
| 9 | Function / Tool Calling | `verified-function-tools.ts`, `/api/chat/functions` 7 READ tools | `function_tool_calling` discovered, no unsafe generic bridge | Source loop and verified read tools | Per-tool bounded execution; signed side-effect routing / tool call receipt |
| 10 | NPX CLI | `package.json` npx cap scripts | `npx_cli`, Runner adapter NOT ACTIVE | Project npm script exists, is NOT remote NPX execution proof | Pin and allowlist exact NPX package/version, Runner-1 Solo, network/permission sandbox, owner Sign |
| 11 | npm | `package.json`, OGE130 source test/install/typecheck/build PASS | `npm` non-executable metadata | CI build tool PASS | Commit audited lockfile, `npm ci` reproducibility, task-specific Owner approval |
| 12 | SDK | `ogenic-registry-mcp` SDK dependency | `sdk`, Runner adapter NOT ACTIVE | Dependency declaration/source only | Confirm compatible version, API lifecycle, bound provider scopes and E2E |
| 13 | A2A Agent Relay | PR #22, `agent-relay-tools.ts`, source contract PASS | `a2a_agent_relay`, pending PR integration | Existing branch only | Real GS↔GT cross-session messaging with OAuth, audit and ack receipt |
| 14 | Webhook/Event Calling | `connector-runtime.ts` HMAC + dedup; `/hooks/generic` | `webhook_event_calling` inbound hook; no outbound replay | Signed webhook handler source | Verify real provider event signature and persisted receipt |
| 15 | Agent Sign→Command→Run | ATHENA/Yellow; PR #42 and PR #44 | `agent_sign_command_run` owner-gated `codex_selfhost/openai` | READ+plan+invalid owner sign rejection PASS | Register default-branch workflow, merge staged SOLO code, Owner confirms, Runner-1 job, D1 `COMMAND_RESULT_DONE` |

## Single gateway and no duplication
- `GET /api/connector-endpoint/v1/manifest`: all 15 names, classifications, source pointers and boundaries.
- `GET /api/connector-endpoint/v1/status`: sanitized MCP binding metadata plus all 15 categories. Not a proof that 15 adapters have run.
- `GET /api/connector-endpoint/v1/probe?mode=mcp&provider=<id>`: safe MCP discovery only, real provider required.
- `GET /api/connector-endpoint/v1/probe?mode=n8n`: safe n8n API health only.
- `POST /api/connector-endpoint/v1/command`: bounded allowlisted `repository_api_pr_api/rest_api → read_file/github`, `agent_api/agent_sign_command_run → codex_selfhost/openai` forwarded to **existing** `/api/wave/command`. No new dispatcher; no owner-sign forgery.
- Missing adapter, no capability match or incorrect environment must **fail closed**. Never execute secret/token/credential as command.
- `/api/chat/functions`, `/api/chat/agent`, `/hooks/generic` are still their existing independent application routes. Manifest does not convert them into full WAVE Command execution.
- No Production deployment, new Runner, D1 schema modification or external network listener is authorized by this inventory.

## Blocking dependencies / acceptance criteria
1. PR #42 source gate and clean Typecheck/Build prove Endpoint source; must be merged/deployed to staging before asserting HTTP Endpoint live.
2. PR #44 is draft/default registration; verify GitHub Actions workflow exists on default, has explicit Actions write grant, staging `ref`, host-stable Terminal Solo and OIDC; no implicit Owner signatures.
3. Authenticate Owner once, submit bounded Staging read and inspect D1.
4. Obtain *explicit* Owner Sign for one safe Run; verify GitHub dispatch, task claim, result hash and corresponding `COMMAND_RESULT_DONE` in D1.
5. Then progressively prove enabled provider MCP tools/call, n8n workflow, A2A exchange, NPX allowlist on Runner; report failures per provider.
6. Append every new verified proof to the SAME Certificate ID, sync SAME D1 row and verify SHA-256. Infisical stores identity/secret/leaf lifecycle; never falsely claim JSON 1:1 mirror.

Status labels: `SOURCE_IMPLEMENTED`, `GATE_TEST_PASS`, `LIVE_HEALTH_PASS`, `E2E_PASS`, `BLOCKED`, `NOT_VERIFIED`. Workflow Build success alone is NOT E2E PASS.

---

## 22 October 2026 — GH-2 per-mode live execution checkpoint (staging)

**One physical host**: Owner display `OCIAN_S-Host`, DigitalOcean Droplet `OCIAN-S-Host` (604432491), registered GitHub Runner `wave-runner-01`. **Operator account**: GH-2 `Wave-Runner-2` (repository currently GH-1 owned; GH-2 has write, not admin). **No new gateway, host, runner, CCS or credential store**.

This checkpoint separates **15 connector *modes***, **7 live Connector Registry entries**, **20 provider-catalog entries**, and **1 registered GitHub MCP provider binding**. Never conflate these counts with independent E2E executors. The 15 Mode API still shows conservative `SOURCE_READY/RUNTIME_PARTIAL/E2E_PENDING/LIVE_READ`; a successful GitHub MCP `tools/call` does **not** mean 15 external providers are callable.

| Mode | Current evidence and acceptance scope | Verdict |
|---|---|---|
| MCP | GH2 Owner→WAVE `/api/mcp-config/action` bounded `read_proof`→remote GitHub MCP `initialize/tools/list/tools/call`→resource content marker/hash. **28 tools discovered; 4,871 bytes** exact README content returned through MCP. [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). No arbitrary WRITE tools. | **SCOPED_READ_E2E_PASS** |
| n8n | `/api/connector-endpoint/v1/probe?mode=n8n` HTTP 200 for existing health. Authenticated API workflow inventory + one explicitly approved workflow execution/result are separate steps. [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). | **HEALTH_PASS / WORKFLOW_E2E_PENDING** |
| REST_API | GitHub read API and bounded WAVE handler evidence; no arbitrary outbound URL requests authorized. [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). | **SCOPED_READ_PASS** |
| TOKEN | GH-2 Actions-write principal and credential acceptance verified on staging deploy; direct transport `token` invocation correctly rejected HTTP 422. [39675610849](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39675610849); [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). | **SCOPED_AUTH_REFERENCE_PASS** |
| SECRET | Existing Infisical OIDC→Owner staging key→Cookie→Cloudflare API real authentication; secret value not exported as command. [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). Generic hook HMAC secret is **not** available in the selected staging Infisical project path `/`. | **OWNER_OIDC_PASS / FULL_INVENTORY_PENDING** |
| CREDENTIAL | D1 `provider_bindings` has one GitHub MCP secret-reference row; resolved by Worker to successfully authorize remote GitHub MCP `tools/call`. [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). | **GITHUB_SCOPE_PASS / OTHER_BINDINGS_PENDING** |
| REPOSITORY_API_PR_API | GitHub Repo READ confirmed by WAVE MCP and GH-2 GitHub connector. GH-2 Actions and workflow source writes confirmed; no broad PR write through WAVE mode. | **REPOSITORY_READ_PASS / PR_WRITE_UNPROVEN** |
| AGENT_API | Prior Owner signed WAVE→Codex GS self-hosted→D1 `DONE`, [39645715001](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39645715001). Not a new/current same-deployed-SHA Agent API invocation. | **HISTORICAL_SIGNED_AGENT_E2E / CURRENT_ROUTE_PENDING** |
| FUNCTION_TOOL_CALLING | Eight bounded function-tool definitions including live connector/read tools; no full paid model→function→provider→result loop E2E on current SHA. | **SOURCE_READ_ADAPTER / MODEL_TOOL_LOOP_PENDING** |
| NPX_NPX_CLI | `npx` present on host; non-install execution check added to GH2 proof, not general remote command adapter. | **CLI_PRESENT / OWNER_ROUTED_NPX_ADAPTER_PENDING** |
| NPM | Real GitHub Actions npm install/typecheck/build and Cloudflare staging deploy [39675610849](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39675610849). Package-management command is not a remote Agent Executor. | **BUILD_EXECUTION_PASS** |
| SDK | Reference to MCP SDK exists in historical OGE-130 context, but no generic Runner-side MCP SDK adapter E2E proved in current staging checkout. | **SDK_ADAPTER_PENDING** |
| A2A_AGENT_RELAY | Existing feature PR [#22](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/22) remains **OPEN, UNMERGED**, not current staging E2E. | **NOT_DEPLOYED / CROSS_AGENT_ACK_PENDING** |
| WEBHOOK_EVENT_CALLING | Existing signed HMAC generic event route `/hooks/generic` has real handler, D1 dedup and event tables. Live GH2 attempt [39678871151](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39678871151) found `OGENIC_GENERIC_HOOK_SECRET` **missing from scoped staging Infisical project/path**, so actual signed event/replay readback could not be completed. Safe optional workflow handling corrected on [39679062758](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39679062758). | **BLOCKED_STAGING_HMAC_SECRET** |
| AGENT_SIGN_COMMAND_RUN | Signed Owner→Runner GS Codex→D1 `DONE` historical E2E [39645715001](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39645715001), including read-back and result SHA. Not all potential Agent adapters. | **SCOPED_GS_CODEX_E2E_PASS** |

**CCS/1.0 is distinct from the 15 connector modes**: live Owner authenticated `INSERT/VERIFY/USE/LEASE/RETURN/REVOKE` (six verbs), revoked-use denial, cross-provider escalation denial and bounded READ lease policy passed [39669253447](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39669253447) and repeated [39677982543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39677982543). This is an **ephemeral policy-decision facade**, not proof of persisted real lease/side-effecting invocation.

### Closure blockers (no manufactured PASS)
1. Existing GH-2 self-host n8n inventory proof can verify real API authentication and count; a genuinely approved active staging workflow run + its execution readback must still be demonstrated.
2. The generic Webhook HMAC staging binding is missing from the selected Infisical project/path. Do not substitute the Owner Session key or register a dummy secret. Resolve canonical secret mapping and repeat signed event → dedup → D1 readback.
3. PR #22 A2A has not been merged; verify credential/actor scopes and run real two-party send+ack before updating the runtime label.
4. NPX/SDK current live Runner allowlist invocation, general function/model tool loop and actual WAVE-mediated PR write require dedicated exact task contracts and receipts; no shell or billing bypass.
5. Preserve old Checkpoint and same Certificate lincenc. Mark **FULL_15_MODE_E2E=FALSE** until these blockers close; token/secret/credential mode success means authorized reference-use and correct rejection, not unsafe execution.

