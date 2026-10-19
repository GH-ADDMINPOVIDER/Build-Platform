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
