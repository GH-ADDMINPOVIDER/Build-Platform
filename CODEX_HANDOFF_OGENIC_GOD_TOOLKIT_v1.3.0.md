# Codex Handoff — OGENIC GOD TOOLKIT v1.3.0

## Target
Repository: `Ogenicchocolate21debug/Build-Platform`
Branch: `ogenic-god-toolkit-v1.3.0`
Do not merge to `main` without explicit user approval.

## Mission
Finish OGENIC GOD TOOLKIT as one OpenAI Plugin/Skill + MCP Control Tower UI. Preserve the single-entry auto-router model and connect only execution surfaces that can be verified.

Use `$build-chatgpt-app` with `$openai-docs` before changing Apps SDK/MCP code.

## Already implemented on this branch
- `.codex-plugin/plugin.json` promoted to OGENIC GOD TOOLKIT v1.3.0
- `skills/ogenic-god-toolkit/SKILL.md`
- `skills/ogenic-god-toolkit/agents/openai.yaml`
- capability index, execution registry, router/approval policy
- Buyer Intent Radar / Retail Placement module
- mobile-first UX/UI specification
- `apps/ogenic-control-tower/` MCP server scaffold
- `public/control-tower.html` MCP Apps UI widget

## Required validation / completion
1. Fetch current OpenAI Plugin, Skills, MCP server, UI, test/publish docs.
2. Review the current branch against the latest plugin and Skill schema.
3. In `apps/ogenic-control-tower`:
   - run `npm install`
   - run static/syntax checks
   - run `npm start`
   - verify `GET /` health
   - verify `/mcp` with MCP Inspector
   - inspect all tool descriptors, schemas and annotations
   - render the Control Tower widget through the MCP Apps bridge
4. Keep the app decoupled:
   - data/routing tools return reusable `structuredContent`
   - UI render tool owns the widget resource
   - no secret values in UI/model outputs
5. Add live adapter interfaces only where a connected execution surface actually exists. Never hard-code fake Ready states.
6. Keep Human Approval gates for first outbound lead contact, destructive deletes, production deploys, privilege/credential changes and consequential external/financial actions.
7. Buyer Intent Radar must use source-backed public business intent, dedupe leads, preserve source URL/time, and never fabricate contact details or intent.
8. Preserve the existing Developer System-Bootstrap Ops capability inside the new toolkit; do not delete its useful references until migration parity is verified.
9. Build a review-ready package/ZIP and validate it.
10. Use the OpenAI Skills API or current supported upload flow to create/update the `ogenic-god-toolkit` skill only after validation.
11. Connect the MCP endpoint in ChatGPT Developer Mode and test the plugin end to end.
12. Do not publish publicly or merge `main` without explicit user approval.

## Recommended MVP tool surface
- `list_capabilities` — read only
- `route_request` — read only route plan
- `get_runtime_status` — read only; Unknown unless verified
- `render_control_tower` — UI render tool

Do not add broad write tools until authorization, idempotency and audit behavior are explicit.

## OpenAI architecture rules
- one user-facing entry point
- model chooses capability chain automatically
- direct connected tool first
- Codex/agent for implementation-heavy work when connected
- orchestrator for repeatable multi-service flows
- Result / Blocked / Next output contract
- read before write
- verify before success
- secret-safe logging

## Staging-first
Deploy/test staging only. Do not modify Candy production, Candy Cloudflare, or unrelated repositories as part of this task.

## Final report expected from Codex
- files changed
- validation/tests run
- MCP endpoint / staging URL if deployed
- ChatGPT plugin connection status
- OpenAI Skill ID/version if created
- blockers/missing credentials
- exact items requiring user approval
