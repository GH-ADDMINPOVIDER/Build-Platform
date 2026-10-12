# OGE Athena — Owner Login, Agent Relay, Collision Lab and D1 Evidence

**Status: feature branch only. OAuth source is not deployed. The new migration has not been applied.**

## What this is

OGE Athena is the single remote MCP entry point for compatible ChatGPT/Codex and Claude clients. It reuses the existing WAVE Worker and D1, with read-only runtime inspection, bounded Agent-to-Agent messaging, and a separate seeded collision simulator. It does not create another Gateway, ATHENA instance, Runner, or memory database.

- MCP endpoint: `https://wave.ogenicchocolate.com/mcp`
- Owner authorization: the same WAVE owner sign-in (`/api/session`) used by the existing app.
- OAuth discovery: `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`
- Authorization endpoint: `/oauth/authorize`
- Token endpoint: `/oauth/token`
- Dynamic client registration: `/oauth/register`
- Token revocation: `/oauth/revoke`
- Canonical conversation: `owner-main`; canonical line: `1LSS_OWNER_MAIN`
- Live relay: short Agent messages only, stored in the existing canonical D1 behind the authenticated identity.
- Collision Lab: scenario views, reports, and replays stored only in separate simulation tables.
- Execution authority: Yellow Stone only. Relay content never authorizes tool execution; this connector exposes no deployment or arbitrary provider-execution tool.

## How connection is intended to work

1. Add the remote MCP URL to the client.
2. The client discovers the OGE OAuth authorization server and registers its public client metadata (ChatGPT CIMD or DCR; Claude supports automatic registration).
3. During the first protected tool call, the client opens the OGENIC WAVE authorization page.
4. Sign in with the existing WAVE owner session. If the owner is already signed in, no second key entry is needed.
5. On the owner consent page, explicitly assign the connection to `GS` on the GS ChatGPT account, or `GT` on the GT ChatGPT account. Select a different role only for the matching agent account.
6. Grant the requested scope(s). Disconnect and reconnect if a previously cached connection has the wrong Agent Identity.
7. The server issues short-lived access tokens and rotating refresh tokens bound to the owner-selected Agent Identity. Only SHA-256 token/code hashes are stored; plaintext tokens are returned to the OAuth client but not persisted in D1.
8. To revoke access, disconnect the connector in the client or use the OAuth revocation endpoint. Token rotation and expiry are checked at the server.

No provider token, ChatGPT account token, Claude credential, browser cookie, or WAVE owner key is copied into GitHub, D1, or the connector manifest.

## Scope and permission boundaries

- `ogenic:read`: runtime provenance, D1 row counts/query health, declared actor/capability registry, and sanitized integration binding metadata.
- `ogenic:sessions:read`: stored `chat_session_refs` for `owner-main / 1LSS_OWNER_MAIN`.
- `ogenic:relay`: send, receive, acknowledge, and read bounded threads for the token-bound Agent Identity.
- `ogenic:simulate`: create seeded collision runs, retrieve the caller-specific synthetic view, submit one independent report per participant, and replay completed runs.
- Consent is linked to the user's WAVE owner identity.
- The registry's declared capability is not proof of external provider-side permission.
- The integration view reports whether a server-side credential reference is present; it never returns the secret reference value or credential contents.
- Session references are records of previously observed sessions, **not proof that an external provider session is currently live or resumable**.
- D1 queries are fixed read-only `COUNT(*)` probes against a table allowlist. Empty tables are reported as `EMPTY`; query failures are reported as `QUERY_ERROR`, not silently downgraded to zero.
- The MCP transport exposes five read-only observability tools, five live relay tools (`agent_get_profile`, `agent_send_message`, `agent_list_messages`, `agent_ack_message`, `agent_get_thread`), and four simulation tools (`agent_create_collision_scenario`, `agent_get_collision_scenario`, `agent_submit_collision_result`, `agent_replay_collision`).
- OAuth role assignment is explicit Owner mapping, not cryptographic proof of the underlying ChatGPT account identity. The Owner must choose GS/GT correctly for each connection.

## D1 schema candidate

Migration `0016_oge_athena_oauth.sql` is an additive candidate in this feature branch. It includes OAuth state, the D1 Agent message/thread ledger, and isolated `agent_simulation_runs` / `agent_simulation_events` tables. It reuses existing `agent_events` for metadata-only live audit references and does not create a second database or replace `owner-main`.

