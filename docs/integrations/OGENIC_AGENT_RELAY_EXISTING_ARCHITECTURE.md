# OGENIC Agent Relay — Existing Architecture Reuse Report

**Review date:** 2026-10-12  
**Repository:** Ogenicchocolate21debug/Build-Platform  
**Implementation branch:** feature/oge-agent-relay-collision-lab  
**Dependency:** PR #21, feature/oge-athena-mcp-plugin  
**Status:** source audit and feature-branch implementation; not deployed; no remote D1 migration applied.

## Executive decision

Reuse the existing WAVE Worker, /mcp endpoint, owner OAuth sign-in, Blue Diamond registry, canonical D1 binding, owner-main / 1LSS_OWNER_MAIN, and the existing agent_events audit ledger.

Do not create a second Gateway, ATHENA, Runner, or memory database. Keep the live relay ledger and simulation ledger separate inside the existing D1 database. Keep n8n and Discord optional so neither becomes the message source of truth.

## Existing components found in the staging source branch

| Existing component | Source evidence | Reuse decision |
|---|---|---|
| MCP route / Worker entry | worker/entry-yellow-stone.ts, worker/wave-manus-mcp-api.ts | Extend the existing /mcp route and tool registry. |
| OAuth server under PR #21 | worker/wave-mcp-oauth.ts; database/migrations/0016_oge_athena_oauth.sql | Bind token grants to an Owner-selected Agent Identity and narrow scopes. Source only until deployed. |
| Canonical task/event state | database/migrations/0004_agent_shared_state.sql | Reuse agent_events for metadata-only sent/delivered/ack audit entries. |
| Existing lane registry | database/migrations/0005_agent_lane_registry.sql | Use as architectural context; lane registration is not proof an external client is bound. |
| Existing 1LSS messages | database/migrations/0007_same_mind_chat_memory.sql, 0010_1lss_canonical_line.sql | Preserve owner-main / 1LSS_OWNER_MAIN; do not mix transient agent-relay messages into the user chat transcript. |
| Existing session references | database/migrations/0011_1lss_session_refs.sql, worker/session-recovery-api.ts | Use references for context/provenance, not as a proof that another ChatGPT session is live. |
| Existing Task Inbox | worker/task-inbox-api.ts | It is currently authenticated with WAVE owner session and routes work by existing session references; it is not an external agent-message relay. |
| Existing webhook ingress | worker/connector-runtime.ts | /hooks/generic verifies an HMAC signature and deduplicates events. Suitable for optional integrations, not direct ChatGPT account transport. |
| Existing n8n adapter | worker/n8n-migration-api.ts, worker/connector-runtime.ts | Existing n8n inspection is read-only. Use n8n later for optional routing/notifications after its live credential and endpoint are proven. |
| Existing Discord adapter | worker/discord-api.ts | Owner-authenticated message read/send paths exist. The source explicitly reports realtime_gateway: false; treat Discord as optional notification/transcript UI, not the ledger. |
| Existing DeepSeek adapter | worker/deepseek-api.ts, database/migrations/0013_ogenic_1lss_agent_direction.sql | An owner-authenticated provider API exists in source, while the earlier canonical direction records DeepSeek as planned/not bound until verified. Do not claim it can relay or run without current runtime proof. |
| Existing Runner / hosted Agent session | scripts/openai-agent-full.mjs, scripts/parallel-agent-runtime.mjs, tests/oge-54-* and tests/agent-session-runtime-contract.test.mjs | Reuse as execution infrastructure where appropriate; do not rebuild it for cross-account transport. |

## Proposed path

GS ChatGPT MCP client and GT ChatGPT MCP client
→ the same public WAVE /mcp endpoint
→ per-token Agent Identity + scope checks
→ D1 agent_threads / agent_messages
→ metadata-only events in existing agent_events.

The connection consent screen asks the Owner to assign GS, GT, Claude, or DeepSeek to that connection. This is an explicit Owner mapping: OAuth does not cryptographically attest which ChatGPT account is open. The Owner must choose the correct role separately on each account's connection flow.

