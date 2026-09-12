# OGENIC Router Policy v1.3.0

## Selection order
1. Resolve the desired outcome, target, source of truth, and risk.
2. Select one primary capability plus only the supporting capabilities required.
3. Inspect the execution surfaces that are actually available.
4. Try the best direct connected tool first.
5. If that surface cannot execute, fall through automatically to the next authorized surface instead of stopping at the first miss.
6. Delegate implementation-heavy work to Codex/agent execution when connected and authorized.
7. Use Claude/Anthropic as an internal analysis/review/debug surface when connected and useful.
8. If no connected runtime can complete a non-consequential developer task, create/route a GitHub handoff item with the exact task, evidence, missing capability, attempted surfaces, and verification target.
9. Publish capability outcome metadata to the Developer Control Panel: READY / HANDOFF / BLOCKED / HUMAN APPROVAL, without raw secrets.
10. Use quota/rate-limit state only when observable; otherwise report Unknown.
11. Keep source-of-truth facts separate from generated suggestions.
12. Classify the action as AUTO, AUTO + REVIEW, or HUMAN APPROVAL.
13. Execute the smallest reversible change.
14. Verify resulting state.
15. Record auditable action metadata without secrets.
16. Return Result / Blocked / Next.

## Capability waterfall
`Direct connected tool -> native app connector -> Codex implementation -> Claude review/debug -> GitHub handoff queue -> automation/CI -> authorized local bridge -> BLOCKED`

Rules:
- Do not stop merely because the first tool cannot perform the action.
- Skip surfaces that are unavailable, unauthorized, irrelevant, or rate-limited.
- Never claim a fallback ran unless its resulting state is verified.
- GitHub handoff is the durable developer fallback for tasks that cannot be executed by currently connected tools, not a substitute for Human Approval.
- A handoff item must include: requested outcome, target repo/system, attempts, blocker, required capability, risk class, verification condition, and provenance links when available.
- Consequential actions still pause at Human Approval even if GitHub can technically execute them.

## Developer status publishing
For every routed developer task, emit a secret-safe status record suitable for the Developer Control Panel:
- `capability`
- `requested_action`
- `selected_surface`
- `state`: `ready | handoff | blocked | human_approval | unknown`
- `handoff_target` when used
- `reason`
- `verification`
- `updated_at`

Never publish raw credentials, tokens, secret values, private keys, or hidden reasoning.

## Automation levels

### AUTO
Proceed without asking the user again for:
- read-only inspection, search, retrieval, status checks, logs and diagnostics
- analysis, scoring, planning, drafting and provenance checks
- test, lint, typecheck and build verification
- allowlisted model-to-model calls used for analysis, review or debugging
- secret metadata checks such as name/path/environment/scope/present-or-missing state, without exposing raw values
- capability waterfall routing and GitHub handoff creation for non-consequential developer work
- publishing secret-safe capability status to the Developer Control Panel

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
- handoffs: verify the GitHub item exists and contains the blocker + verification target
- developer status: verify the website/API returns the new secret-safe state record
