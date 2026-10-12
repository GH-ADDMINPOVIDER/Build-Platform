# OGE Athena Remote MCP — Data Stone

**Status:** Feature branch / not deployed. This document describes the intended staging bridge. It is not evidence that the public endpoint is live.

## Purpose

OGE Athena exposes a small, authenticated, read-only MCP surface so a compatible ChatGPT/Codex plugin host or Claude remote connector can inspect the existing WAVE runtime from one place.

- Target endpoint after an approved staging deploy: `https://wave.ogenicchocolate.com/mcp`
- Worker: `ogenic-phase-vi-staging`
- D1: existing `ogenic-phase-vi-staging` binding named `DB`
- Canonical conversation: `owner-main`
- Canonical line: `1LSS_OWNER_MAIN`
- Execution authority: Yellow Stone only; consequential actions are not exposed through this server.
- No D1 migration or new database is required.

## Authentication — dedicated read-only credential

The server intentionally does **not** accept `OGENIC_OPS_KEY`, session cookies, or raw provider credentials as the MCP credential.

1. Generate a dedicated high-entropy value for `OGENIC_MCP_READ_TOKEN`.
2. Store it in the existing Infisical **staging** runtime secret source used by the staging deploy workflow. Do not put the value in GitHub source, this package, D1, issue comments, or logs.
3. The existing staging binding manifest lists this name as optional. It is not marked required, so deployments remain independent of the MCP connector.
4. On a later, separately approved staging deployment, the Worker will receive that secret. Until then, the route fails closed with `CONFIGURATION_REQUIRED`.
5. Configure the connector with the header `Authorization: Bearer <your dedicated read token>`. Do not reuse the owner/operations key.

Responses are `401 REAUTH_REQUIRED` for a missing/wrong token and `503 CONFIGURATION_REQUIRED` when the dedicated Worker secret is absent.

## Read-only tools

| Tool | What it reads |
|---|---|
| `oge_athena_snapshot` | Worker provenance, D1 query health, Blue Diamond declared capabilities, staging bindings, and stored 1LSS session references |
| `oge_d1_health` | Per-table `COUNT(*)` probes for a fixed allowlist of existing D1 tables |
| `oge_athena_permissions` | Actor IDs, declared capabilities, runtime config state, and Yellow Stone execution boundary |
| `oge_1lss_sessions` | Session references in `chat_session_refs` for `owner-main` |
| `oge_integration_bindings` | Sanitized staging provider bindings; credential values and full endpoint URLs are not returned |

No tool writes data, changes a binding, starts a provider session, triggers a workflow, runs a provider tool, or approves an action.

## Status semantics — do not blur these

- **Configured/reference present** is not equivalent to authenticated.
- A registry's declared capability list is not proof of the provider's real scopes/permissions.
- A D1 `COUNT(*)` returning successfully proves that the query ran and reports a count; it does not prove that the data is semantically correct.
- Values returned from `chat_session_refs` are stored references to provider sessions. They do **not** prove the remote session is currently active or resumable.
- `LIVE_READ_VERIFIED` means the fixed count queries succeeded, not that the entire OGENIC system passed end-to-end.

## Connect Claude

After the server has actually been deployed and its dedicated token provisioned:

1. Open **Claude → Settings → Connectors → Add custom connector**.
2. Name it `OGE Athena`.
3. Use the target URL `https://wave.ogenicchocolate.com/mcp`.
4. Configure a fixed request header named `Authorization` with value `Bearer <OGENIC_MCP_READ_TOKEN>`.
5. Enable only the read-only tools required for the task, then invoke `oge_athena_snapshot`.

Claude's custom connector flow supports remote MCP with request headers for fixed API/bearer credentials. See [Claude remote MCP connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Connect ChatGPT / Codex

This repo includes a portable Agent Plugin package at `plugins/oge-athena/`. Its `mcp.json` declares a Streamable HTTP server and a fixed bearer/API-key scheme for plugin hosts that support that manifest.

For the ChatGPT **Add custom MCP server** UI, OpenAI's documented authentication options are OAuth, no authentication, or mixed OAuth/no-auth. That form does not accept a fixed API key. Therefore this static-token bridge must not be described as directly connectable through that ChatGPT UI. A native authenticated ChatGPT app needs a proper OAuth authorization server/client flow before it can be connected that way; this PR does not invent one or add OAuth state tables to D1.

See [OpenAI custom MCP server instructions](https://developers.openai.com/api/docs/guides/custom-mcp-server) and [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).

## Test plan

On this feature branch, run:

```sh
node --test tests/wave-manus-mcp-bridge.test.mjs
npm run check
```

After a separately approved staging deployment and credential provisioning, verify:

- no token / invalid token is rejected;
- `initialize`, `tools/list`, and each read-only `tools/call` work with the dedicated token;
- missing tables are shown as per-table query errors instead of being silently reported as healthy;
- no tool returns raw credential material or message bodies;
- route/deployment proof reports the exact Worker version and Git SHA;
- no write/execute tools appear in `tools/list`.

This PR does not configure Infisical, publish a public plugin, or deploy the endpoint.
