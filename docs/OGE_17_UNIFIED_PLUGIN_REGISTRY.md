# OGE-17 — Unified Plugin / Capability Registry

Canonical repo/branch: `Ogenicchocolate21debug/Build-Platform` / `phase-vi-provider-incentive-metering`.

This is the implementation handoff and registry policy for WAVE Mobile. It consumes the verified inventory in `docs/OGE_19_ACTUAL_APP_CAPABILITY_MATRIX.md` and reuses existing Yellow Stone / connector contracts rather than introducing another orchestrator.

## Canonical invariant

`WAVE → Cloudflare ingress → capability resolver → policy / approval → registered adapter → provider/runtime → verification/evidence → owner-main / 1LSS_OWNER_MAIN`

Installed/available ChatGPT plugins are **execution surfaces**, not canonical memory and not proof of current authorization. D1/1LSS remains canonical state/evidence; raw credentials remain in OAuth/provider stores/Infisical/Worker secrets.

## Registry record

Every surfaced provider/capability should normalize to this logical record:

- `provider_id`
- `label`
- `connection_type`: native connector / direct API / MCP / self-host / Browser Run / unsupported
- `capabilities`: bounded operation names
- `permission_class`: `READ | WRITE | EXECUTE | DANGEROUS`
- `auth_state`: `BOUND | MISSING | EXPIRED | CONFIGURATION_REQUIRED | UNVERIFIED`
- `runtime_state`: `LIVE | DEGRADED | QUOTA_BLOCKED | SIMULATED | OFFLINE | UNVERIFIED`
- `adapter_id`
- `fallback_adapter_id` when policy permits
- `approval_mode`
- `mobile_visibility`: `KEEP_IN_MOBILE | MORE | HIDDEN | BLOCKED`
- stable health/evidence reference; never a raw secret

## Existing implementation to reuse

Do not replace these canonical pieces:

- `config/capabilities.json` — capability plane taxonomy and routing rules.
- `config/providers.json` — server/runtime provider registry baseline.
- `worker/capability-resolver.ts` + `worker/capability-resolver-api.ts` — deterministic Yellow Stone resolution.
- `worker/capability-execution-api.ts` — guarded execution and evidence envelope.
- `worker/connector-runtime.ts`, `worker/connector-app-api.ts`, `worker/entry-connectors.ts` — provider/connector execution surfaces.
- `worker/provider-connect-api.ts` + `src/ProviderConnectWizard.tsx` — connection administration surface.
- `src/ConnectorPanel.tsx` — connector status/control UI.
- `worker/browser-session-api.ts` / Live Assist — Browser Run fallback and HITL.
- `worker/codex-left-arm-api.ts` + `worker/openai-selfhost-api.ts` — verified self-host execution lane.
- `worker/verified-function-tools.ts` — strict private read-only tool bridge.
- `owner-main / 1LSS_OWNER_MAIN` — canonical continuity/evidence.

## Resolver contract

A single plugin-style entrypoint, whether exposed as `/api/plugin` or folded into the existing Yellow Stone API, must behave as a facade over the existing resolver/router rather than a separate execution system.

Logical input:

```json
{
  "intent": "bounded natural-language or typed operation",
  "provider": "optional explicit provider",
  "operation": "optional typed operation",
  "input": {},
  "idempotency_key": "stable caller key"
}
```

Logical sequence:

1. Load canonical owner/session context as required.
2. Resolve explicit provider deterministically when present.
3. Resolve capability and adapter from the existing registry.
4. Check provider/auth/runtime state; fail closed if missing or unverified for the requested operation.
5. Apply OGE-26 permission/risk/approval policy.
6. Execute only through the registered adapter; no arbitrary model-supplied URL.
7. Verify/sanitize result.
8. Return stable run/evidence reference and stamp verified evidence to 1LSS where the contract supports it.

## Mobile classification

The authoritative current per-surface classification is in `docs/OGE_19_ACTUAL_APP_CAPABILITY_MATRIX.md`.

WAVE should show frequently used owner capabilities directly and keep admin/infrastructure surfaces behind `Connections`, `Agent`, `Approvals`, `History`, or secondary sheets. Do not recreate full third-party UIs where opening the real app is more useful.

## Duplicate / stale paths not to carry forward

- Old `Chat / Work / Live / Apps / More` information architecture is superseded by OGE-31 WAVE NEXT.
- Legacy dashboard-first GM/Cashflow/App Hub framing must not become the capability registry shell.
- Vercel is optional/legacy for WAVE; Cloudflare remains canonical runtime.
- n8n is an optional registered adapter, never a mandatory central orchestrator.
- Native ChatGPT connector plus server-side provider adapter must represent one logical provider capability, not two competing memories/authorities.
- Historical Candy/Shopify execution remains frozen.
- Do not revive isolated Control Tower implementations that are not integrated into the canonical WAVE branch.

## D1 / schema decision

No D1 schema addition is required for this inventory/spec slice. Existing metadata/config, Yellow Stone and 1LSS contracts should be reused. Any future schema proposal requires separate evidence and approval; this issue does not authorize it.

## Delivery handoff

Frontend/design passes should consume registry state from the canonical connector/resolver APIs and present truthful state labels. Backend passes should add adapters behind the existing resolver/execution interfaces. All consequential operations remain approval-gated. Unknown or unavailable providers remain blocked rather than simulated as live.

## Completion evidence

- Canonical OGE-19 actual capability matrix exists on the staging branch.
- Current canonical branch contains the resolver, guarded execution, provider connection UI/runtime, Browser Run/HITL, verified self-host Codex lane, and private function-tool bridge named above.
- This document closes the OGE-17 specification/inventory scope without production deploy, external side effects, new secrets, or D1 schema changes.
