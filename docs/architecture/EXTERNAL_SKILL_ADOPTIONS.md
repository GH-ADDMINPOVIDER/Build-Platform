# OGENIC/Unifiend — Curated Open-Source Skill Adoptions

**Reviewed:** 2026-10-19
**Integration point:** existing Unifiend P-Stack guided-workflow picker
**Canonical memory:** `owner-main / 1LSS_OWNER_MAIN`

This is a selective adoption, not a wholesale import of agent frameworks. The existing 51-item numbered P-Stack source manifest and taxonomy remain unchanged. Local workflows are registered separately in `config/pstack-workflows.json`.

## Adopted into the existing workflow picker

| Workflow | Source reviewed | What OGENIC adopts | What it does not install |
|---|---|---|---|
| `diagram-design` | [Cathryn Lavery — Diagram Design](https://github.com/cathrynlavery/diagram-design), MIT | Prompt-to-diagram workflow, editable Mermaid/structured source, responsive HTML/SVG, accessible labels, source-linked diagrams | No remote diagram service, new server, or separate architecture-map source |
| `engineering-loop` | [Matt Pocock Skills](https://github.com/mattpocock/skills), MIT; [ECC](https://github.com/affaan-m/ECC), MIT; [Karpathy-Inspired Guidelines](https://github.com/multica-ai/andrej-karpathy-skills) | Acceptance criteria, reproduce-first debugging, surgical diffs, behavioral tests, blast-radius review, evidence-based handoff | No full 294K/282K-star skill catalog and no copied Karpathy repository file |
| `agent-harness-guardrails` | [ECC](https://github.com/affaan-m/ECC), MIT | Explicit skill routing, bounded agent delegation, verification, security and permission boundaries | No duplicate registry, runner, gateway, or execution harness |

These are locally authored prompts and skill files. The upstream projects remain references; they are not represented as installed plugins or live provider adapters.

## Evaluated but not installed

### Claude-Mem

[Claude-Mem](https://github.com/thedotmack/claude-mem) declares Apache-2.0 and provides persistent memory around a local worker and SQLite/FTS search. It is **not added as a second memory backend** because Unifiend already uses `owner-main / 1LSS_OWNER_MAIN` and D1 as its canonical memory/state path. Introducing another worker/database would split continuity and create a second source of truth.

Its privacy controls are useful as a design reference, but no claim is made that Claude-Mem's `<private>` tag behavior exists in Unifiend. Any future privacy filtering must be implemented at the existing memory ingress and covered by tests before it is relied on.

### Karpathy-Inspired Claude Code Guidelines

The reviewed repository exposed a `CLAUDE.md` but no license file was found in the repository paths reviewed. OGENIC does not copy that file or its wording. The engineering workflow above independently states general practices such as explicit assumptions, simplicity, surgical edits, and verification loops.

## Existing architecture sources reused

- `docs/architecture/OGE_SYSTEM_MAP.md`
- `docs/architecture/OGE_SYSTEM_MAP.mmd`
- `docs/architecture/oge-system-edges.json`
- `docs/architecture/UNIFIEND_EMBED.md`
- `public/architecture/oge-system-map.svg`

For diagram tasks, update the existing source set instead of creating a competing map. Preserve the authority flow:

`Unifiend → ATHENA/BLUE → YELLOW/MA-OP → CCS → VIOLET → RUBY → GREEN/1LSS`

## Safety and execution boundary

- Selecting a guided workflow only prepares a draft; the owner explicitly sends it.
- No provider is called just by selecting a workflow.
- No new dependency, D1 migration, D1 data write, secret, runner, gateway, or paid resource is introduced by this adoption.
- Main, production, and Candy Factory remain out of scope.
- Source changes, CI results, deployments, and runtime behavior must be reported as separate states.
