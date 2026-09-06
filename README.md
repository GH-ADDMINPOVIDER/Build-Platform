# OGENIC Phase VI

**One toolkit. One control plane. Cloudflare main.**

OGENIC Phase VI consolidates the operational system into a single user-facing toolkit while keeping provider-specific authentication and execution behind a capability router.

## Target architecture

```text
User / Agent
   |
   v
OGENIC Phase VI (single toolkit)
   |
   v
Intent -> Capability -> Provider -> Execute -> Verify -> Persist -> Report
   |
   +-- Cloudflare Workers + Assets  : primary runtime / API / admin application
   +-- Cloudflare D1                : canonical operational state after cutover
   +-- GitHub                       : code, commits, PRs, CI/CD
   +-- Google Drive                 : source files and binary assets
   +-- Infisical                    : machine identity and secret source
   +-- Linear                       : tasks, projects and agent delegation
   +-- Documents                    : artifact creation/editing
   +-- Template Creator             : reusable templates and skills
   +-- Notion                       : migration source until verified import
   +-- n8n                          : migration source / optional workflow runtime
```

GOD MODE remains an **internal execution contract**. It is not a second user-facing toolkit. Registry/Core behavior is represented by the Phase VI capability registry and router.

## Phase VI rules

- Expose **one toolkit only**: `OGENIC Phase VI`.
- Cloudflare is the primary runtime.
- D1 becomes the canonical operational database only after migration verification and production cutover.
- GitHub stays the canonical source for code/config/migrations.
- Google Drive stays the source for binary/source files and assets.
- Infisical stores actual secrets. D1 and GitHub store references only.
- Read before write and use the smallest reversible mutation.
- Preview and verify before production promotion.
- Production promotion requires explicit owner approval.
- Authentication failures must report the exact provider as `REAUTH_REQUIRED` rather than inventing data.

## Repository layout

```text
.codex-plugin/plugin.json          single toolkit entrypoint
skills/ogenic-phase-vi/            unified operating contract
config/capabilities.json           capability registry
config/providers.json              provider/auth registry (no raw secrets)
database/migrations/               D1 schema and migrations
worker/                             Cloudflare Worker control-plane API
src/                                OGENIC admin application
wrangler.jsonc                     Cloudflare runtime configuration
.github/workflows/                 validation, bundle and CI
```

## API skeleton

- `GET /api/health` — runtime/database/provider health.
- `GET /api/capabilities` — unified capability map.
- `GET /api/providers` — safe provider metadata; secret references are not returned.
- `GET /api/state` — canonical D1 system state when the DB binding exists.
- `POST /api/route` — deterministic first-pass provider routing.

Until provider authentication and D1 bindings are configured, execution that requires them stays in configuration/plan mode rather than pretending it ran.

## Migration strategy

Legacy systems are frozen/read as migration sources. Data is imported once into the Phase VI model, reconciled by IDs/counts/hashes, verified in staging, then cut over. Old systems are retired only after verification; they are not deleted merely because an import completed.

```text
Audit -> Freeze -> Build Base -> Create D1 -> Import -> Reconcile -> Stage -> Verify -> Cutover -> Retire Legacy
```

This order is intentional: it avoids rebuilding Notion, n8n, Cloudflare and Infisical integrations twice.

## Local validation

```bash
python scripts/validate_toolkit.py
npm install
npm run check
```

## Cloudflare deployment

The code is prepared for Cloudflare Workers + Static Assets through the Cloudflare Vite plugin. A real deployment additionally requires the account/runtime bindings listed in `wrangler.jsonc`, including the D1 database binding.

No plaintext secret values belong in this repository.
