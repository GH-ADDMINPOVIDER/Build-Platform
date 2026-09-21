# OGENIC Phase VI — LIVE STATE

Updated: 2026-09-21

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
- Last verified implementation commit: `13b666267d1534c8fea0a9bfa2b93dd6fdee0539`
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

- Three-mode UI implementation is committed on the staging branch: `ChatGPT | Chat API | Agent AI`.
- ChatGPT remains honestly labeled `Bridge pending`; no native bridge is claimed.
- Chat API preserves the existing direct Responses API path.
- Agent AI uses the existing `/api/chat/functions` execution path; successful turns are stamped back to canonical `owner-main / 1LSS`.
- An OpenAI-style Usage view is placed immediately after GM and reads existing dashboard telemetry; no D1 schema change was made.
- Local verification for implementation commit `13b666267d1534c8fea0a9bfa2b93dd6fdee0539`: 28/28 tests passed, TypeScript passed, Worker/client build passed.
- Cloudflare Workers Build `63b08840-da95-414c-a579-fb51b8846f35` succeeded for that commit and produced Version ID `835ed176-1e5d-423f-9fea-679fad7c8f35`.
- Public staging health returned Cloudflare runtime + D1 bound. `/chat`, `/app`, and `/overview` served the verified client bundle `index-Co44fY0r.js`; the deployed bundle contains the three mode labels, `owner-main · 1LSS`, the agent endpoint, and Usage UI.
- Authenticated runtime interaction is still unverified in this checkpoint because the available browser has no owner session. Do not mark Agent AI turn persistence or the authenticated Usage panel complete until observed through an existing authorized owner session.
- Branch verified on GitHub: `phase-vi-provider-incentive-metering`; implementation evidence is pinned to commit `13b666267d1534c8fea0a9bfa2b93dd6fdee0539`.
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
