# OGE-133 — TS / GS Endpoint Acceptance Handoff

Updated: 2026-10-19. Scope: OGENIC/WAVE STAGING ONLY. Target: **TS reviewer**, GS implementation counterpart, existing Runner-1. **Do not infer a green deployment from a green source test.** This is a durable, canonical human-readable pointer to evidence, not a second certificate or storage system.

## One routing table (URLs are not interchangeable)

| Owner | Exact destination | Purpose and method | Access / state |
| --- | --- | --- | --- |
| WAVE web | `https://wave.ogenicchocolate.com/` | WAVE frontend | Existing custom-domain config, public deployed-version SHA not checked in this handoff |
| WAVE Dashboard | `https://wave.ogenicchocolate.com/overview` | Mobile Owner dashboard | Cookie/Bearer Owner Session |
| Yellow / Owner Sign | `https://wave.ogenicchocolate.com/command` | WAVE/Agent Plan and confirmation UI | Existing Owner Session; local-page approval state, not a cross-app push inbox |
| WAVE Owner session | `https://wave.ogenicchocolate.com/api/session` | GET session metadata, POST Owner Key login | **Never pass Owner Key to TS, GitHub issues, D1 or model prompts** |
| **ONE unified Connector** | `https://wave.ogenicchocolate.com/api/connector-endpoint/v1` | Prefix, not a separate new origin | PR #48/#49 feature source only until deployed |
| Connector inventory | `GET /api/connector-endpoint/v1/manifest` | Transport inventory | Existing Owner/OPS Guard; 401 can mean auth boundary, not deployed-route proof |
| Connector protocols | `GET /api/connector-endpoint/v1/protocols` | 15 operations modes | OGE-132 feature branch, Owner/OPS Gate; no global runtime claim |
| Connector execute envelope | `POST /api/connector-endpoint/v1/operate` | 15 modes read/plan/confirm | **Signed Owner Session**, staged; never raw OPS header on this route |
| Functions and READ dispatch | `GET /api/connector-endpoint/v1/functions`, `POST /api/connector-endpoint/v1/invoke` | Pre-registered **7 READ-only functions** | Authenticated; invoke requires Owner Session |
| Connector provider status | `GET /api/connector-endpoint/v1/status` | MCP binding + provider states | Readiness is not provider tool execution proof |
| Connector health | `POST /api/connector-endpoint/v1/test` | Safe provider health probe | Owner Session, not workflow run |
| Connector MCP discovery | `GET /api/connector-endpoint/v1/mcp/discover?provider=ID` | Registry `initialize → tools/list` | Binding, configured secret ref and approved exact host needed |
| MCP child READ | `POST /api/mcp-config/read-tool` | `initialize → initialized notification → tools/list → tools/call` | Owner Session + exact Tool Allowlist + upstream readOnlyHint |
| Connector events | `GET /api/connector-endpoint/v1/events` | Bounded audit metadata | Owner Session, D1 binding |
| Connector command alias | `POST /api/connector-endpoint/v1/command` | Delegates to original WAVE command | No second authority |
| ATHENA / Yellow | `POST https://wave.ogenicchocolate.com/api/wave/command` | Plan `202 OWNER_APPROVAL_REQUIRED` then owner confirmation | No execute until authorized; consumer dispatch may be blocked |
| Yellow capability | `POST https://wave.ogenicchocolate.com/api/capabilities/execute` | Existing capability resolver/executor | Yellow policy and approval still apply |
| Runner result | `POST https://wave.ogenicchocolate.com/api/wave/command/result` | Existing privileged consumer evidence | **Never invoke from TS browser/chat** |
| Cloudflare worker | `ogenic-phase-vi-staging` | Worker binding `DB`; custom domain above | Backend, NOT an app URL |
| Cloudflare D1 | `ogenic-phase-vi-staging`, ID `b4ac3a33-df80-47cf-8e75-7574e025b87b` | Backend canonical runtime/1LSS evidence | NOT an exposed REST URL; no D1 schema mutation |
| Canonical session | `owner-main / 1LSS_OWNER_MAIN` | Recovery and evidence | Retrieve read-only after Owner auth |
| **n8n self-host** | `https://n8n-staging-76b7.up.railway.app` | Staging n8n runtime and `GET /healthz` | **NOT an MCP server URL** |
| **n8n Registry MCP** | `https://ogenic-registry.app.n8n.cloud/mcp-server/http` | User-registered n8n Cloud MCP server, exact host/path | Not n8n self-host base; binding+OAuth/secret context separately verified |
| Infisical OIDC | Existing `INFISICAL_IDENTITY_ID` and `INFISICAL_PROJECT_SLUG / ENV_SLUG / SECRET_PATH` | Machine Identity → runtime secrets | Owner Private/PAM account scope must be separately attested, no raw values |
| GitHub canonical | `https://github.com/Ogenicchocolate21debug/Build-Platform` | Source, PRs, CI, evidence | GS/TS accounts need independent exact repo permissions |
| GitHub consumer | `.github/workflows/wave-command-consumer.yml` | `workflow_dispatch` with `task_id` | PR #44 targets `main`; default workflow registration blocked pending approval |
| Runner-1 | GitHub self-hosted `wave-runner-01`, label `self-hosted,linux,x64,wave` | Executes within existing Terminal SOLO | **Not** a public SSH URL; no re-provision |
| Local tool OpenBot | No verified WAVE deployment or Runner-1 installation URL | Optional external/local agent workspace | NOT automatically connected by this handoff |

