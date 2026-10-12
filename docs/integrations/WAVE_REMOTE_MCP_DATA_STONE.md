# OGE Athena — Owner Login, Remote MCP and D1 Evidence

**Status: feature branch only. OAuth source is not deployed. The new migration has not been applied.**

## What this is

OGE Athena is the single read-only remote MCP entry point for compatible ChatGPT/Codex and Claude clients. It reads existing WAVE runtime evidence, existing D1 state, declared Blue Diamond capabilities, sanitized staging integration bindings, and the existing `owner-main / 1LSS_OWNER_MAIN` session references.

- MCP endpoint: `https://wave.ogenicchocolate.com/mcp`
- Owner authorization: the same WAVE owner sign-in (`/api/session`) used by the existing app.
- OAuth discovery: `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`
- Authorization endpoint: `/oauth/authorize`
- Token endpoint: `/oauth/token`
- Dynamic client registration: `/oauth/register`
- Token revocation: `/oauth/revoke`
- Canonical conversation: `owner-main`; canonical line: `1LSS_OWNER_MAIN`
- Execution authority: Yellow Stone only. This connector does not expose write, deployment, workflow-trigger, or provider-execution tools.

## How connection is intended to work

1. Add the remote MCP URL to the client.
2. The client discovers the OGE OAuth authorization server and registers its public client metadata (ChatGPT CIMD or DCR; Claude supports automatic registration).
3. During the first protected tool call, the client opens the OGENIC WAVE authorization page.
4. Sign in with the existing WAVE owner session. If the owner is already signed in, no second key entry is needed.
5. Review and grant the read-only scopes once for that client.
6. The server issues short-lived access tokens and rotating refresh tokens. Only SHA-256 token/code hashes are stored. Plaintext tokens are returned to the OAuth client but are not stored in D1.
7. To revoke access, disconnect the connector in the client and/or call the existing OAuth revocation endpoint through a compatible admin flow. Token rotation and expiry are verified at the server.

No provider token, ChatGPT account token, Claude credential, browser cookie, or WAVE owner key is copied into GitHub, D1, or the connector manifest.

## Scope and permission boundaries

- `ogenic:read`: runtime provenance, D1 row counts/query health, declared actor/capability registry, and sanitized integration binding metadata.
- `ogenic:sessions:read`: stored `chat_session_refs` for `owner-main / 1LSS_OWNER_MAIN`.
- Consent is linked to the user's WAVE owner identity.
- The registry's declared capability is not proof of external provider-side permission.
- The integration view reports whether a server-side credential reference is present; it never returns the secret reference value or credential contents.
- Session references are records of previously observed sessions, **not proof that an external provider session is currently live or resumable**.
- D1 queries are fixed read-only `COUNT(*)` probes against a table allowlist. Empty tables are reported as `EMPTY`; query failures are reported as `QUERY_ERROR`, not silently downgraded to zero.
- The MCP transport exposes only five read tools: `oge_athena_snapshot`, `oge_d1_health`, `oge_athena_permissions`, `oge_1lss_sessions`, and `oge_integration_bindings`.

## D1 schema candidate

Migration `0016_oge_athena_oauth.sql` adds only OAuth state for registered public clients, short-lived authorization-code hashes, and hashed access/refresh tokens, including expiry and revocation markers. It does not create a second memory database or replace `owner-main`.

The migration is present in this feature branch for review only. It has **not** been applied to Cloudflare D1 and must not be auto-applied by a package build or deploy. A staging migration run is a separate explicit owner-approved step.

## Connect to ChatGPT

OpenAI's current custom MCP OAuth contract expects protected-resource metadata, authorization-server metadata, authorization-code + PKCE S256, and token audience/resource validation. OGE Athena is being implemented against that contract.

1. Use ChatGPT's **Settings → Apps/Connectors → Add custom MCP server** (UI labels can vary by plan/workspace).
2. Enter `https://wave.ogenicchocolate.com/mcp`.
3. Let ChatGPT discover the OAuth server and begin account linking.
4. Sign in to WAVE in the authorization window and select **Connect OGE Athena**.
5. Confirm the connector can list and call the five read-only tools.

Official guide: [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).

## Connect to Claude

1. Open **Settings → Connectors → Add custom connector**.
2. Use `https://wave.ogenicchocolate.com/mcp`.
3. Select OAuth sign-in. Use Claude's published identity or automatic client registration when offered.
4. Sign in to WAVE and authorize the read-only scopes.
5. Invoke `oge_athena_snapshot` first.

Official guide: [Claude remote MCP connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Required proof before enabling the connection

- Additive migration reviewed and applied only to staging after explicit owner authorization.
- A staging Worker deployment on the intended branch with exact Worker Version ID and commit SHA recorded.
- Public metadata endpoints return valid JSON and canonical issuer/resource values.
- The owner login and consent round-trip to the exact registered redirect URI.
- PKCE S256, code expiry, one-time code consumption, refresh-token rotation, scope restriction, audience/resource check, expiry and revocation tests pass.
- Unauthenticated tool calls return OAuth linking metadata; invalid, expired, revoked, or under-scoped tokens never return protected data.
- All five MCP tools pass; no raw secrets, message bodies, write actions, deployment actions, or workflow triggers are exposed.
- Full repository tests, typecheck, build and both OGE-124/OGE-125 proof workflows pass.

**Until that proof exists, the OAuth routes are source code only—not a live connector.** No deployment, D1 migration, secret change, Production change, or Candy change is performed by this PR.
