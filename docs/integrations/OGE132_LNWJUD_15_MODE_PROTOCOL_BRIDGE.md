# OGE-132 — lnwjud-inspired 15-mode Connector Protocol Bridge (Staging only)

## Origin, reuse and license
Compared against [engasnm111/lnwjud](https://github.com/engasnm111/lnwjud) main at source v5.8.7, MIT license, Copyright (c) 2026 Adisorn (lnwjud project). Concepts adapted: MCP child discovery/call separation, tool schema/risk registry, per-invocation owner permission, durable task receipts, parallel-read isolation. This change independently implements bounded WAVE Cloudflare Worker routes, *not* a wholesale copied Node 24/Electron MCP runtime. Retain upstream LICENSE and attribution if source is later copied verbatim.

OGENIC Certificate remains **OGE-128** `oge-128-wave-runner-01-baseline-20261018`; it records 15 connection/calling categories and 23 separate plugin groups. Source-level exposure of 15 categories is NOT 15 live E2E executions.

## Canonical path
`Caller → WAVE /api/connector-endpoint/v1 → Signed Owner Session → ATHENA → Yellow Stone → plan-bound Owner confirmation → existing D1 queue → GitHub consumer → existing Runner-1 Terminal SOLO → COMMAND_RESULT → D1 / 1LSS`

The owner key, signing, Secret/Infisical Machine Identity and runner credential bindings are REUSED, not reissued. The bridge does not read or return raw secret values. No independent shell/NPX executor.

## Functional HTTP surfaces

- `GET /api/connector-endpoint/v1/protocols` — all 15 modes, allowed operations and *source* readiness
- `POST /api/connector-endpoint/v1/operate` — strict request schema; **signed Owner session** only
- `POST /api/connector-endpoint/v1/ingress/line|meta|generic|openai` — forwards raw bytes and signature to the **original HMAC-verified** provider webhook handler. Meta supports its existing GET verification.
- Existing `/manifest`, `/functions`, `/invoke`, `/mcp/discover`, `/status`, `/test`, `/events`, `/command` continue unchanged
- `POST /api/mcp-config/read-tool` — invoked indirectly from `operate` or the existing protected MCP path; exact tool allowlist plus provider `readOnlyHint===true`, Owner session and registered staging MCP binding required.

`operate` body example (READ):
```json
{"transport":"function_calling","operation":"invoke_read","name":"github_staging_status","arguments":{},"environment":"staging"}
```
`operate` body example (approval-required, no actual run until Owner confirmation):
```json
{"transport":"npx","operation":"plan","command":"Audit staging package scripts through the existing Codex Runner, no package installs or secrets","environment":"staging"}
```
Use exact server-generated `approval_id` and `operation:"confirm"` with `approval:{"confirmed":true,"approval_id":"..."}` under the Owner session; never construct approval IDs yourself. Same WAVE/Yellow plan-bound policy applies.

## Actual operation boundaries by mode

| Mode | Registered operations | Implementation scope |
| --- | --- | --- |
| MCP | inspect, discover, invoke_read, plan, confirm | Remote MCP initialize/tools/list; read tools/call only with OWNER-configured exact `read_tools_allowlist` in existing binding metadata and server readOnlyHint; write tools through Yellow plan |
| n8n | inspect, probe, plan, confirm | Existing n8n health probe; mutation goes through WAVE command, not direct workflow invoke |
| REST API | inspect, resolve, invoke_read, plan, confirm | Existing capability resolver and seven verified read functions |
| Token | inspect, reference | D1 provider-binding reference status only, no token export |
| Secret | inspect, reference | Infisical/D1 handle status only, no secret export |
| Credential | inspect, reference | Owner/D1 provider binding metadata only, no credential export |
| Repository/PR API | inspect, invoke_read, plan, confirm | Only existing GitHub staging status / file READ; write via command |
| Agent API | inspect, plan, confirm | Existing ATHENA command; live provider execution separately gated |
| Function Calling | inspect, invoke_read, plan, confirm | Seven existing READ tools, never arbitrary function |
| NPX/CLI | inspect, plan, confirm | Existing Codex task queue / Runner-1 boundary, **native NPX adapter not proven** |
| npm | inspect, plan, confirm | Existing Codex task queue / Runner-1 boundary, **native npm run adapter not proven** |
| SDK | inspect, plan, confirm | Existing Codex task queue / Runner-1 boundary, **SDK runtime adapter not proven** |
| A2A Relay | inspect, plan, confirm | Team intent through ATHENA/Yellow; **GS↔GT live relay not proven** |
| Webhook/Event | inspect, signed ingress | Reuse original HMAC verification, replay dedup and connector event records |
| Agent Sign Command Run | inspect, plan, confirm | Reuse canonical Owner two-step approval → D1 queue → Runner-1 consumer |

**No end-to-end claim** until an authenticated deployed staging HTTP trace and real approved Command RESULT receipt are observed. An approval-required response is NOT a completed execution.

## Verification
- [ ] OGE-132 bounded source tests + typecheck + build on exact feature SHA using **existing** `wave-runner-01` (CI not deployment).
- [ ] Local Worker HTTP unauthenticated tests: `GET /protocols` / `POST /operate` must return 401; signed webhook invalid HMAC must fail.
- [ ] Authenticated staging read tests for all 15 `inspect` modes plus real provider probes; only call MCP read tool when Owner-reviewed binding has exact allowlist.
- [ ] Owner Sign → Runner-1 → D1 `COMMAND_RESULT` readback with Run ID and SHA (PR #44 consumer default-branch registration must be reviewed first).
- [ ] Retain PR #42/#48 stacked base; no merge or Production deployment under OGE-132.

## Security and non-goals
No Owner key, raw credentials, bearer tokens, SSH keys, Infisical secrets, D1 content or private provider responses committed. No `main` change, no new secrets DB, runner, endpoint host, queue, agent, or universal shell. `GET /protocols` describes source contracts, not provider health proof. Existing Certificate facts remain immutable.
