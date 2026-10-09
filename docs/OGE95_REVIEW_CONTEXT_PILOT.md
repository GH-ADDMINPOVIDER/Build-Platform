# OGE-95 — Review visualization and context economy pilot

Scope: staging branch phase-vi-provider-incentive-metering only. Reuse the existing wave-runner-01 and GitHub graph. No new provider, dependency, memory store, secret, deployment, approval gate or subscription.

## Review diagrams (PR Lens concept, no external App/Action installed)

Run: node scripts/oge95-review-visual.mjs HEAD~1 (or a trusted full 40-character base SHA). Emits oge95-review-impact.svg / .md / .json from actual git path diffs and existing docs/architecture/oge-system-edges.json. Highlights are conservative review candidates, NOT verified blast radius or new data flow. Unknown changes are listed; no LLM call, App permission, or automatic PR comments. Before OGE closure, retain existing closure.svg and Ruby evidence requirements.

## Context economy (Headroom concept, NOT integrated Headroom proxy)

Run: node scripts/oge95-context-economy.mjs. Synthetic repeated tool-log lines are grouped reversibly, with SHA-256 exact restoration proof. Approval, failure, credential, session and SHA-bearing lines are not coalesced. Synthetic character savings are NOT measured LLM tokens, cost savings, or proof of model answer preservation. No changes to 1LSS / Green, real provider payloads, system prompt, instruction, or Yellow effect approvals. Existing config/agent-context-policy.json remains canonical bounded context policy; old canceled OGE-74 is historic context, not reopened.

## Tests and risk

Run node --test tests/oge95-review-visual.test.mjs tests/oge95-context-economy.test.mjs. Optional manual workflow .github/workflows/oge95-review-visual-context-proof.yml on existing selfhost only; no automatic extra GitHub Actions runs. Do NOT run untrusted PR code on private selfhost or publish private repository diff to a third-party App without authorization. Full Headroom proxy requires installation and real opt-in A/B validation; not done. Diagram, SVG, synthetic compression alone do not certify Ruby PASS or a production deployment.

Associated OGE: active Stone Runner OGE-95, final evidence OGE-99/100; historical visualization OGE-62 and historical context OGE-74.
