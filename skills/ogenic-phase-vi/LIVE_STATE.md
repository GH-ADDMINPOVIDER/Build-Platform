# OGENIC Phase VI — LIVE STATE

Updated: 2026-09-06T18:05:00+07:00

This file is the compact handoff for fresh chats and agent handoffs. It must stay small, current, and operational. Do not copy full chat history into this file.

## One-click resume contract

Selecting the **OGENIC Phase VI** tool is equivalent to `/OG.resume`.

On activation:
1. Read this file first.
2. Verify the current GitHub branch/HEAD and latest CI/deploy state before mutating anything.
3. Check Cloudflare `/api/health` and, when Ops auth is bound, `/api/ops/state`.
4. Resume the first unfinished item below. Do not ask the user to restate old chat context.
5. Reuse canonical state from D1/GitHub instead of replaying conversation history.
6. After a verified milestone or blocker, update this file with the new checkpoint.

## Canonical control plane

- Repository: `Ogenicchocolate21debug/Build-Platform`
- Active Phase VI branch: `phase-vi-unified-cloudflare`
- Supervisor: `Harness—Ammonite-OC-Ops`
- Shared State: Cloudflare D1
- Task Control: Linear
- Code Evidence: GitHub
- Execution: GitHub Actions / Cloudflare Workers / delegated agents
- Secrets: Infisical
- Primary Runtime: Cloudflare

## Shared-state v1 implemented

Migration present: `database/migrations/0004_agent_shared_state.sql`

Worker shared-state API is implemented behind `OGENIC_OPS_KEY` auth:
- `GET /api/ops/state`
- `GET /api/ops/tasks`
- `POST /api/ops/tasks`
- `POST /api/ops/claim`
- `GET /api/ops/events`
- `POST /api/ops/events`
- `POST /api/ops/checkpoints`
- `POST /api/ops/locks/release`

Task lifecycle:
`QUEUED -> CLAIMED -> RUNNING -> VERIFYING -> DONE`

Exceptional terminal states:
`BLOCKED | REAUTH_REQUIRED | CONFIGURATION_REQUIRED | FAILED | CANCELLED`

Resource locks and checkpoints are used so Codex/Claude/other agents can hand work off without editing the same resource concurrently.

## Next unfinished work

1. Verify staging health and current CI from GitHub rather than trusting stale chat state.
2. Ensure `OGENIC_OPS_KEY` is bound to the staging Worker without exposing its raw value.
3. Run a real shared-state smoke flow: create task -> claim -> checkpoint/event -> DONE -> confirm lock release/state.
4. Bind Linear task control to D1 task IDs and correlation IDs.
5. Add agent lanes (Codex / Claude / other executor) only after the smoke flow is green.
6. Continue Notion -> D1 migration and provider binding work after shared-state control is verified.
7. Production promotion remains approval-gated after staging verification.

## Guardrails

- Read before write.
- Never log/commit raw secrets.
- Do not rebuild working components for naming changes.
- Do not rely on old chat messages as source of truth when live GitHub/D1 state is available.
- If a provider permission is missing, stop only that lane and return the exact authorization required.
- Keep one user-facing toolkit: **OGENIC Phase VI**.
