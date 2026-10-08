# OGENIC / WAVE — Canonical Stone & Diamond Identity Map

**Owner-approved naming, 2026-10-08.** This is a *naming/ownership* decision, not proof that every subsystem is fully implemented. Do not invent a new policy engine, D1 schema, or project to implement labels.

## Command layer (outside the numbered seven)

- **WHITE DIAMOND — ATHENA / BRAIN**. Supervising reasoning, intent and planning, dispatch choice and coordination. Not renamed Blue Diamond. Existing OpenAI/White Diamond Manager is a related technical implementation; real runtime readiness must be verified.

## Seven ordered stones/diamonds

| # | Official display name | Color | Owns | Must not duplicate |
|---|---|---|---|---|
| 01 | **GREEN STONE — 1LSS** | Green | Canonical one-line session, continuity, D1-backed operational state | Runner artifacts are evidence caches, not a replacement memory database |
| 02 | **YELLOW STONE — TOOLS** | Yellow | Capability tools, APIs, MCP/SDK adapters, existing permissions and execution authority | No second execution-approval gateway |
| 03 | **BLUE DIAMOND — AGENTS** | Blue | Agent catalog, identities, capabilities, readiness, provider/quota evidence | Not ATHENA's sole brain; not team execution management |
| 04 | **VIOLET STONE — MULTI-AGENT SOLUTION** | Violet | Team formation, parallel task routing, work isolation, fan-out/fan-in, progress aggregation | Does not own the provider registry or bypass Yellow |
| 05 | **RUBY STONE — VERIFICATION** | Ruby red | Proof verification, evidence reconciliation, semantic validity before canonical retention | Not a second source of truth |
| 06 | **STONE RUNNER** | Obsidian black | Ephemeral runtime, local workerd/D1, code build/test, GitHub commit/CI/deploy context pack; future scoped coding execution via Codex/other verified agents | Not a separate AI model, not a new cloud state database |
| 07 | **RULE STONE** | Gray | Central rules taxonomy and clarity; no duplicated per-agent gates; apply canonical rules via existing Yellow authority | Do not replace or fork `config/oge95-rules-center.json` |

**Spellings/aliases:** Stone Runner (two words); STONE RUNNER uses OBSIDIAN (black), not Orange; RULE STONE uses gray, and owns the **RULE** function; White Diamond = ATHENA; Blue Diamond = Agent catalog; Violet Stone = multi-agent collaboration. The numbering denotes user-approved topology, not software maturity.

### Locked stone species, visual identity and capability names

The **display names above are immutable owner names**; the geological identity below is the visual/species specification. Physical stone *types* are visual metaphors, not claims that software is physically made from minerals. Numeric IDs are reserved as the canonical display/order IDs, not D1/schema migrations.

| Identity | Canonical name | Color (hex) | Species / stone type | Canonical capability ID | Capability display name |
|---|---|---|---|---|---|
| COMMAND (outside 7) | **WHITE DIAMOND — ATHENA** | Colorless white `#F5F7FA` | Colorless diamond, crystalline carbon | `BRAIN_ORCHESTRATION` | Brain · Intent & Command |
| 01 | **GREEN STONE — 1LSS** | Emerald green `#16A34A` | Emerald, beryl group | `CANONICAL_SESSION_MEMORY` | One-Line Session · D1 Continuity |
| 02 | **YELLOW STONE — TOOLS** | Golden yellow `#EAB308` | Citrine, quartz family | `CAPABILITY_TOOLS_EXECUTION` | Tools · MA-OP / API / MCP / SDK |
| 03 | **BLUE DIAMOND — AGENTS** | Diamond blue `#3B82F6` | Blue diamond, carbon crystal | `AGENT_IDENTITY_READINESS` | Agents · Roster & Capability Registry |
| 04 | **VIOLET STONE — MULTI-AGENT SOLUTION** | Amethyst violet `#8B5CF6` | Amethyst, quartz family | `MULTI_AGENT_COORDINATION` | Multi-Agent Solution · Fan-Out / Fan-In |
| 05 | **RUBY STONE — VERIFICATION** | Ruby red `#DC2626` | Ruby, corundum | `EVIDENCE_SEMANTIC_VERIFICATION` | Verification · Ruby-to-Green Proof |
| 06 | **STONE RUNNER** | Obsidian black `#111113` | Obsidian, natural volcanic glass *(mineraloid, not a crystal/mineral)* | `EPHEMERAL_RUNTIME_EXECUTION` | Runtime · Workerd / Local D1 / Build / Test |
| 07 | **RULE STONE** | Slate gray `#6B7280` | Gray agate, banded chalcedony | `CENTRAL_RULE_TAXONOMY` | Rule · One Source / Dedupe / Scope |

