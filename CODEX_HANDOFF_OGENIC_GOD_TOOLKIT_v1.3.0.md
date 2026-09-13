# Codex Handoff — OGENIC GOD TOOLKIT v1.3.0

## Current baseline
Repository: `Ogenicchocolate21debug/Build-Platform`
Canonical branch: `main`
Verified runtime head before this metadata reconciliation: `44bf20e3a1cf71aced70d664b45825a255bcb99d`

PR #4 (OGENIC GOD TOOLKIT v1.3.0 + Control Tower) and PR #6 (runtime health adapters + read-only routing fix) are already merged. Do not treat the old pre-merge branch acceptance checklist as current state.

## Mission
Operate and evolve OGENIC GOD TOOLKIT as one OpenAI Plugin/Skill + MCP Control Tower UI. Preserve the single-entry auto-router model and connect only execution surfaces whose availability can be verified.

Use current OpenAI documentation and the applicable build/plugin skills before changing Apps SDK/MCP code.

## Verified current runtime
- `.codex-plugin/plugin.json`, `skills/ogenic-god-toolkit/SKILL.md`, capability/router/approval policy, and `apps/ogenic-control-tower/` are present on `main`.
- Vercel project: `ogenic-control-tower`.
- Production deployment for runtime head `44bf20e3a1cf71aced70d664b45825a255bcb99d`: `dpl_6m4zpVK4LWvqUjZuHM3M2ns9yBvR` — `READY`.
- GitHub Actions run `34723659449` (`OGENIC Remote Runtime Verify`) completed successfully against `https://ogenic-control-tower.vercel.app`.
- Audit/Bundle completed successfully on the same runtime head.
- Runtime health now uses evidence-based GitHub/Vercel adapters and host/connected execution provenance rather than fake readiness states.

## Agent operating contract
1. Reuse canonical context before asking the user to repeat known project state.
2. Discover actual tool/connector/runtime access before choosing a concrete execution surface.
3. Use the direct connected tool first, then fall through authorized alternatives; never claim a fallback ran without verified evidence.
4. Report missing execution or authorization as `CAPABILITY_REQUIRED`, `UNBOUND_CAPABILITY`, `BLOCKED`, or the explicit auth-needed state rather than inventing readiness.
5. Read before write; make the smallest reversible change; verify after execution.
6. Keep Human Approval immediately before destructive deletion, privilege/credential changes, consequential financial/external actions, protected production-branch merge, and un-preauthorized production/public publish actions.
7. Do not expose passwords, API keys, tokens, cookies, private keys, or secret values in prompts, handoffs, UI, status records, or logs.
8. Preserve Developer System-Bootstrap Ops compatibility until migration parity is verified.
9. Keep Candy resources outside Control Tower maintenance unless the task explicitly scopes Candy in.

## Runtime / deployment drift
- Historical deployment `dpl_BgBKm8zhGxuw8z6tyUm8PtjGQwwa` still exists and is production-targeted. Deleting it is a destructive action: use an authenticated Vercel action/browser surface, verify the exact deployment ID, and stop for fresh Human Approval immediately before final deletion. Do not bypass browser/OAuth policy.
- Control Tower runtime verification does not prove Candy/CN data lineage or website source-of-truth reconciliation.

## Recommended read-only / bounded tool surface
- `list_capabilities` — read only
- `route_request` — read-only route plan
- `get_runtime_status` — evidence-based; unknown/auth-needed when not verified
- `render_control_tower` — UI render tool

Add or use broad write tools only when authorization, idempotency, audit behavior, and verification are explicit.

## Result contract
Return:
- **Result** — what was actually completed and verified.
- **Blocked** — exact missing capability/authorization or unresolved drift.
- **Next** — smallest required next action.

Never simulate success or persist hidden model reasoning.
