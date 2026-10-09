# OGENIC SAME MIND — canonical session lock and no-forget contract

Owner directive 2026-10-09: reuse EXISTING D1/1LSS, never fork a second memory.
Repo branch: phase-vi-provider-incentive-metering ONLY.

## Proven foundation
D1 conversation owner-main and ordered line 1LSS_OWNER_MAIN remain canonical. Every chat_messages.sequence_no follows the one owner line. source_surface records the entry door, never a separate truth. Existing chat_session_refs maps provider session refs to that same line and keeps first/last sequence, label and last_seen_at. History-page/sessions/recovery endpoints already exist, with owner session authentication and no schema changes.

OGE-54 OpenAI Agent path reuses an existing provider session ref and rejects missing/reset/failed session or model/effort mismatch with explicit RESET_REQUIRED / AGENT_SESSION_SETTINGS_CHANGE_REQUIRES_NEW_SESSION; never silently create a replacement. Other providers do not automatically have this functionality.

## Historic design still unfinished
OGE-18 and master checklist say A–Z provider session buckets (L LINE, G Gemini, M Manus, C Codex), reusable/expired/reauth status and provider-specific resume are not finished. The owner also described an X/Y/Z key-axis; exact semantics remain to be confirmed, not invented. OGE-105 owns this. Provider session IDs are cache/projections, not memories by themselves.

## First safe recall slice — OGE-104
Existing read-only owner-auth GET /api/1lss/context-recall?q=...&limit=... retrieves at most 12 bounded matching excerpts from prior owner-main messages, with provenance and no schema mutation. It returns UNVERIFIED_SOURCE and requires independent Ruby verification before any Green promotion. It is owner-auth only and does not automatically send full chat logs to external Gemini/DeepSeek/Manus/Codex providers. Missing query or unauthorized request fails closed.

## Remaining independently verifiable work
- OGE-105: explicit provider/model session resolver with deterministic A–Z lookup, stale/reauth status and safe restart behavior.
- OGE-106: each eligible real Agent must load currently relevant scoped canonical D1 and GitHub/Linear SHA via an authorized route, or return CONTEXT_UNAVAILABLE; no registry name counts as proof.
- OGE-107: authenticated real old chat -> new chat -> app/agent recovery with Ruby and owner-main receipt, without secret exposure or fake state.
- OGE-108: before opening a new issue verify old decisions, deferred receipts and current SHA so new phase does not forget earlier source; fail closed on stale data.
- OGE-103: independent read-only 1..100 audit (99 existing issues), not a second memory store.

## Security and boundaries
Yellow alone authorizes real external transmissions/tools; Ruby independently verifies, Green retains verified compact summaries and evidence pointers. Raw credentials and private chain-of-thought are never persisted in D1 knowledge. No new tables, production, main, Candy, secrets or speculative full parity claims. Owner canceled OGE-II-1 native OGE-102 and entire Mineral Phase II Project; do not resurrect the simulated product track.

## OGE-105 current bounded lookup, NOT live reusable session proof
Owner-authenticated GET /api/1lss/resolve-session?source_surface=openai-agent&model=...&reasoning_effort=... returns a matching existing provider session reference by exact recorded model/effort label, or explicit denial/ambiguity. Other providers including LINE/Gemini/DeepSeek/Codex can register refs through existing owner-auth API but have no verified model lock or automatic resume. can_auto_resume=false until independently verified live provider readiness. This does not implement X/Y/Z permission semantics or external authorization.

## OGE-106 retrieval presence guard (source implementation)
The generic readCanonicalD1Context must distinguish a DB binding from actual retrieved rows, reporting UNAVAILABLE when no canonical/system/session rows are returned. It includes bounded RECENT 1LSS message pointers and grouped session-ref metadata only, not prior conversation message content, and labels SOURCE_POINTERS_ONLY until an authenticated owner recall and Ruby verified promotion. WAVE Manus and new OpenAI Agent session paths fail closed before provider call when canonical source is unavailable. This does NOT establish that Gemini, DeepSeek, external Codex or ChatGPT plugins can access D1 and is not live E2E proof.