The defined stone **capabilities are names** for existing architecture and future build contracts, not claims that unproven functionality works. The only authoritative rules configuration continues to be `config/oge95-rules-center.json`; Rule Stone never becomes a second approval checkpoint, and Yellow retains enforcement authority. D1/Green remains canonical memory; Stone Runner GitHub artifacts are reconstructable evidence.

### Product/issue lock

- **Active engineering umbrella:** [OGE-95](https://linear.app/ogenic-sio/issue/OGE-95) **Stone Runner (Product #2)** only, staging branch. The completed Card Protocol CCS (Product #1) remains preserved.
- Closed/superseded Linear issues are historical evidence, **not proof their unimplemented acceptance criteria are done**. Missing functionality is tracked within OGE-95; parked non-Runner products are archived, not implemented during this focus.
- Do not rename existing API identifiers or artifacts without a tested versioned compatibility migration.
- The full single-issue backlog/evidence registry is `docs/OGE95_ONLY_ACTIVE_WORK_MIGRATION.md`.

### Operational ownership and single authority

- **Thinking:** WHITE DIAMOND / ATHENA.
- **Find eligible agents:** BLUE DIAMOND.
- **Arrange specialists in safe parallel lanes:** VIOLET STONE.
- **Authorize capabilities and perform tool operations:** YELLOW STONE, using rules from RULE STONE (GRAY).
- **Execute/reproduce in a disposable machine:** STONE RUNNER (OBSIDIAN).
- **Check evidence:** RUBY STONE.
- **Retain verified state only through the canonical path:** GREEN / 1LSS.

`ATHENA → BLUE → VIOLET ↔ YELLOW (with RULE) → OBSIDIAN → RUBY → GREEN`

### Compatibility rules

1. Do not mass-rename existing Worker routes, `white-diamond-registry.ts`, `blue-diamond-registry.ts`, `violet-stone-api.ts`, or the historical CI artifact/schema values: callers already rely on them.
2. `OGE-95` remains the **same** single active bottleneck issue; the rules-center file remains `config/oge95-rules-center.json`. Do not create a second issue or independent policy authority for Gray Stone.
3. Exclude billing-blocked Grok/xAI and Meta Model from active agent selection; retain their registry records. Use verified working specialists rather than assuming a provider is ready.
4. This commit codifies *names and boundaries only*. UI display changes, SDK/router wiring, autonomous coding and stage-to-stage runtime proof need their own commits and verified CI before they are called completed.
5. Protect `main`, production, Candy, credentials, and remote D1 schema. Work only on `phase-vi-provider-incentive-metering`.

### Corresponding existing implementation references

- Agent identities: `worker/blue-diamond-registry.ts`
- ATHENA/White Manager: `worker/white-diamond-registry.ts`
- Multi-agent management: `worker/violet-stone-api.ts`
- Rule source: `config/oge95-rules-center.json`
- Obsidian execution host: `infra/replica-runner/STONE_RUNNER.md`, `.github/workflows/wave-replica-runner.yml`

**Why Rule Stone (gray) exists separately:** explain and centrally manage the rules; it must *not* duplicate Yellow's already-established enforcement/authorization. 