The migration is present for review only and has not been applied to Cloudflare D1. A staging migration/deployment remains a separate, explicitly owner-approved step.

## Connect to ChatGPT

OpenAI's current custom MCP OAuth contract expects protected-resource metadata, authorization-server metadata, authorization-code + PKCE S256, and token audience/resource validation. OGE Athena is being implemented against that contract.

1. Use ChatGPT's **Settings → Apps/Connectors → Add custom MCP server** (UI labels can vary by plan/workspace).
2. Enter `https://wave.ogenicchocolate.com/mcp`.
3. Let ChatGPT discover the OAuth server and begin account linking.
4. Sign in to WAVE in the authorization window and select **Connect OGE Athena**.
5. In the OAuth consent screen, assign this connection as `GT` (on the GT account) or `GS` (on the GS account), as appropriate.
6. Verify the read-only tools appear, then test the relay handshake using the instructions below.

Official guide: [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).

## First real relay acceptance test

1. Connect both ChatGPT accounts to `https://wave.ogenicchocolate.com/mcp` separately.
2. On the GS account's owner-consent page, assign `GS`; on the GT account's consent page, assign `GT`. Each side calls `agent_get_profile` to verify the identity bound to its token.
3. GS calls `agent_send_message` with recipient `gt`, content `HELLO_GT_FROM_GS`, and a unique idempotency key.
4. GT calls `agent_list_messages`, reads the message, then `agent_ack_message` using its message ID.
5. GT calls `agent_send_message` to `gs` with `HELLO_GS_FROM_GT`, using the same thread ID and correlation ID from the incoming message.
6. GS reads and acknowledges the reply. Both sides call `agent_get_thread` and verify the same thread/correlation ID.
7. Accept only with runtime evidence from two independent client connections. A synthetic API client or Owner copy/paste does not pass acceptance.

## Collision Lab — controlled environmental perturbation

The simulator offers `STALE_CONTEXT`, `DUPLICATE_DELIVERY`, `OUT_OF_ORDER`, `SESSION_DRIFT`, `DELEGATION_LOOP`, and `IDENTITY_SPOOF`. The seed generates a reproducible fault schedule. Each agent receives only its own simulated view, the peer view and fault labels remain hidden until both submit reports, and replay then reveals the schedule and reports. These records are written only to `agent_simulation_runs` and `agent_simulation_events`; no live messages, live `agent_events`, provider tools, or Production state is altered.

Useful collision metrics are fault detection, conflicting revision detection, idempotent duplicate handling, order-dependency handling, loop termination, identity-mismatch detection, and evidence-backed resolution. Disagreement itself is not a failure; unobserved or unbounded disagreement is.

## Connect to Claude

1. Open **Settings → Connectors → Add custom connector**.
2. Use `https://wave.ogenicchocolate.com/mcp`.
3. Select OAuth sign-in. Use Claude's published identity or automatic client registration when offered.
4. Sign in to WAVE and authorize the read-only scopes.
5. Assign `GS` to the GS account connection and grant the requested scopes.
6. Invoke `oge_athena_snapshot` first, then test `agent_list_messages` / `agent_send_message` when the other account is connected.

Official guide: [Claude remote MCP connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Required proof before enabling the connection

- Additive migration reviewed and applied only to staging after explicit owner authorization.
- A staging Worker deployment on the intended branch with exact Worker Version ID and commit SHA recorded.
- Public metadata endpoints return valid JSON and canonical issuer/resource values.
- The owner login and consent round-trip to the exact registered redirect URI.
- PKCE S256, code expiry, one-time code consumption, refresh-token rotation, scope restriction, audience/resource check, expiry and revocation tests pass.
- Unauthenticated tool calls return OAuth linking metadata; invalid, expired, revoked, or under-scoped tokens never return protected data.
- Five observability tools, four relay tools and four simulation tools pass their contract tests.
- Two independently connected ChatGPT accounts complete the HELLO message/reply/confirmation loop with both OAuth-bound Agent Identities, message IDs, timestamps, and correlation ID recorded by Staging Runtime.
- Collision scenarios use only the simulation tables and never alter the live message ledger.
- Full repository tests, typecheck, build and both OGE-124/OGE-125 proof workflows pass.

**Until that proof exists, the OAuth routes are source code only—not a live connector.** No deployment, D1 migration, secret change, Production change, or Candy change is performed by this PR.
