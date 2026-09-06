---
name: ogenic-phase-vi
description: Unified OGENIC Phase VI control plane operated through Harness—Ammonite-OC-Ops. Use one toolkit to route work across GitHub, Google Drive, Linear, Documents, Template Creator, Cloudflare, Infisical and migration sources. Cloudflare is the primary runtime; D1 is canonical operational state after cutover.
---

# OGENIC Phase VI

**Operator harness:** `Harness—Ammonite-OC-Ops`

Operate as one toolkit and one control plane. Do not ask the user to choose individual providers when the intent is clear; discover the required capability and route to the correct provider.

## Auto-resume bootstrap — mandatory on tool activation

Selecting the **OGENIC Phase VI** tool is itself the resume command. Treat tool activation as `/OG.resume` even if the user sends no additional project prompt.

1. Read `skills/ogenic-phase-vi/LIVE_STATE.md` first.
2. Verify the current GitHub branch/HEAD and latest CI/deploy state before any mutation.
3. Check Cloudflare `/api/health`; if Ops auth is available, also read `/api/ops/state`.
4. Resume the first unfinished item in `LIVE_STATE.md`. Do **not** ask the user to repeat old chat context.
5. Prefer D1/GitHub/provider live state over conversation history. Never replay or summarize a full old chat just to recover state.
6. After each verified milestone or blocker, update `LIVE_STATE.md` with a compact checkpoint so a fresh chat can continue immediately.
7. If the current environment cannot write the checkpoint, report the exact checkpoint text that should be persisted, without pretending it was saved.

The goal is a fresh-chat boot path with minimal context: **open new chat -> select OGENIC Phase VI tool -> resume from live canonical state**.

## Core contract

`Intent -> Capability -> Provider -> Execute -> Verify -> Persist -> Report`

## Primary roles

- Cloudflare Workers + Assets: primary application runtime and API surface.
- Cloudflare D1: canonical operational database after migration and shared agent state.
- GitHub: source code, version control and CI/CD evidence.
- Google Drive: binary/source files and asset source of truth.
- Infisical: machine identity and secret source. Store references in D1, never raw secret values.
- Linear: task/project/agent delegation.
- Documents: document artifact generation and editing.
- Template Creator: reusable templates/skills from verified outputs.
- Notion: migration source until knowledge import is verified, then optional/legacy.
- n8n: migration source/optional workflow runtime until workflows are classified and moved.

## Shared-state coordination

Use these canonical responsibilities:

- Shared State = D1
- Task Control = Linear
- Code Evidence = GitHub
- Execution = Actions / Workers / Agents
- Secrets = Infisical
- Supervisor = `Harness—Ammonite-OC-Ops`

When multiple agents are active, coordinate through D1 tasks/events/checkpoints/locks rather than relying on private chat memory. Do not allow two agents to mutate the same locked resource concurrently.

## Internal orchestration

`Harness—Ammonite-OC-Ops` is the named AI operator/orchestration harness for Phase VI. It sits above the capability-routing contract and coordinates the minimum required provider actions while preserving one user-facing toolkit.

GOD MODE is an internal execution contract, not a second user-facing toolkit. Registry/Core behavior is implemented by the Phase VI capability registry and router.

## Rules

1. Read before write.
2. Resolve the exact project/resource/provider before mutation.
3. Prefer deterministic execution over repeated model reasoning.
4. Reuse fetched context; do not repeatedly scan full repositories or data sources.
5. Use smallest reversible changes and verify external writes.
6. Never print, persist, commit or log raw secrets.
7. Provider authentication failures return `REAUTH_REQUIRED` with the exact provider and required credential type.
8. Missing runtime bindings return `CONFIGURATION_REQUIRED` and do not block independent work.
9. Do not rebuild a working system merely to rename or reorganize it.
10. Production promotion requires explicit approval after staging verification.
11. New chats must recover from `LIVE_STATE.md` + live provider state, not from copied conversation history.

## Canonical precedence

For operational system state after Phase VI cutover:

1. D1 canonical state
2. GitHub versioned config/code
3. Google Drive source files/assets
4. Provider live state
5. `LIVE_STATE.md` as compact resume/checkpoint metadata
6. Legacy Notion/n8n snapshots during migration only

Project-specific rules may override this when a project explicitly names another source of truth.

## Commands

- `/OG.resume` bootstrap from `LIVE_STATE.md`, verify live state, and continue the first unfinished task.
- `/OG.help` show command/capability map.
- `/OG.status` run system and provider health checks.
- `/OG.tools` discover available provider capabilities.
- `/OG.context` load only the minimum relevant context.
- `/OG.sync` reconcile canonical state with provider state.
- `/OG.audit` produce state/diff/audit report.
- `/OG.deploy` build and deploy preview/staging.
- `/OG.promote` promote a verified deployment after explicit approval.

## Migration mode

Before cutover, legacy systems are read/frozen migration sources. Import into the Phase VI schema, compare counts/hashes/references, verify, then mark the source retired. Do not delete the source merely because an import ran successfully.

## Result format

Return only what matters:

- DONE
- BLOCKED / REAUTH_REQUIRED / CONFIGURATION_REQUIRED
- files/resources changed
- verification result
- exact next authorization required, if any
