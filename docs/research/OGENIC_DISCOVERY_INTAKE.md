# OGENIC WAVE × 2a — Consolidated Discovery & Delivery Brief

**Status:** `SOURCE-ONLY / REVIEW REQUIRED`  
**Owner marker:** `2a` = the same work item is shared by GT and GS; it is a coordination marker, not authentication or execution authority.  
**Canonical code repository:** `Ogenicchocolate21debug/Build-Platform`  
**Canonical memory/session:** `owner-main / 1LSS_OWNER_MAIN`  
**This PR:** [#24 — 2a Discovery Intake](https://github.com/Ogenicchocolate21debug/Build-Platform/pull/24)  
**No new repository, memory database, control plane, or competing PR is created by this work.**

## Decision in one place

1. Keep one WAVE experience that includes **Dashboard + Command Center + AI Operations + mobile access**. Build and verify the web/PWA path first; consider native App Store packaging only after a real iOS build/signing/release path is evidenced.
2. Keep all clients on the existing WAVE/Cloudflare control plane and canonical ATHENA/1LSS history. Do not create a second backend, MCP gateway, memory database, or P-Stack registry.
3. Treat web/GitHub discoveries as evidence to triage, not permission to install or execute. Deduplicate GS and GT into one record per canonical source; map relevant work through the existing P-Stack taxonomy and existing OGE issues.
4. Delivery, identity, and execution authority are separate. A message from GS/GT does not authorize a deploy, migration, secret change, paid call, or other side effect. Yellow Stone and explicit Owner approval remain the authority gate.
5. Every agent run checks in before work and checks out with a restorable record. When an OGE is actually closed, the required evidence package includes a source diagram and rendered circuit diagram, independent review where required, and truthful verification status.

## External GitHub repository names

Names only, as requested:

- [engasnm111/lnwjud](https://github.com/engasnm111/lnwjud)
- [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki)
- [qufei1993/skills-hub](https://github.com/qufei1993/skills-hub)
- [jokim1/karpathy-skills](https://github.com/jokim1/karpathy-skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

The last path above redirected during the repository identity lookup, so treat its canonical path and license as unverified until the final destination is checked. Two screenshot-only items are **not** listed as GitHub repos because their exact sources are not visible: “Location Scout” and the voice-cloning/presentation visual.

The machine-readable source states, repository keys, license notes, deduplication state, and existing OGE links live in [`OGENIC_DISCOVERY_CATALOG.json`](./OGENIC_DISCOVERY_CATALOG.json). That catalog does not claim that any source is installed or runtime-verified.

## What the discovery set means for OGENIC

- **Knowledge from the web:** study source-linked Wiki, indexing, and incremental-ingestion patterns from `nashsu/llm_wiki`; its repository LICENSE text says GPL-3.0 while GitHub metadata returned `NOASSERTION`. Do not copy/adapt its code until licensing compatibility is reviewed.
- **P-Stack:** study inventory, tags, and cross-tool sync patterns from `qufei1993/skills-hub`, but keep the existing pinned 51-skill catalog as the source of truth. Do not bulk-import duplicates.
- **Engineering review:** selectively compare Diff/repository-Wiki workflows from `jokim1/karpathy-skills` and engineering-skill practices from `mattpocock/skills` to existing P-Stack skills. Do not create new skills just because a repository exists.
- **Agent/runtime:** `engasnm111/lnwjud` is already in the shared GS × GT review set. Reuse its ideas for session ownership, durable checkpoints, and audit; do not build another MCP gateway.
- **Context retrieval:** study compression/retrieval patterns from `thedotmack/claude-mem` only; ATHENA / 1LSS remains the one canonical memory store.
- **Everything Claude Code:** hold until the canonical repository and license are independently verified.
- The two screenshot-only media sources remain `SOURCE_URL_REQUIRED`; do not guess names from a promo image.

## WAVE product direction and iPhone delivery

### Target experience — one interface

The requested WAVE Owner experience is one coherent interface with these target areas:

- Live Dashboard
- AI Agent Control
- Cross-App Actions
- OGE Circuit Diagrams
- ATHENA Knowledge
- Owner Approval
- GS ↔ GT Relay
- Alerts & Monitoring

These are the target modules, not a claim that every module is already implemented or connected. The existing public web entry is [WAVE Chat](https://wave.ogenicchocolate.com/chat).

### What the current audit can prove

`SOURCE_VERIFIED` — The supplied GS read-only audit says it searched `Build-Platform`, `ogenic-chocolate`, `Core-Dv1`, and related repositories for `iOS`, `IPA`, `TestFlight`, `Apple Developer`, and `App Store Connect`. It found integration/deployment documentation, including a mobile web deployment guide, but those documents are not proof of a native iOS build.

`NOT_VERIFIED` — No `.ipa` or Xcode Archive was found in that search pass. Signing/provisioning, TestFlight upload, App Store Connect record, and App Store submission remain unverified. This is a bounded search result, **not proof that no artifact exists elsewhere**.

### Release strategy

- **Now:** make the existing web/PWA path usable and mobile-first. On iPhone, Safari can add a website to the Home Screen and open it as a web app; see [Apple Support](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).
- **Later, if native App Store distribution is still wanted:** first identify the native app project, bundle ID, reproducible build, signing/provisioning, TestFlight upload, App Store Connect record, and review status.
- Apple currently lists the Apple Developer Program at **US$99 per year** for distribution benefits including TestFlight and App Store distribution. That fee does not mean the app is built or guaranteed to be approved. Verify readiness and obtain Owner approval before spending; see [Apple Developer Program](https://developer.apple.com/programs) and [Program enrollment/fees](https://developer.apple.com/help/account/membership/program-enrollment/).

The intended architecture is **Web/PWA and any future native client → the same existing WAVE backend → existing control plane and ATHENA/1LSS**. Do not build a second backend solely for an app wrapper.

## GS ↔ GT Relay status is still separate from the product target

The Relay source exists in Draft PRs #21/#22, but the E2E contract is still **`BLOCKED`**:

- Staging Worker source at the inspected SHA `5a340b9a4da6c5da2d3ae06baacb87c523b4bbe6` did not contain the PR's `/mcp` and OAuth route wiring.
- OAuth-bound GS/GT Identity, live D1 Migration 0016 state, and runtime MCP tool discovery are `NOT_VERIFIED`.
- `HELLO_GT_FROM_GS` has not been proven to traverse a live cross-account relay; null Message ID/Correlation ID means no real delivery receipt.
- Bridge Proof Run #42 passed its contract/tests/build set, but that does not prove cross-account runtime delivery.
- Do not apply Migration 0016 until the shared PR source is frozen. PR #21 and #22 both use that migration filename; if it was already applied, add a forward migration instead of relying on edited historical SQL.

Delivery is not execution authority: even after message receive works, the sender's message must not independently authorize Deploy, credential changes, D1 migration, or paid actions.

## Existing OGE work reused — do not create duplicates

- **OGE-127:** shared GS × GT Architecture/Experiment Inbox.
- **OGE-124:** existing read-only web/source connector work.
- **OGE-110 / OGE-111 / OGE-112:** portable P-Stack source, 51-skill router/index, and numbered evidence/closure proof.
- **OGE-123:** mandatory agent Check-in/Check-out and restorable handoff.
- **OGE-88:** closure visual standard.

This consolidated brief and PR #24 do not close any of those OGE issues and do not change their Linear status.

## Discovery-to-decision flow

1. Owner shares a public link, repository, screenshot, PDF, or clip in an explicitly authorized intake location. A Discord listener/channel integration is **not verified as live** by this documentation change.
2. Capture exact URL, source identity, capture date and evidence. If the screenshot does not reveal the source, mark `SOURCE_URL_REQUIRED`.
3. Canonicalize and deduplicate by verified GitHub repository ID, canonical owner/repository, or source URL. GT and GS add their names to the same record; they do not create duplicate entries.
4. Read the README and license; distinguish repository metadata from actual license text. Do not clone, install, or execute external code automatically.
5. Map the specific task to `config/pstack-task-taxonomy.json` and `config/pstack-full-catalog.json`. Record only the P-Stack skill IDs actually read and used for the task; a 51-skill catalog does not mean an agent loaded all 51.
6. GS performs independent architecture/security review; GT owns implementation/source checks on its own feature branch. Do not have both teams push the same branch.
7. For consequential work, stop at the existing Yellow/Owner approval gate. A discovery or peer-to-peer message is not approval.
8. Check out with SHA-linked evidence and a restorable pointer into existing `owner-main / 1LSS_OWNER_MAIN`.

## Check-in / Check-out — mandatory per agent run

**Check-in must record:** marker `2a`, task/OGE ID, GT or GS identity, start SHA, branch, intended files/scope, P-Stack IDs selected, existing-OGE overlap, and the no-go boundaries.

**Check-out must record:** current SHA/PR, exact paths changed, tests and CI status with evidence links, P-Stack IDs actually used, runtime status, residual risk, who owns the next action, and a restorable session pointer. Do not say “PASS” based on an agent's own summary if the artifact/runtime was not checked.

For this implementation pass, the P-Stack guidance directly read and applied was: `Pstack: 9,16,20,28,30,34,35,44`. `Pstack: 11,51` were inspected as review/investigation references but no separate multi-model Interrogate run or full parallel Why investigation was performed here. No claim that all 51 P-Stack skills were read.

## OGE closing evidence and circuit diagram standard

For any OGE that is actually being closed, use the existing [OGE Closure Visual Standard](../evidence/CLOSURE_VISUAL_STANDARD.md). Required package:

```text
docs/evidence/OGE-<id>/
  README.md
  closure.mmd
  closure.svg
```

A real UI screenshot may also be included as `closure.png` when it is the strongest evidence. The diagram must reflect the implementation and actual evidence, and label `VERIFIED`, `UNVERIFIED`, and `BLOCKED` accurately. The README must include `RESULT`, `CHANGED`, `TESTS`, `EVIDENCE`, and `RESIDUAL RISK`; record the exact P-Stack numbers, source SHA, CI/deploy receipts, and independent Ruby verdict where required. Check-in/out must be restorable through the original path.

The current diagram pair is a **consolidated proposal/evidence map for PR #24**, not an OGE closure receipt:
- [Mermaid source](./OGENIC_2A_CIRCUIT.mmd)
- [Rendered circuit SVG](./OGENIC_2A_CIRCUIT.svg)
- [Machine-readable source catalog](./OGENIC_DISCOVERY_CATALOG.json)
- [Decision trail](./OGENIC_DISCOVERY_DECISIONS.tsv)

## Current verification snapshot — 2026-10-13

| Area | Status | Evidence boundary |
|---|---|---|
| Shared canonical repo/memory reuse | `SOURCE_VERIFIED` | Existing repo and OGE references inspected |
| Repository-name catalog and dedup keys | `SOURCE_VERIFIED` | Machine-readable catalog plus structural tests in PR |
| WAVE web entry | `OWNER/EXISTING WEB ENTRY` | Existing public `/chat` path; not a mobile UI acceptance test |
| Native iOS build/App Store release | `NOT_VERIFIED` | No .ipa/Xcode Archive or signing/TestFlight receipt in the supplied read-only search |
| Discord ingestion | `NOT_VERIFIED` | Protocol documented; no listener/webhook activated in this change |
| GS/GT Relay live E2E | `BLOCKED` | No real Message ID/Correlation ID or cross-account delivery receipt |
| PR #24 CI | `BLOCKED / INCONCLUSIVE` | Run #214 failed in 3 seconds, `runner_id=0`, `steps=[]`; execution never reached a test step |
| Merge/Deploy/Secrets/D1 mutation | `NOT PERFORMED` | Explicitly outside this change's authority |

### PR #24 CI — current snapshot

- [Run #214](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38422593560) — failed in approximately three seconds, `runner_id=0`, `steps=[]`.
- [Run #215](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38425335411) — same result on current commit `8873e57c5a067fe8b9851cc257fd6a963d409331`: failure within seconds, `runner_id=0`, `steps=[]`; the log artifact was unavailable (`BlobNotFound`).
- The Vercel Git integration also attempted a preview for this branch, then canceled it. Its deployment record links to Vercel's verified-commits configuration. This was an automatic preview side effect of the Git integration, not a manual production deployment; no Worker deploy was issued by this work.

The available evidence points to failure before validation commands began, but does not establish a definitive root cause. It is not valid to label the new test file as failed based on these runs.

**Next required independent check:** use GS's Codex Work or another isolated local environment to run the exact current PR SHA and capture actual command exit codes/logs. Review Runner/CI startup and Vercel verified-commit configuration separately. Do not push fixes from GS into GT's branch; send evidence to GT.

## Evidence boundaries

- This is a source/doc-only consolidation. No Discord channel listener/webhook, app packaging, OAuth identity, worker route, D1 schema/migration, secrets, provider dispatch, paid operation, merge, or deploy was changed.
- The catalog and circuit are not proof of live integrations. They are an auditable plan and status record.
- The consolidated brief does not close OGE-127, OGE-124, OGE-110, OGE-111, OGE-112, OGE-123 or OGE-88.