**Owner vs TS responsibilities:** TS audits exact URLs, endpoint contracts, compatible Auth/OAuth/CCS policy, response shape and live receipts. GS owns existing Runner/Infra integration, source/CI and signed runtime proof. Neither may fake an Owner Sign or move credentials into chat/issues. The existing Yellow Stone is sole side-effect authority and CCS scopes capability leases. All TS↔GS messages should reference the same SHA, PR, Run ID and Certificate ID.

## Distinguish 15 categories from 15 real service executions

`mcp,n8n,api,token,secret,credential,pr_api,agent_api,function_calling,npx,npm,sdk,a2a,webhook,agent_sign_run`

- **Tested on localhost (previous evidence):** 15/15 authenticated `inspect` passes and 16/16 unit/integration PASS on `wave-runner-01`; [OGE132 Run 39223909843](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39223909843).
- **MCP:** in-process mock passes `initialize → notifications/initialized → tools/list → tools/call`. Exact n8n Registry host newly allowlisted for staging *source*, with no `.n8n.cloud` wildcard, no credentials stored, no live binding claimed.
- **Infisical:** OIDC/GitHub credential bind historical PASS on OGE129 smoke, not a claim of universal Private/PAM permission or raw credential access.
- **Cloudflare D1:** certificate SHA readback verified [OGE128 Run 39202417749](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39202417749). Readback does not equal command `COMMAND_RESULT` completion.
- **mTLS:** local client/server loopback certified in [Run 39157854800](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39157854800), not live external WAVE mTLS handshake.
- **n8n:** historical `/healthz` can pass; test actual specific workflow invocation and output receipt separately.
- **Agent Sign → Run:** Owner-session, approval challenge, invalid sign denied in OGE129 [Run 39186105154](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39186105154). Real Owner confirmation → GitHub dispatch → `COMMAND_RESULT` D1 remains **NOT VERIFIED**.
- **Generic Validate and Bundle:** still FAIL on stacked PR; do not report all CI green. The bounded OGE-132 workflow PASSES.

## Exact TS checklist / strict evidence request

