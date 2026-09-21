# OGENIC 1LSS plugin writer

Feature-branch-only adapter for the existing OGENIC GOD TOOLKIT.

- Tool: `sync_1lss_turn`
- Existing bridge: `POST /api/1lss/event`
- Canonical conversation: `owner-main`
- Canonical session line: `1LSS_OWNER_MAIN`
- Allowed source surfaces: `chatgpt-app`, `plugin-harness`
- Stable idempotency key: `mcp:<source_surface>:<turn_id>`
- Authentication: server-side `OGENIC_OPS_KEY` only
- No new D1 conversation or schema
- No production completion claim without runtime evidence

Runtime acceptance requires a real plugin invocation to return a canonical sequence, the same turn retried with the same `turn_id` to return that same sequence without duplication, the exact event to appear through `/api/1lss/events`, and App/Web to observe it.
