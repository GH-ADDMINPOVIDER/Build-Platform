# OGENIC Phase VI Database

Cloudflare D1 is the Phase VI shared operational state after verified migration/cutover. Migrations are append-only and run in numeric order from `database/migrations/`.

## Shared Agent State v1

Migration `0004_agent_shared_state.sql` provides the durable coordination layer for `Harness—Ammonite-OC-Ops`:

- `agent_tasks` — queue, ownership, priority, provider references, and lifecycle state.
- `agent_events` — append-only coordination/audit events.
- `agent_checkpoints` — resumable handoff references when an agent/session/quota stops.
- `agent_locks` — expiring resource locks to prevent multiple agents mutating the same resource concurrently.

Canonical lifecycle:

`QUEUED -> CLAIMED -> RUNNING -> VERIFYING -> DONE`

Blocked states remain explicit: `BLOCKED`, `REAUTH_REQUIRED`, `CONFIGURATION_REQUIRED`, `FAILED`, `CANCELLED`.

D1 stores operational state, IDs, hashes and references only. Raw secrets stay in Infisical and long prompts/conversation payloads are not persisted in this layer.
