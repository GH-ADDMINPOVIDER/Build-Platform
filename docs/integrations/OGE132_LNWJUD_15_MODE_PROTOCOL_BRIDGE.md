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

## Verified checkpoint — 2026-10-19 (retrieve this FIRST after a chat/session reset)

**Canonical recovery, not a new certificate or memory store:**
- Repository: `Ogenicchocolate21debug/Build-Platform`. Feature branch: `feature/oge-132-lnwjud-connector-protocol-bridge-20261019`; Draft PR [#49](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/49), stacked on OGE-131 PR #48 and WAVE Command UI PR #42. DO NOT mistake the feature branch for deployed staging.
- Existing canonical staging branch: `phase-vi-provider-incentive-metering`; original OGE-128 certificate ID: `oge-128-wave-runner-01-baseline-20261018`. Certificate remains authoritative for older PASS receipts and connection inventory.
- Existing canonical memory: D1 `ogenic-phase-vi-staging`, conversation `owner-main`, line `1LSS_OWNER_MAIN`; to retrieve real runtime state use existing authenticated session recovery instead of inventing an LLM memory claim.
- **Last code-only checkpoint before this documentation update:** `757dfe91953792eb968171c2c3c4507fd6a8ff26`; OGE-132 verified [Run 39220800389](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39220800389), successful on original `wave-runner-01`.
- Evidence: 15 tests PASS / 0 FAIL; TypeScript typecheck PASS; frontend/Worker build PASS; 15/15 **authenticated localhost HTTP `inspect`** routes PASS with isolated test-only owner credential. No-auth GET /protocols and POST /operate => HTTP 401. Unsigned generic webhook denied. Forged approval and production scope denied.
- OGE-131 original Endpoint proof [Run 39208961419](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39208961419) PASS; OGE-128 D1 certificate SHA readback [Run 39202417749](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39202417749) PASS. These *historical* proofs do not become false when the chat resets.
- The repository-wide `Validate and Bundle OGENIC Phase VI` workflow still FAILS separately from the bounded OGE-132 tests; avoid saying all CI green.
- **DO NOT CLAIM**: 15 live external Provider E2E; deployed OGE-132 staging; native NPX/npm/SDK external adapter; GS/TS cross-account A2A; mTLS full verification; Agent → Owner Sign → Runner-1 → D1 `COMMAND_RESULT` completed. Those are still pending evidence.

**Resume sequence after new chat:** Read OGE-128 certificate + this file + latest PR #49 head/CI → read `worker/connector-protocol-bridge.ts`, `worker/mcp-config-api.ts`, `worker/entry-yellow-stone.ts` → choose the smallest unresolved adapter gap → implement on the existing PR branch and verify with original Runner-1 → append only new truthful receipts. Preserve single Yellow Stone authority, Owner Key, existing Infisical OIDC and D1/1LSS; do not issue new credentials or require the Owner to re-enter already-proven logins.

## Verification checklist
- [x] OGE-132 bounded tests, exact SHA typecheck and build on `wave-runner-01` — Run 39220800389.
- [x] Local Worker signed Owner fixture: 15/15 `inspect` paths, no-auth 401, unsigned generic hook deny, fake approval deny — same Run.
- [ ] Existing real provider HTTP adapter proof: MCP `initialize → tools/list → tools/call` for an Owner-allowlisted READ tool with evidence (not a simulated mock).
- [ ] Real n8n health and existing webhook/Function/REST live provider receipts from deployed staging.
- [ ] Real authenticated deployed staging `GET /protocols`, `POST /operate` and read adapter receipts with SHA.
- [ ] Owner Sign → Runner-1 → D1 `COMMAND_RESULT` readback with task ID and evidence SHA (PR #44 default-branch workflow registration requires review).
- [ ] Resolve generic repository `Validate and Bundle` failure without rewriting unrelated operational infrastructure.
- [ ] Preserve owner-main continuity and the single OGE-128 certificate; do not merge or deploy to Production without approval.

## Follow-up OGE-132.1 — MCP Tool Call Contract + Local HTTP Adapter Proof

**GitHub Actions exact code SHA**: `a54c546db08bc6ee9d315d6827ccf5437ff4e845`. [Run 39223594901](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39223594901) **SUCCESS** on existing `wave-runner-01`. Source tests: **16 passed, 0 failed**; TypeScript and Worker/Frontend Build PASS; no deployment.

New implementation:
- Existing `worker/mcp-config-api.ts` now acknowledges successful initialize using MCP JSON-RPC `notifications/initialized` before `tools/list` and `tools/call`, preserving remote session ID and server-side existing Owner/OPS guards.
- Fixed double-escaped bearer-secret redaction and MCP argument-key detection in the existing MCP read adapter. Raw keys/secrets remain server-side.
- Added `tests/oge-132-mcp-runtime-bridge.test.mjs`: exercises the bundled **real Hono routing and signed Owner HMAC session**, in-process fixture Provider `initialize → notifications/initialized → tools/list → tools/call`, exact read-only allowlist, provider `readOnlyHint`, dangerous tool rejection, secret-shaped argument rejection, response redaction, and `isError` → HTTP 502. **Fixture/provider mock is not a live upstream connection.**
- Expanded existing Runner-1 **local Worker HTTP**: existing 15/15 signed-session `inspect` PASS; `/protocols` returns exactly 15 categories; MCP `discover` with `simulated` provider reports `SIMULATED` and `real_available:false`; unknown function → HTTP 409; OPS header without Owner Session → HTTP 401; n8n probe reports truthful health and never reports workflow execution proven.
- HTTPS staging real MCP adapter, authenticated real provider reads, GS/TS A2A, Runner native NPX/npm/SDK adapters, Owner Sign → Runner → D1 COMMAND_RESULT are **not proven by these tests**. External mTLS E2E remains unverified.
- General repository `Validate and Bundle OGENIC Phase VI` check remains separately **FAIL**, unchanged under this feature. Do not claim global CI pass.

**Next actionable gate**: inspect/reconcile the existing Provider MCP bindings for a reviewed exact `read_tools_allowlist`, deploy OGE-132 to *staging only* after Owner review and PR stack integration, then issue authenticated live HTTP read receipts. GitHub default-branch workflow consumer registration PR #44 and a real Owner approval remain dependencies for terminal COMMAND_RESULT proof. Do not prompt Owner to recreate historical Certificate, Infisical credentials or known logins.

## Security and non-goals
No Owner key, raw credentials, bearer tokens, SSH keys, Infisical secrets, D1 content or private provider responses committed. No `main` change, no new secrets DB, runner, endpoint host, queue, agent, or universal shell. `GET /protocols` describes source contracts, not provider health proof. Existing Certificate facts remain immutable.
