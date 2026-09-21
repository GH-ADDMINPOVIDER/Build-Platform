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
- Current staging HEAD: `a42fe45addb6072a3321f29fec5abb490d97c387`
- Last verified implementation commit: `13b666267d1534c8fea0a9bfa2b93dd6fdee0539`
- 1LSS writer branch: `phase-vi-1lss-plugin-writer` @ `65123de31d69c62e796b5c45a7d666f46c4f1938`
- 1LSS writer PR: #8, draft; do not merge until runtime proof is complete.
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
- Cloudflare Workers Build `63b08840-da95-414c-a579-fb51b8846f35` succeeded for that implementation commit and produced Version ID `835ed176-1e5d-423f-9fea-679fad7c8f35`.
- Current staging HEAD `a42fe45addb6072a3321f29fec5abb490d97c387` also has a successful Cloudflare Workers Build check (`f941ad4a-78c6-4bc9-bfb2-23af46a58e78`).
- Public staging health previously returned Cloudflare runtime + D1 bound. `/chat`, `/app`, and `/overview` served the verified client bundle `index-Co44fY0r.js`.
- The deployed 1LSS bridge contract accepts `plugin-harness`, requires a stable Idempotency-Key for external surfaces, returns canonical `owner-main / 1LSS_OWNER_MAIN` sequences, and reports `replayed_count`.
- Writer implementation contract matches that bridge statically: `sync_1lss_turn` writes one immutable turn with key `mcp:<source_surface>:<turn_id>` and validates the canonical response.
- Writer branch now includes a direct proof harness: `npm run verify:1lss:runtime`. It writes one staging proof turn, replays the same turn, requires the same sequence, reads `/api/1lss/events` to prove exactly one canonical event, and checks `/api/1lss/status`. It never prints the Ops key.
- Writer proof commits: `f9991c4255eb981d6ae829f6963c3ca8ec7d5a3e` and `65123de31d69c62e796b5c45a7d666f46c4f1938`.
- GitHub hosted Actions are currently unusable for this branch while hosted minutes are exhausted. Fresh writer runs still fail before any workflow step is allocated (`steps = null`); do not burn retries or change billing.
- Authenticated writer runtime proof is still incomplete because the current execution environment has neither an authorized owner session nor a server-side `OGENIC_OPS_KEY` binding available to the runner. Do not claim completion until the proof harness runs from an authorized host.
- `Vercel – ogenic-control-tower` is not a Phase VI source of truth and its failure must not be treated as a staging Worker failure. Do not deploy or revive Control Tower for this proof.

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

1. Connect an authorized execution host with terminal + GitHub access. Do not use hosted Actions while runner allocation is blocked.
2. Checkout `phase-vi-1lss-plugin-writer` at or after `65123de31d69c62e796b5c45a7d666f46c4f1938`.
3. Bind the staging base URL and `OGENIC_OPS_KEY` server-side only; never print or commit the key.
4. In `apps/ogenic-control-tower`, run the local writer unit test and then `npm run verify:1lss:runtime`.
5. Accept writer runtime proof only if first write returns a canonical sequence, replay returns the same sequence with replay=true, the exact marker appears once through `/api/1lss/events`, and status reports a latest sequence at or after that proof.
6. Observe the resulting canonical turn through the Phase VI App/Web path. Record whether `cross_surface_ready` is true; freshness failure is a separate visibility issue, not an idempotency failure.
7. Keep PR #8 draft and unmerged until the runtime proof is captured. Do not target main/production.
8. After the 1LSS writer proof is green, resume shared-state smoke: create task -> claim -> checkpoint/event -> DONE -> confirm lock release/state.
9. Bind Linear task control to D1 task IDs and correlation IDs, then continue remaining provider binding.
10. Production promotion remains Human-Approval-gated after staging verification.

## Guardrails

- Read before write.
- Never log/commit raw secrets.
- Staging only unless the owner explicitly approves production.
- Never mutate `main`/prod from delegated agent lanes.
- Do not rebuild working components for naming changes.
- Prefer live GitHub/D1 evidence over stale chat state.
- If a provider permission is missing, stop only that lane and return the exact authorization required.
- Keep one user-facing toolkit: **OGENIC Phase VI**.
