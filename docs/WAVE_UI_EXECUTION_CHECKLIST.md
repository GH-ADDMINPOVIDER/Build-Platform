# WAVE UI Execution Checklist

Target: `phase-vi-provider-incentive-metering` only. Staging first. No main/prod/Candy mutation.

## Done
- [x] WAVE UX/UI Product Blueprint completed and frozen as source of truth.
- [x] Figma master file created: Desktop, iPhone, Components, Prototype flow.
- [x] Landing redesigned into dense WAVE command surface.
- [x] Green Stone + Yellow Stone visual system implemented.
- [x] Landing navigation routes to existing real surfaces only: `/`, `/chat`, `/overview`, `/app`, `#stones`.
- [x] Landing Agent / Agent Deck actions route to the existing Agent AI chat surface instead of a generic dashboard target.
- [x] Chat surface exposes live Model / Agent AI / Tools / D1-1LSS controls.
- [x] Tools dock supports live-capability filtering and real tool routes where available.
- [x] 1LSS cross-surface sync status remains visible in chat.
- [x] Self-hosted `wave-runner-01` is the staging execution runner.
- [x] Previous deploy failure isolated to stale landing UI assertions, not runtime/auth/D1.
- [x] Landing tests updated to match the current v3 command UI semantics.
- [x] WAVE Chat v3 clean operator skin implemented and activated: calm OpenAI-like primary surface with compact controls and dense capability drawers.
- [x] WAVE Operate v3 dense operator skin implemented and activated: compact Linear-like operational density using WAVE graphite / Green / Gold language.
- [x] CI `npm run check` passes on the latest staging UI chain.
- [x] Provider Incentive Staging Deploy #206 completed successfully on `wave-runner-01` after landing-route fixes.
- [x] Chat v3 staging deploy #208 completed successfully with typecheck/build, deploy, health and protected runtime verification green.
- [x] Operate v3 staging deploy #209 completed successfully.
- [x] Latest staging commit `d301df3984d365df6c883f8ac1c11fc6869113ef` deployed successfully in Provider Incentive Staging Deploy #210 / run `36505237094`.
- [x] Latest #210 verification passed: Infisical OIDC, D1 resolution/migrations, `npm run check`, protected bindings, Cloudflare deploy, staging health, owner auth, dashboard, connector hub, Browser Run bridge and Manus bridge state.
- [x] Cloudflare `cf` CLI open beta added to WAVE self-host bootstrap alongside Wrangler; Wrangler remains fallback during beta.
- [x] Self-host smoke workflow now installs `cf` into the runner user's local prefix and verifies `cf --version` + `cf --help` without making Cloudflare mutations.
- [x] WAVE Self-hosted Runner Smoke #7 / run `36509030687` completed successfully for Cloudflare `cf` CLI on `wave-runner-01`.
- [x] Yellow Stone Slice 1 / OGE-25 deterministic read-only capability resolver verified and closed.

## In progress / verify on staging
- [ ] Yellow Stone Slice 2 / OGE-26: guarded execution router + approval/evidence envelope delegated to Codex on the staging branch.
- [ ] Verify `https://wave.ogenicchocolate.com/` visually on desktop + iPhone. Current execution environment cannot resolve/open the custom runtime for browser-level visual QA; CI/runtime verification is green.
- [ ] Verify every landing action by live browser click-through. Source route contract is verified; interactive browser QA remains.
- [ ] Verify `/chat` send, Agent AI, Model, Tools, attachment and 1LSS controls by live UI interaction.
- [ ] Verify `/overview` dashboard/runtime/tool controls by live UI interaction.
- [ ] Verify `/app` mobile surface by live UI interaction and confirm canonical 1LSS status.

## Next implementation pass
- [ ] Evaluate `cf` CLI for read-only account discovery and safe staging operations before replacing any Wrangler paths.
- [ ] Evaluate Cloudflare Forge as the generator layer for Yellow Stone SDK / Docs / CLI surfaces.
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
- [x] `cf` CLI does not receive production/destructive authority by default; staging/read-only first.