1. Re-read OGE-128 immutable certificate `.ogenic/proofs/oge-128-wave-runner-01-certificate-baseline.json` at branch `task/oge-128-runtime-certificate-20261018`; treat historical PASS as carried evidence.
2. Reconcile PR [#42](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/42) → [#48](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/48) → [#49](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/49); do not use unmerged URL paths as if on deployed staging.
3. Confirm **one** WAVE origin, exact n8n self-host vs Cloud MCP host, staging-only Cloudflare Worker, same D1 and same Runner-1. Check MCP `mcp-config` registration uses a known `provider_id` and approved `secret_ref` (not credential value).
4. Test with real **owner-authenticated staging HTTPS**: `GET /manifest`, `GET /functions`, `GET /status`, `GET /protocols`, 15 scoped `POST /operate` `inspect` and at least one allowed READ function. Without authentication these may return HTTP 401 for the entire prefix; **401 does not prove the feature route was deployed**.
5. For MCP, identify existing **registered** `provider_bindings` row and safe exact `read_tools_allowlist`. Test real external read `tools/list` and `tools/call` only with Owner consent and existing secret refs. Never request or print raw credentials.
6. n8n: separate `/healthz` PASS from actual workflow dispatch, execution id, result and verified 1LSS receipt. Do not assume OpenBot is installed.
7. Confirm GitHub Actions Consumer registration on **default** and Runner-1 capability. PR #44 is pending Owner merge/registration. Never test actual consequential `Owner Sign` on Owner's behalf.
8. Classify each entry `VERIFIED_LIVE`, `VERIFIED_LOCAL`, `BLOCKED_AUTH`, `BLOCKED_DEPLOY`, `BLOCKED_CONSUMER` or `NOT_TESTED`. Include HTTP, Run ID, SHA, D1/Ruby evidence only if observed. Do not make up results.

**Safe public-only evidence:** run `node scripts/oge133-ts-endpoint-public-audit.mjs` on the existing Runner-1; JSON `oge133-ts-endpoint-public-proof.json` includes status codes **without secrets or response bodies**. Public GET output is **NOT** evidence of authenticated provider execution. Never use `POST /command` or dispatch until real Owner approval.

## Runner-1 live public HTTP evidence — 2026-10-19

A bounded test ran on existing self-hosted `wave-runner-01`:
[Run 39230533940](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39230533940), source SHA `38426dbfd4adda9aba61bb688e04217d6ed45a9e`. **17/17 source tests PASS, Typecheck PASS, build PASS, local signed Owner fixture 15/15 PASS.** Artifact: `oge133-ts-public-endpoint-proof` (sanitized public-only HTTP statuses, no response bodies or credentials).

Read-only public HTTP from Runner-1:
- `GET https://wave.ogenicchocolate.com/api/session` → HTTP **200**; this proves the session route responds, **not** Owner login/authenticated access.
- `GET https://wave.ogenicchocolate.com/api/connector-endpoint/v1/manifest` → HTTP **404**.
- `GET https://wave.ogenicchocolate.com/api/connector-endpoint/v1/protocols` → HTTP **404**.
- `GET https://wave.ogenicchocolate.com/api/connector-endpoint/v1/status` → HTTP **404**.
- `GET https://wave.ogenicchocolate.com/api/white-diamond/status` → HTTP **401** (auth required, not proof of auth success).
- `GET https://n8n-staging-76b7.up.railway.app/healthz` → HTTP **200** (HTTP health only, not workflow execution).
- `GET https://ogenic-registry.app.n8n.cloud/mcp-server/http` → HTTP **404**. **MCP requires appropriate protocol client/method/auth. A GET 404 by itself is NOT proof that the MCP server does not work or its URL is wrong.**
- `GET https://api.github.com/repos/Ogenicchocolate21debug/Build-Platform/actions/workflows/wave-command-consumer.yml` → HTTP **404**; the GitHub Actions consumer is not registered on the default branch.

**TS acceptance conclusion:** WAVE origin is correct, 15-mode feature still **BLOCKED_DEPLOY** (the live Worker returned HTTP 404 on its new routes). The default-branch Consumer is **BLOCKED_CONSUMER** until Owner-authorized PR #44 integration. The n8n self-host is **HEALTH_RESPONDING**, distinct from execution. MCP Registry is **RPC_NOT_TESTED**; do not change the URL or mark the MCP binding failed just from GET. The historical local and mTLS/Credential proofs remain intact; they do not override the missing live receipts.

OGE-133 exact MCP URL allowlist added in `worker/mcp-config-api.ts`, with `tests/oge-133-ts-endpoint-urls.test.mjs` proving registration accepts the Owner-specified hostname and rejects the Railway URL, sibling n8n subdomains, HTTP, credentials-in-URL and nonstandard port. Test fake D1 only; no production binding changed.

**Remaining blockers, prioritized (do not create extra systems):** (1) review/merge PR stack into staging under existing deployment policy; verify actual deployed version SHA and retest authenticated `GET /manifest /protocols /status`. (2) inspect registered MCP binding in D1 and exact owner-approved provider secret references, then invoke safe `initialize/tools/list/tools/call` with a real MCP client. (3) resolve default-branch workflow registration via PR #44 with Owner approval; then real Owner-signed Runner-1 command receipt. (4) test n8n actual workflow execution and 1LSS receipt; (5) TS/GS cross-account access and per-Agent identity/CCS scope. No key value export, no direct sudo or root bypass, no merge to main/production here.

## Deployment and code ownership

Working feature: `feature/oge-132-lnwjud-connector-protocol-bridge-20261019` on Draft PR #49, source-only. Original staging branch: `phase-vi-provider-incentive-metering`. Default workflow registration: separate Draft PR #44 to `main`, not merged. Do not merge, modify prod/Candy, rotate Owner keys, read Private/PAM keys from chat, or create a second Gateway/Runner/D1. TS returns review findings as source/evidence pointers for the next scoped PR update.
