# AUSTRA v6 · OGENIC Phase VI · Workflow Engine v0.1 — Inventory

## Confirmed on `phase-vi-unified-cloudflare`

- API runtime: Cloudflare Worker + Hono in `worker/index.ts`.
- Durable state: Cloudflare D1 binding name `DB`; append-only Phase VI migrations live in `database/migrations/`.
- Staging pipeline: `.github/workflows/phase-vi-cloudflare-staging.yml` resolves/creates `ogenic-phase-vi-staging`, injects `DB`, applies `database/migrations`, builds, deploys and probes health.
- Authentication: existing shared-state API uses `OGENIC_OPS_KEY`; workflow run/read/cancel endpoints reuse that boundary instead of introducing another auth system.
- Secrets: repository policy and CI already treat Infisical as the canonical secret source. Workflow definitions and D1 contain references/state only, never secret values.
- Existing durable coordination: `agent_tasks`, `agent_events`, `agent_checkpoints`, `agent_locks`. Workflow Engine v0.1 does not replace them.

## Gaps found

- No reusable runtime Linear handler was found in Worker source.
- No reusable runtime GitHub draft-PR handler was found in Worker source.
- No Codex/Claude Worker invocation adapter was found in Worker source.
- Infisical is wired for CI/deploy credential resolution, but a Worker-runtime scoped credential resolver is not yet present.
- No Cloudflare scheduled trigger is declared in `wrangler.jsonc`. The v0.1 entry exports `scheduled()` so the existing scheduler can invoke bounded `tick()` after its staging binding is confirmed. No new queue or cron is introduced here.

Missing external adapters intentionally return `CONFIGURATION_REQUIRED`; the implementation does not claim integrations are live when they are not. Deterministic `test.echo`, `gate.exists` and `gate.equals` adapters support interpreter acceptance without external side effects.

## Isolation

Implementation branch: `phase-vi-workflow-engine-v0.1`, based on `phase-vi-unified-cloudflare` commit `2ee58fadc46fcb8709547d188413066932c679bf`.

No production deployment, merge or production credential path is included.