New relay tools:

- agent_send_message
- agent_list_messages
- agent_ack_message
- agent_get_thread

Sender identity is derived from the validated access token. It is not accepted from a caller-supplied sender_agent_id. Every message is bounded, idempotency-keyed, tied to a thread/correlation ID, and labeled as untrusted peer content. A peer message cannot grant tool authority.

## Collision Lab — environment is the test subject

The environment is intentionally perturbed with deterministic, seeded scenarios:

- STALE_CONTEXT: agents receive divergent context revisions.
- DUPLICATE_DELIVERY: one view contains the same synthetic delivery twice.
- OUT_OF_ORDER: dependent message sequence is delivered before its prerequisite.
- SESSION_DRIFT: views disagree about the epoch of the same synthetic session.
- DELEGATION_LOOP: a repeated handoff chain provides no new evidence.
- IDENTITY_SPOOF: a synthetic sender claim disagrees with authenticated transport identity.

The design does not randomly corrupt live messages. Each run has a simulation ID and seed and writes only to agent_simulation_runs / agent_simulation_events. Each participant sees only its assigned view; the full fault plan is revealed through replay after both independent reports are submitted. Live relay tables and agent_events are not used for simulated events.

## Framework reuse assessment

### MCP Streamable HTTP

Keep MCP as the client contract because each connected ChatGPT account can invoke typed tools through the same remote endpoint. The existing code implements a constrained JSON-RPC HTTP handler rather than importing the full MCP SDK. It should be tested against the actual client/server contract before deployment; do not assume that source-level protocol labels prove interoperability.

OpenAI's current guidance expects tool-level securitySchemes, protected-resource and authorization-server metadata, authorization-code + PKCE, a resource/audience check, and token/scope validation on every protected tool call:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server

### Event-driven architecture and idempotency

Use D1 as the durable message ledger and existing agent_events as the audit trail. Keep the message body in the dedicated bounded message table; store only hashes/references and lifecycle facts in event records. Delivery and acknowledgment must be idempotent. correlation_id connects a thread; message_id identifies an individual message.

### n8n

n8n is optional orchestration, not the direct source of the ChatGPT-to-ChatGPT connection. Use it after the direct relay works, for approved notifications, escalation, timers, or summaries. The source branch currently exposes n8n inventory/readiness routes; this audit does not verify a live API key or workflow endpoint.

### Discord

Discord can mirror a redacted summary or provide a human-visible transcript channel. It is not the source of truth and should not be required for delivery. Its live bot-token and guild/channel permissions remain unverified by repository source alone.

## Security and operational boundaries

- No owner master key is used as an Agent bearer token.
- OAuth tokens and authorization codes are stored only as hashes.
- A connection's Agent Identity is assigned by the Owner at consent and stored on the authorization code/token record.
- Only four enumerated Agent IDs are accepted: gs, gt, claude, deepseek.
- Peer messages are never promoted to system/developer instructions and never execute tools by themselves.
- Raw keys, cookies, tokens and session cookies are prohibited from relay content and D1.
- Simulation tables are separate from live relay tables and the existing agent_events audit trail.
- No Production execution, n8n workflow execution, provider call, or deployment is added to the relay tools.
- The migration is additive and review-only on this branch; it must be applied to staging only after the Owner's explicit migration/deployment approval.

## Evidence currently available and remaining gaps

**Verified by source inspection:** named tables and source modules exist; route wiring, read-only MCP tools, OAuth server code, task inbox, webhook ingress, n8n adapter, Discord adapter and Agent runner references exist in the repository.

**Not verified by this source audit:** current D1 schema version on the live Worker, OAuth login/consent round-trip, correct OAuth token role binding in live requests, WAVE Worker deployment of this feature, n8n API reachability/credential status, Discord live connectivity, or a true cross-account message exchange.

The acceptance test must be run by the real GS ChatGPT connection and the real GT ChatGPT connection separately. A test harness, unit test, copied transcript, source diff, or CI pass is insufficient to report cross-account relay PASS.
