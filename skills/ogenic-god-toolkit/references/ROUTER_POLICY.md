# OGENIC Router Policy v1.3.0

## Selection order
1. Resolve the desired outcome, target, source of truth, and risk.
2. Select one primary capability plus only the supporting capabilities required.
3. Inspect the execution surfaces that are actually available.
4. Prefer direct connected tools before indirect automation.
5. Delegate implementation-heavy work to Codex/agent execution only when the backend is connected and authorized.
6. Use Claude/Anthropic as an internal analysis/review/debug surface when it is connected and authorized; do not require Human Approval merely because one approved model calls another.
7. Use quota/rate-limit state only when it is observable; otherwise report Unknown.
8. Keep source-of-truth facts separate from generated suggestions.
9. Classify the action as AUTO, AUTO + REVIEW, or HUMAN APPROVAL.
10. Execute the smallest reversible change.
11. Verify resulting state.
12. Record auditable action metadata without secrets.
13. Return Result / Blocked / Next.

## Fallback chain
Direct tool -> authorized Codex/Claude/hosted agent runtime -> n8n/CI -> local bridge.

Never route to a fallback that lacks required permission or an execution backend.

## Automation levels

### AUTO
Proceed without asking the user again for:
- read-only inspection, search, retrieval, status checks, logs and diagnostics
- analysis, scoring, planning, drafting and provenance checks
- test, lint, typecheck and build verification
- allowlisted model-to-model calls used for analysis, review or debugging
- secret metadata checks such as name/path/environment/scope/present-or-missing state, without exposing raw values

Calling OpenAI, Codex, Claude/Anthropic or another explicitly allowlisted internal execution surface for reasoning, implementation review or debugging is not treated as customer-facing outbound contact.

### AUTO + REVIEW
Proceed automatically, but require verification/review before reporting success, for:
- feature-branch code edits and patches
- draft pull requests
- staging/preview deploys
- CI reruns and bounded fix/retry loops
- Codex implementation work
- Claude review/debug passes
- reversible automation/config changes limited to non-production targets

Claude may be invoked automatically when review adds value, including repeated CI/test failure, security-sensitive diffs, large or ambiguous changes, runtime/adapter errors, or low-confidence implementation results. Do not call both Codex and Claude by default when one agent is sufficient.

### HUMAN APPROVAL
Pause immediately before the consequential action for:
- first outbound contact to a new sales lead or an actual external send on the user's behalf
- destructive deletion or irreversible destructive mutation
- merge to `main` or another protected production branch
- production deploy, public publish, or go-live action unless explicitly pre-authorized for that exact scope
- privilege, permission, role or access-scope changes
- creating, rotating, replacing, revoking or deleting credentials/secrets/tokens/keys
- consequential financial actions such as payment, transfer, purchase, refund or charge
- other irreversible external actions with material user/business impact

Merely mentioning production, permissions, credentials, secrets or tokens in a read-only inspection request must not trigger Human Approval. Classification must depend on the requested action, not keyword presence alone.

## Secret handling
Ordinary workflow context may contain secret names, paths, environments, scope metadata, and missing/present state. Raw secret values remain only in an approved secret store or credential UI. Credential selection is system-controlled, not model-controlled.

## Verification
- writes: re-read state or inspect the resulting diff
- code: run applicable test/lint/typecheck/build checks
- messages: verify actual draft/send result and recipient
- deployments: verify build/deploy status and target health
- automations: verify schedule/trigger/filter/enabled state
- data: preserve provenance and report missing fields instead of guessing
