# OGENIC Phase VI — LIVE STATE

Updated: 2026-09-17

This file is the compact handoff for fresh chats and agent handoffs. Keep it small, current, and operational. Do not copy full chat history into this file.

## One-click resume contract

Selecting the **OGENIC Phase VI** tool is equivalent to `/OG.resume`.

On activation:
1. Read this file first.
2. Verify the current GitHub branch/HEAD and latest CI/deploy state before mutating anything.
3. Check staging health and, when Ops auth is bound, `/api/ops/state`.
4. Resume the first unfinished item below. Do not ask the owner to restate old chat context.
5. Reuse canonical state from D1/GitHub instead of replaying conversation history.
6. After a verified milestone or blocker, update this file with the new checkpoint.

## Canonical control plane

- Repository: `Ogenicchocolate21debug/Build-Platform`
- Active Phase VI branch: `phase-vi-provider-incentive-metering`
- Verified HEAD: `35abcc4e5210ff405125a0bfa53c3dd425e1272c`
- Supervisor: `Harness—Ammonite-OC-Ops`
- Shared State: Cloudflare D1
- Task Control: Linear
- Code Evidence: GitHub
- Primary Runtime: Cloudflare
- Agent Execution: Codex on a remote workspace, with OpenAI Agents API lane available from `npm run agent:full`
- Secrets: server-side only; do not commit or expose raw values

## Current execution state

OpenAI Agents API support was added to the staging branch:
- Runner: `scripts/openai-agent-full.mjs`
- Command: `npm run agent:full`
- Uses an OpenAI-hosted agent environment with high reasoning and multi-agent support.
- Guardrails: staging only; never touch `main`/production; no production deploy/delete/billing/account changes without Human Approval.
- Stream parser is aligned with the current Agents API event/item naming (`message`, `agent.session.turn.item.done`, `agent.session.turn.completed`).

Important execution rule:
- Do not assume a remote Codex host filesystem is automatically visible inside an OpenAI-hosted Agents sandbox.
- Prefer running Codex directly on the checked-out remote workspace for implementation/test/build.
- Use the Agents API runner as a separate execution lane only when source materialization into the hosted environment is configured safely.

## Current verification

- Branch/HEAD verified on GitHub: `phase-vi-provider-incentive-metering` @ `35abcc4e5210ff405125a0bfa53c3dd425e1272c`.
- Current commit checks: `Vercel – promptly` success; `Vercel Deployments – Ogenic-Registry` success; `Vercel – ogenic-control-tower` failure.
- GitHub Actions is not the primary executor while hosted Actions minutes are exhausted; do not burn retries on runner allocation failure.
- Public staging health has not yet been re-verified from an execution host in this checkpoint.

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

## Next unfinished work

1. Provision/connect a remote Codex workspace with terminal access and GitHub access to `Ogenicchocolate21debug/Build-Platform`.
2. Checkout `phase-vi-provider-incentive-metering` at or after HEAD `35abcc4e5210ff405125a0bfa53c3dd425e1272c`.
3. Run local verification on the checked-out repo: install dependencies only if required, then `npm run test`, `npm run typecheck`, and `npm run build` (or `npm run check`). Fix safe staging-only issues and rerun until green.
4. From that host, verify staging `/api/health`; then verify D1/ops state when authorized.
5. Ensure `OGENIC_OPS_KEY` is bound to the staging Worker without exposing its raw value.
6. Run a real shared-state smoke flow: create task -> claim -> checkpoint/event -> DONE -> confirm lock release/state.
7. Bind Linear task control to D1 task IDs and correlation IDs.
8. Continue provider binding and remaining Phase VI work only after the shared-state smoke flow is green.
9. Production promotion remains Human-Approval-gated after staging verification.

## Guardrails

- Read before write.
- Never log/commit raw secrets.
- Staging only unless the owner explicitly approves production.
- Never mutate `main`/prod from delegated agent lanes.
- Do not rebuild working components for naming changes.
- Prefer live GitHub/D1 evidence over stale chat state.
- If a provider permission is missing, stop only that lane and return the exact authorization required.
- Keep one user-facing toolkit: **OGENIC Phase VI**.
