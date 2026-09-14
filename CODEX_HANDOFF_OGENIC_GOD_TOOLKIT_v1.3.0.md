# Codex Handoff — OGENIC GOD TOOLKIT v1.3.0

## Current baseline
Repository: `Ogenicchocolate21debug/Build-Platform`
Canonical branch: `main`
Repository tip observed before this metadata reconciliation: `abcb4a2a9772b5639316008748e0f37ade3922a8`
Last fully verified runtime head: `44bf20e3a1cf71aced70d664b45825a255bcb99d`

PR #4 (OGENIC GOD TOOLKIT v1.3.0 + Control Tower) and PR #6 (runtime health adapters + read-only routing fix) are already merged. Do not treat the old pre-merge branch acceptance checklist as current state.

## Mission
Operate and evolve OGENIC GOD TOOLKIT as one OpenAI Plugin/Skill + MCP Control Tower UI. Preserve the single-entry auto-router model and connect only execution surfaces whose availability can be verified.

Use current OpenAI documentation and the applicable build/plugin skills before changing Apps SDK/MCP code.

## Verified current runtime
- `.codex-plugin/plugin.json`, `skills/ogenic-god-toolkit/SKILL.md`, capability/router/approval policy, and `apps/ogenic-control-tower/` are present on `main`.
- Vercel project: `ogenic-control-tower`.
- Current `main` production deployment observed for repository tip `abcb4a2a9772b5639316008748e0f37ade3922a8`: `dpl_DtVDG6w6rrsvcLEmsXYGMAfUAUb8` — `READY`.
- The last dedicated successful remote-runtime verification remains GitHub Actions run `34723659449` on head `44bf20e3a1cf71aced70d664b45825a255bcb99d`, against `https://ogenic-control-tower.vercel.app`; Audit/Bundle also completed successfully on that same head.
- Do not infer equivalent full runtime verification for later heads solely from `READY` deployment state. Runtime health remains evidence-based and must report unknown/auth-needed when not independently verified.

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
- `main` advanced after the last fully verified runtime head via Money Control changes at `d43831b3330611544d33ff83e31f03d384b878c9` and `abcb4a2a9772b5639316008748e0f37ade3922a8`. Their latest production deployment is `READY`, but no equivalent dedicated remote-runtime verification for the exact latest head is established here.
- Recent Vercel previews from `phase-vi-provider-incentive-metering` are failing before build. Latest observed error: `NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST` — configured Root Directory `apps/ogenic-control-tower` does not exist on that branch. Treat this as branch/project-layout drift; do not rewrite global project Root Directory based on the staging branch without verifying main compatibility.
- Historical deployment `dpl_BgBKm8zhGxuw8z6tyUm8PtjGQwwa` remains a destructive-delete concern. Deleting it requires an authenticated Vercel action/browser surface, exact deployment-ID verification, and fresh Human Approval immediately before final deletion. Do not bypass browser/OAuth policy.
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
