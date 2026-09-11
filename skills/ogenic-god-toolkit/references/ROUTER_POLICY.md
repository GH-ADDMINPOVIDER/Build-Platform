# OGENIC Router Policy v1.3.0

## Selection order
1. Resolve the desired outcome, target, source of truth, and risk.
2. Select one primary capability plus only the supporting capabilities required.
3. Inspect the execution surfaces that are actually available.
4. Prefer direct connected tools before indirect automation.
5. Delegate implementation-heavy work to Codex/agent execution only when the backend is connected and authorized.
6. Use quota/rate-limit state only when it is observable; otherwise report Unknown.
7. Keep source-of-truth facts separate from generated suggestions.
8. Apply Human Approval gates.
9. Execute the smallest reversible change.
10. Verify resulting state.
11. Record auditable action metadata without secrets.
12. Return Result / Blocked / Next.

## Fallback chain
Direct tool -> hosted agent/runtime -> n8n/CI -> local bridge.

Never route to a fallback that lacks required permission or an execution backend.

## Human Approval gates
Approval is required before:
- first outbound contact to a new lead
- destructive delete
- production deploy unless explicitly pre-authorized
- privilege or permission changes
- credential/secret changes
- consequential financial or external actions

## Secret handling
Ordinary workflow context may contain secret names, paths, environments, scope metadata, and missing/present state. Raw secret values remain only in an approved secret store or credential UI.

## Verification
- writes: re-read state or inspect the resulting diff
- code: run applicable test/lint/typecheck/build checks
- messages: verify actual draft/send result and recipient
- deployments: verify build/deploy status and target health
- automations: verify schedule/trigger/filter/enabled state
- data: preserve provenance and report missing fields instead of guessing
