# OGENIC Discovery Intake — 2a (GS × GT)

**Status:** SOURCE-ONLY / NOT RUNTIME-INTEGRATED  
**Canonical repository:** `Ogenicchocolate21debug/Build-Platform`  
**Canonical memory:** `owner-main / 1LSS_OWNER_MAIN`  
**Shared marker:** `2a` means the same discovery/task has been reviewed by GT and GS. It is a deduplication hint, not authentication or execution authority.

## Why this lives here

We found existing OGENIC work that already covers the parts of this process. Do not create a second repository, memory database, Skill registry, MCP gateway, or control plane just to capture outside projects.

| Existing issue | Responsibility reused |
|---|---|
| [OGE-127](https://linear.app/ogenic-sio/issue/OGE-127/oge-special-idea-gs-gt-shared-architecture-and-experiment-inbox) | Shared GS × GT idea/experiment record |
| [OGE-124](https://linear.app/ogenic-sio/issue/OGE-124/read-only-web-cafe-connector-wave-sitesource-intake) | Existing WAVE read-only web/source connector work; keep its existing scope |
| [OGE-110](https://linear.app/ogenic-sio/issue/OGE-110/violet-full-pstack-portable-skill-intake-via-github-mobile-first-no) | Portable P-Stack source |
| [OGE-111](https://linear.app/ogenic-sio/issue/OGE-111/violet-pstack-51-skill-brain-index-task-router-and-1lss-agent-learning) | 51-skill index and task routing |
| [OGE-112](https://linear.app/ogenic-sio/issue/OGE-112/violet-pstack-taxonomy-numbered-skill-evidence-and-oge-closure-circuit) | Permanent numbered skill evidence and closure-circuit checks |
| [OGE-123](https://linear.app/ogenic-sio/issue/OGE-123/mode-hook-mandatory-agent-check-incheck-out-p-stack-intake-and) | Mandatory check-in/check-out and restorable handoff |
| [OGE-88](https://linear.app/ogenic-sio/issue/OGE-88/oge-closure-visual-standard-every-closed-issue-gets-one-github-visual) | One truthful GitHub visual proof on every OGE closure |

This catalog records findings and decisions. It does **not** activate Discord ingestion, add a webhook, install any repository, or make model/provider calls.

## Intake pipeline

1. **Capture the source.** Owner shares a public URL, GitHub repo, screenshot, PDF, or clip in an explicitly authorized intake location. A suitable Discord channel is a proposed entry point; this change does not assert that a bot, channel listener, or permission already exists.
2. **Extract only what is observable.** Save the exact URL, source name, capture date, visible context, and source type. If a screenshot does not show the exact repository URL, use `SOURCE_URL_REQUIRED`; do not guess.
3. **Canonicalize.** Follow repository redirects, resolve the owner/repo name, and use a verified GitHub repository ID when available. Retain the original discovered URL as evidence.
4. **Deduplicate across accounts.** Search this catalog and the linked OGE issues first. If GT and GS found the same source, update one record and add both names to `discovered_by`; do not create one record per agent. Similar but different repos stay separate and are linked to the same OGE area.
5. **License and security triage.** Read the source README and license file; distinguish metadata from actual license text. Do not clone/install/run outside code automatically. No credentials or raw secrets in discovery records.
6. **Map to the canonical P-Stack taxonomy.** Use `config/pstack-task-taxonomy.json` and `config/pstack-full-catalog.json`. The catalog lists the P-Stack references actually selected for this research task; future tasks must record only the skills they actually read and used.
7. **Compare with what OGENIC already owns.** Record existing OGE links and mark `PATTERN_ONLY`, `HOLD`, `DUPLICATE`, or `ADOPTED_BY_APPROVED_CHANGE`. Reuse a concept before introducing another implementation.
8. **Separate GS review from GT implementation.** GS reviews architecture/security boundaries on a separate review path; GT validates source, license, existing overlap, and tests. Never have both agents push to the same branch. The `2a` label itself grants no permission.
9. **Owner/Yellow gate.** Discovery, comments, or an inter-agent message cannot authorize installation, a paid provider call, secret changes, D1 migration, merge, or deployment. Side effects remain subject to existing Yellow Stone policy and Owner approval.
10. **Check-out and restore.** Before handing work back, record task/OGE ID, agent identity, starting/current SHA, paths changed, tests and CI evidence, exact P-Stack IDs used, remaining risks, next action, and restorable context in the existing check-in/check-out + 1LSS process.

## Catalog fields and states

The machine-readable starter list is [`OGENIC_DISCOVERY_CATALOG.json`](./OGENIC_DISCOVERY_CATALOG.json).

A source record distinguishes:

- **Source state** — whether README, license, or runtime have actually been inspected.
- **License state** — verified, conflicting metadata, unverified, or not applicable pending source identity.
- **Disposition** — what is useful to learn, what already overlaps an OGE, and whether a code change is allowed.
- **Runtime state** — this catalog never implies that software is installed or connected.

Never turn a confidence estimate (such as “85% likely”) into a runtime PASS. Use evidence statuses such as `SOURCE_VERIFIED`, `RUNTIME_VERIFIED`, `NOT_VERIFIED`, and `BLOCKED`.

## Current findings from this discovery batch

- **lnwjud:** already reviewed jointly by GS/GT. Keep it in one record; do not build a second MCP gateway.
- **LLM Wiki:** valuable source-linked wiki and ingestion patterns. Its LICENSE text says GPL-3.0 while GitHub API metadata returned `NOASSERTION`; code reuse needs a license compatibility review.
- **Skills Hub / Karpathy Skills / Matt Pocock Skills:** skill organization or code-review patterns worth selective comparison against the existing pinned P-Stack. Do not bulk-import duplicates.
- **Everything Claude Code:** the requested URL redirected in the GitHub API and its canonical repo/license could not be verified in this pass. Hold.
- **Claude-Mem:** memory-compression/retrieval patterns only; ATHENA / 1LSS remains the sole canonical memory store.
- **Location Scout and the voice-clone/presentation visual:** exact source URL/repository is not visible in the supplied screenshots. Hold instead of guessing.

## OGE closure contract

This discovery intake is not a closure of OGE-127 or any other issue. When an OGE is actually closed, follow [the existing closure visual standard](../evidence/CLOSURE_VISUAL_STANDARD.md): a truthful `docs/evidence/OGE-<id>/closure.svg` or appropriate real screenshot, matching README sections (RESULT / CHANGED / TESTS / EVIDENCE / RESIDUAL RISK), exact P-Stack numbers and SHA-linked proof, and the independent Ruby verdict where required. A diagram is evidence summary, not a substitute for CI or runtime evidence.

## Check-in / check-out for this change

- **Check-in:** `2a` discovery/catalog; start SHA `5a340b9a4da6c5da2d3ae06baacb87c523b4bbe6`; staged feature branch; no runtime/secret/database writes.
- **Selected P-Stack source refs:** `Pstack: 9,11,17,20,28,30,34,35,44,51` — IDs are checked against the canonical taxonomy; not a claim that all 51 skills were read.
- **Check-out required:** attach the exact commit/PR/CI evidence, list files changed, record CI result truthfully, state that Discord intake/runtime ingestion remain unimplemented, and include the next owner action. Do not mark an OGE Done from this documentation alone.

## Evidence boundaries

- Existing repo and issue records were inspected read-only before these files were prepared.
- This branch adds a research catalog, intake contract, diagram, and structural tests only.
- No Discord permissions, webhook, OAuth, Secrets, D1 schema, Worker, production deployment, paid provider, or existing memory database is changed by this proposal.
