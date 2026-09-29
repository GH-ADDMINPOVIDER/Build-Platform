# WAVE UI Execution Checklist

Target: `phase-vi-provider-incentive-metering` only. Staging first. No main/prod/Candy mutation.

## Done
- [x] WAVE UX/UI Product Blueprint completed and frozen as source of truth.
- [x] Figma master file created: Desktop, iPhone, Components, Prototype flow.
- [x] Landing redesigned into dense WAVE command surface.
- [x] Green Stone + Yellow Stone visual system implemented.
- [x] Landing navigation routes to existing real surfaces only: `/`, `/chat`, `/overview`, `/app`, `#stones`.
- [x] Chat surface already exposes live Model / Agent AI / Tools / D1-1LSS controls.
- [x] Tools dock already supports live-capability filtering and real tool routes where available.
- [x] 1LSS cross-surface sync status remains visible in chat.
- [x] Self-hosted `wave-runner-01` is the staging execution runner.
- [x] Previous deploy failure isolated to stale landing UI assertions, not runtime/auth/D1.
- [x] Landing tests updated to match the current v3 command UI semantics.
- [x] Landing Agent / Agent Deck actions now route to the existing Agent AI chat surface instead of a generic dashboard target.
- [x] CI `npm run check` passes on WAVE UI staging commit `9d0ac40308cbe5e0f73154075fbfd24d97656346`.
- [x] Provider Incentive Staging Deploy run `36504552595` / #206 completed successfully on `wave-runner-01`.
- [x] Staging Worker deploy, health check, owner auth, dashboard, connector hub, Browser Run bridge and Manus bridge verification passed in run #206.

## In progress / verify on staging
- [ ] Verify `https://wave.ogenicchocolate.com/` render visually on desktop + iPhone. (External browser fetch from this chat cannot open the private/custom runtime; workflow health is green.)
- [ ] Verify every landing action visually opens its intended working destination. Source route contract is verified; browser click-through remains.
- [ ] Verify `/chat` send, Agent AI, Model, Tools, attachment and 1LSS controls by live UI interaction.
- [ ] Verify `/overview` dashboard/runtime/tool controls by live UI interaction.
- [ ] Verify `/app` mobile surface by live UI interaction and confirm canonical 1LSS status.

## Next implementation pass
- [ ] Add dedicated WAVE Connections surface grouping MCP / OAuth / API / Webhook / SDK adapters.
- [ ] Add Runtime Framework surface for self-host runner status, jobs, Docker/CLI capability and guarded terminal sessions.
- [ ] Add Agent Deck / Registry surface with DIRECT / DELEGATE / COUNCIL / AUTO semantics.
- [ ] Add usage/activity analytics inspired by compact operator dashboards without copying third-party UI.
- [ ] Add profile / appearance / security settings with compact mobile drawer patterns.
- [ ] Route all destructive or production-impacting actions through explicit approval.

## Non-negotiables
- [x] Never expose raw secrets/tokens/cookies in frontend, D1, logs or 1LSS.
- [x] Keep owner-main / `1LSS_OWNER_MAIN` canonical.
- [x] WAVE stays mobile-first.
- [x] MCP remains an adapter protocol, not the system runtime itself.
