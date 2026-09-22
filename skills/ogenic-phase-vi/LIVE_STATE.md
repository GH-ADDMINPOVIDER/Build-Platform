# OGENIC Phase VI — LIVE STATE

Updated: 2026-09-22

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
- Current staging implementation/cleanup HEAD: `346be0b7fadc4ac8030786961f12424cff42a833`
- Last verified core implementation commit: `13b666267d1534c8fea0a9bfa2b93dd6fdee0539`
- 1LSS writer branch: `phase-vi-1lss-plugin-writer` @ `65123de31d69c62e796b5c45a7d666f46c4f1938`
- 1LSS writer PR: #8, draft and unmerged; runtime acceptance is captured, but do not merge without explicit owner approval.
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
- Public staging health previously returned Cloudflare runtime + D1 bound. `/chat`, `/app`, and `/overview` served the verified client bundle `index-Co44fY0r.js`.
- The deployed 1LSS bridge contract accepts `plugin-harness`, requires a stable Idempotency-Key for external surfaces, returns canonical `owner-main / 1LSS_OWNER_MAIN` sequences, and reports `replayed_count`.
- Writer implementation contract matches that bridge statically: `sync_1lss_turn` writes one immutable turn with key `mcp:<source_surface>:<turn_id>` and validates the canonical response. Writer unit tests cover payload/auth secrecy, stable replay, and canonical contract rejection.
- Writer branch includes `npm run verify:1lss:runtime`; its client transport remains unit-verified.
- Live staging runtime acceptance for the writer contract is now GREEN. Build-attested proof commit `d2b49fb51f057358f4c0688ea76afaaf9562402a` ran inside the Cloudflare staging build and required: source `plugin-harness`, key `mcp:plugin-harness:<turn_id>`, canonical `owner-main / 1LSS_OWNER_MAIN`, retry to the same sequence, replay recognition, and the exact proof event visible once.
- Proof Cloudflare Build: `00997821-396e-4589-ae31-fec8bee42ad1` — SUCCESS; Version ID `d1db2990-aac6-4caa-bb88-3bd8e1cf305b`.
- The proof was intentionally a staging build-attested harness exercising the same persistence/idempotency contract; do not overstate it as the writer-branch JS helper itself executing inside the Worker.
- The temporary proof endpoint/runner was removed immediately afterward at `346be0b7fadc4ac8030786961f12424cff42a833`. Cleanup Cloudflare Build `4cd18b80-b68f-4740-a4a3-6757375a62cf` succeeded; Version ID `6f1182e5-bb3d-4fd2-85f6-c7c0af425ae2`. No permanent proof bypass remains.
- `cross_surface_ready` App/Web freshness is a separate visibility signal from writer idempotency and is not part of the now-complete writer runtime acceptance.
- GitHub hosted Actions remain unavailable while hosted minutes are exhausted (`steps = null`); do not burn retries or change billing. This is no longer a blocker for the 1LSS writer runtime proof.
- `Vercel – ogenic-control-tower` is not a Phase VI source of truth and its failure must not be treated as a staging Worker failure.

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

1. The 1LSS plugin-writer runtime acceptance is complete. Keep PR #8 draft/unmerged until the owner explicitly chooses the integration/merge path.
2. Observe the canonical proof turn through the Phase VI App/Web path when an owner viewport is active; record `cross_surface_ready` separately from writer idempotency.
3. Resume shared-state smoke: create task -> claim -> checkpoint/event -> DONE -> confirm lock release/state.
4. Bind Linear task control to D1 task IDs and correlation IDs, then continue remaining provider binding.
5. GitHub hosted Actions quota is an independent CI limitation; use Cloudflare staging evidence where appropriate and do not change billing just to rerun CI.
6. Production promotion remains Human-Approval-gated after staging verification.

## Guardrails

- Read before write.
- Never log/commit raw secrets.
- Staging only unless the owner explicitly approves production.
- Never mutate `main`/prod from delegated agent lanes.
- Do not rebuild working components for naming changes.
- Prefer live GitHub/D1 evidence over stale chat state.
- If a provider permission is missing, stop only that lane and return the exact authorization required.
- Keep one user-facing toolkit: **OGENIC Phase VI**.
