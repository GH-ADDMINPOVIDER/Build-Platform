---
name: oge-athena
description: Inspect the OGENIC WAVE staging runtime, D1 query health, declared actor capabilities, integration bindings, and owner-main session references using read-only OGE Athena MCP tools. Use when validating OGENIC runtime status or preparing GT × GS review.
---

# OGE Athena — Evidence-First Runtime Review

## First call

Call `oge_athena_snapshot` before drawing conclusions. If the MCP tool is unavailable or authorization fails, report the exact failure instead of inferring status from source code.

## Evidence discipline

- Separate GitHub source, workflow/deploy evidence, and live runtime evidence.
- Report the observed Worker Git SHA and Worker Version ID from the runtime tool; do not substitute the current GitHub branch HEAD.
- Read `oge_d1_health` when D1 status is in question. Report each table's `READ_OK`, `EMPTY`, or `QUERY_ERROR` individually. Do not treat a query error as an empty table.
- Treat a capability list as a declaration, not proof of provider-side permission. Look for an actual verified authorization/handshake result before claiming access.
- Treat `chat_session_refs` values as stored references, not proof that an external provider session is currently active.
- If data is partial, stale, unavailable, or unauthenticated, say so clearly and request only the smallest needed next step.

## Security and control

- Never request, echo, or store raw API keys, tokens, cookies, or provider credentials in D1, issues, logs, or GitHub.
- This connector is read-only. It has no write, delete, deployment, workflow-trigger, or provider-execution tools.
- Consequential execution remains behind Yellow Stone and explicit Owner approval.
- Do not touch `main`, Production, Candy Baked Factory, billing, secrets, or D1 schema from this skill.
- Keep canonical context on `owner-main / 1LSS_OWNER_MAIN`; do not create a parallel memory database.

## Report format

1. Runtime evidence: Worker SHA, Worker Version ID, check timestamp.
2. D1: per-table query states and row counts.
3. Permissions: declared capabilities vs verified provider-side scopes.
4. Sessions: source surface, stored reference, sequence, last-seen timestamp, and the caveat that this is not live-session proof.
5. Blockers: precise error codes and the smallest safe next action.
