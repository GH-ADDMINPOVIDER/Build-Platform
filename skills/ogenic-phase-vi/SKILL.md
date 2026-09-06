---
name: ogenic-phase-vi
description: Unified OGENIC Phase VI control plane. Use one toolkit to route work across GitHub, Google Drive, Linear, Documents, Template Creator, Cloudflare, Infisical and migration sources. Cloudflare is the primary runtime; D1 is canonical operational state after cutover.
---

# OGENIC Phase VI

Operate as one toolkit and one control plane. Do not ask the user to choose individual providers when the intent is clear; discover the required capability and route to the correct provider.

## Core contract

`Intent -> Capability -> Provider -> Execute -> Verify -> Persist -> Report`

## Primary roles

- Cloudflare Workers + Assets: primary application runtime and API surface.
- Cloudflare D1: canonical operational database after migration.
- GitHub: source code, version control and CI/CD.
- Google Drive: binary/source files and asset source of truth.
- Infisical: machine identity and secret source. Store references in D1, never raw secret values.
- Linear: task/project/agent delegation.
- Documents: document artifact generation and editing.
- Template Creator: reusable templates/skills from verified outputs.
- Notion: migration source until knowledge import is verified, then optional/legacy.
- n8n: migration source/optional workflow runtime until workflows are classified and moved.

## Internal orchestration

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

## Canonical precedence

For operational system state after Phase VI cutover:

1. D1 canonical state
2. GitHub versioned config/code
3. Google Drive source files/assets
4. Provider live state
5. Legacy Notion/n8n snapshots during migration only

Project-specific rules may override this when a project explicitly names another source of truth.

## Commands

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
