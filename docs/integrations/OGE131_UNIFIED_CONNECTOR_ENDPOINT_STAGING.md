# OGE-131 — Unified Connector Endpoint (STAGING / REVIEW ONLY)

**Reuses** the existing WAVE Worker, ATHENA, Yellow Stone, Owner session, MCP config, read-only function tools, Connector runtime, Terminal Solo/Runner-1, D1/1LSS and OPS. No new runner, gateway, database, mode or credential store. PR stacked on PR #42.

## Routes (all under `/api/connector-endpoint/v1`)

| Method | Path | Functionality | Authorization |
| --- | --- | --- | --- |
| GET | `/manifest` | Existing 15-family source inventory / aliases / policies | Existing Owner or OPS |
| GET | `/status` | Existing MCP binding metadata and Connector runtime status | Existing Owner or OPS |
| GET | `/functions` | Catalog of exactly seven existing verified read-only functions | Existing Owner or OPS |
| POST | `/invoke` or `/functions/invoke` | Invoke an allowlisted existing verified read tool, validate its exact arguments | **Authenticated Owner session** |
| POST | `/test` | Safe, provider-specific existing Connector test | **Authenticated Owner session** |
| GET | `/events?limit=20` | Existing redacted connector event metadata only | **Authenticated Owner session** |
| GET | `/mcp/discover?provider=...` | Delegate to registered, allowlisted remote MCP initialize/tools-list | Existing Owner or OPS |
| POST | `/command` | Delegate to canonical WAVE Command, ATHENA and Yellow Stone | Existing Owner or OPS; consequential actions require Owner sign |

## Example read invocation (no raw credentials)

```http
POST /api/connector-endpoint/v1/invoke
Content-Type: application/json

{"name":"github_staging_status","arguments":{}}
```

All requests require existing authentication; do not expose Owner keys in client-side source or public documentation. The response does **not** imply every provider is live.

## Canonical mode inventory

MCP, n8n, REST API, Token, Secret, Credential, Repository/PR API, Agent API, Function/Tool Calling, NPX, npm, SDK, A2A/Agent Relay, Webhook/Event, Agent Sign Command Run. Existing `mcp`, `npx`, `api`, `sdk`, `pr_api`, `agent_api`, `credential` names remain supported as aliases/IDs. Manifest transport IDs are not credentials or executable shell commands.

## Safety / limitations

- Token, Secret and Credential interfaces are **reference-only**; no value export or direct execution.
- NPX, npm and SDK host adapters remain **RUNNER_ADAPTER_NOT_VERIFIED**, not independently runnable.
- Signed webhook ingress is a separate inbound path; a client cannot invoke it as an arbitrary command.
- A2A live cross-account relay is **NOT VERIFIED**, and cannot impersonate Owner approval.
- `/invoke` executes only seven existing **read-only** tools under signed Owner session.
- Non-read work follows `/command` → ATHENA → Yellow Stone → plan-bound Owner signature → existing Runner-1 Terminal Solo → OPS/D1 result evidence; full Agent Sign→Run E2E remains **NOT VERIFIED**.
- Existing GitHub Command Consumer workflow registration PR #44 is unmerged. Until reviewed and registered on the default branch, dispatch can still fail.
- External mTLS E2E and universal Infisical↔D1 JSON mirroring are **NOT VERIFIED**; Security Audit remains **PARTIAL**.
- Never merge to main or deploy to Production without Owner approval.

## Verification gates

- [ ] Run OGE-131 source + boundary contract tests on the PR head.
- [ ] TypeScript typecheck and Cloudflare frontend/worker build on the exact commit.
- [ ] Owner-authenticated staging `/manifest`, `/functions`, `/invoke`, `/test` and `/mcp/discover` HTTP receipts.
- [ ] Verify negative tests: no-auth 401, malformed body 422, unknown/write tool 409, NPX/Secret command 422, forged approval 409.
- [ ] For actual execution claims, capture Owner-approved Command → Runner → D1 `COMMAND_RESULT` receipt with SHA/run identity; this is not obtained from source or CI alone.
- [ ] Preserve existing OGE-128 certificate ID and 14 append-only evidence events; no canonical JSON modifications under this PR.
