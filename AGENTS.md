# OGENIC / WAVE Agent Operating Rules

Scope: `phase-vi-provider-incentive-metering` only.

## Mission
Act as an operator, not a status reporter. Read the real state, choose the cheapest safe path, execute, verify, record evidence, then continue to the next safe task without waiting for the owner unless a real human boundary is reached.

## Mandatory continuity preflight — OGE-101 and OGE-104..108 (owner directive 2026-10-09)
- Read docs/OGENIC_SESSION_LOCK_CANONICAL.md plus earlier scoped decisions, OGE-22 and latest staged source SHA BEFORE starting a new OGE task/Agent session; never infer prior choices from only a new issue title.
- Existing D1 owner-main / 1LSS_OWNER_MAIN is the single memory line. Provider sessions are indexes/caches. A–Z/X-Y-Z is NOT fully implemented: no invented provider memory.
- Historic Done can be source-only, Canceled can be deferred. If past session isn't accessible, return CONTEXT_UNAVAILABLE. External providers require existing Yellow consent and Ruby evidence before Green retention.
- Separate Mineral Phase II / OGE-II-1 (native OGE-102) and its project were CANCELED. Continue native OGE-101 onward. OGE-103 is independent audit.
- No old issue auto-reopen, no main/production/Candy/D1 schema/secrets writes.

## pstack guided workflows — OGE-109
- The upstream pstack from Lauren Tan is MIT-licensed, checked version 0.15.15; license text under third_party/pstack/LICENSE.
- Cursor-only `/add-plugin pstack` CANNOT run in Cloudflare, Railway or a ChatGPT connector. WAVE exposes FOUR pstack-inspired prompt presets (config/pstack-workflows.json), not a natively installed Cursor plugin and not a model execution service.
- A preset in the authenticated WAVE Tools panel fills the DRAFT only. It must not send, spend credits, commit, deploy or mutate D1 automatically. A subsequent manual Send uses existing provider route/quota and Yellow/Ruby/Green controls.
- Before acting, preserve previous owner-main / 1LSS decisions and verify exact current GitHub staging SHA. Native pstack Cursor-specific multi-agent features are UNSUPPORTED unless separately proven. No new memory, Control Tower or paid hosting.

## OGE-110 — Full portable pstack source belongs to VIOLET STONE
- Violet is the **workflow and multi-agent coordinator**, never Yellow. The complete MIT portable skill source catalog is pinned at `3a604672c46cd8187d2b19980eae0a34f9f91138` from `backnotprop/pstack`, mirrored into `third_party/pstack-portable` and standard `.agents/skills/` (51 Skills + 2 agent definitions).
- `GET /api/violet/pstack/catalog` is authenticated/read-only skill inventory and NEVER calls providers. `src/VioletDistributionPanel.tsx` exposes mobile searchable source cards. A catalog/Skill file is NOT proof of actual agent execution or an installed native Cursor plugin.
- Blue verifies eligible agents, Violet selects workflow/team, Yellow alone authorizes paid calls/tool side effects, Ruby independently verifies; Green/1LSS holds one canonical owner-main memory line. Pinned third-party scripts and automations are data ONLY and must never be executed without separate review and authorizations.
- OGE-109 four WAVE prompt presets are still the existing composer UI. OGE-110 imports source and exposes catalog; real /swarm, /poteto-mode, provider-specific subprocesses and UI automation require host capability, quota consent, proven receipts; report UNSUPPORTED rather than inventing missing providers. No new paid Railway/Replit runtime or desktop Cursor required.

## OGE-111 — pstack source-backed cognition and agent read receipts
- Pstack is WAVE's working methodology; Violet owns selecting Skills and coordinating Blue-verified agents, not a second Yellow gate.
- `POST /api/violet/pstack/select` picks a small source-checked Skill stack without model inference. `GET /api/violet/pstack/learning-plan` offers all 51 original hashes in bounded read waves; receiving a catalog is NOT proof of a real Agent reading or remembering it.
- Agents retrieve selected full Skills when authorized, receive owner-main/1LSS context separately, and must report real source fingerprints and session receipt. Ruby verifies before any Green canonical retention. No new D1 schema or second memory database, no 51xN paid automatic calls.
- Missing Blue readiness or Yellow consent means NOT_DISPATCHED; never claim learned/completed from a prompt or CI compilation.

## Hard guardrails
- NEVER touch `main`, production, Candy, D1 schema, billing, or secrets unless the owner explicitly instructs it.
- Staging first. Minimum reversible diff.
- Do not expose credentials, tokens, cookies, private keys, or secret values.
- Do not claim DONE from memory, architecture, file existence, or build-only evidence.
- Fail closed on ambiguous permissions or environment scope.

## Canonical system
- Repo: `Ogenicchocolate21debug/Build-Platform`
- Branch: `phase-vi-provider-incentive-metering`
- Conversation: `owner-main`
- Session line: `1LSS_OWNER_MAIN`
- D1: canonical operational state
- Cloudflare Worker: primary runtime/router
- GitHub: source/version/CI/evidence
- Linear: task state / ownership
- Yellow Stone: capability + execution layer

## Mandatory Codex checkout attestation — EVERY invocation / resumed session / before write
The Codex sandbox checkout is NOT the GitHub connector. GitHub App permissions do not establish shell git remote access. Do not presume a checkout is valid because prior tasks succeeded.
1. Identify the actual worktree: `pwd`, `git rev-parse --show-toplevel`, `git status --short --branch`, `git branch --show-current`, `git rev-parse HEAD`, `git remote -v`.
2. Require the canonical repo `Ogenicchocolate21debug/Build-Platform`, expected branch `phase-vi-provider-incentive-metering`, and a verified remote (or authorized GitHub connector selecting this exact repo+branch explicitly). A sandbox branch named `work` is NOT sufficient; never write to `main` or an unrelated sandbox snapshot.
3. Independently resolve remote staging HEAD from the connected GitHub API/connector and compare it with local HEAD before editing. Detect dirty/uncommitted work and check intended file ownership against concurrent agents. If HEAD advanced, re-read affected files and rebase/reconcile safely; no blind force push.
4. Run a read-only auth/connectivity probe for whichever write transport is actually used. If the shell gets HTTP 403, missing `origin`, or wrong checkout, STOP shell git; use an already-authorized GitHub connector to read/write *explicit* repo+branch when available, checking blob SHA per write. Do not recreate remotes with guessed credentials, exfiltrate tokens, or repeatedly retry 403.
5. Re-attest branch, exact upstream SHA, scope and diff immediately BEFORE each commit/push. Immediately AFTER, independently re-read committed SHA/branch and CI evidence through GitHub. Dispatch/delegation is not a successful code change. Report `BLOCKED_CHECKOUT` or `BLOCKED_AUTH` with sanitized actual evidence when either path is unavailable.
6. Carry this preflight on every newly delegated Codex task, new shell, resumed session, and worktree change. This is an execution safety check, not a second Yellow authorization/policy engine; never silently bypass Yellow approval.

## Credit-efficient operating loop
1. READ ONCE: reconcile branch HEAD, recent commits, latest relevant CI, active issue/task state, and current blocker.
2. CACHE THE FACTS for the current turn. Do not repeatedly re-read the same source unless new evidence appears.
3. PICK ONE highest-value safe task that is not already owned by another active agent.
4. USE THE CHEAPEST SUFFICIENT TOOL first:
   - direct connector/API/read-only query before launching an expensive agent
   - GitHub/Linear evidence before broad web research
   - Canva/Figma only for real UX/UI work
   - Lovable only when rapid prototype materially reduces implementation time
5. EXECUTE the task.
6. VERIFY with real evidence: code/commit -> CI -> staging/runtime -> evidence/timestamp.
7. INTERPRET the result. PASS/FAIL is not the endpoint.
8. RE-PLAN and continue automatically to the next safe task.

## Anti-credit-burn rules
- No repeated polling loops. If a remote job is running, check only when enough time has plausibly elapsed or when new evidence exists.
- No re-reading full repositories when a targeted file/commit/issue is enough.
- No duplicate agent delegation. Check whether Codex/Linear/another agent already owns the task.
- No broad multi-tool fan-out unless the task genuinely requires it.
- Do not invoke Canva/Figma/Lovable just because they are connected.
- Prefer one decisive implementation pass over many tiny speculative passes.
- If two attempts hit the same blocker with no new evidence, STOP that path, record the blocker, choose a safe fallback, or request HITL.
- Do not spend metered OpenAI Agent/API execution on facts that can be verified cheaply from GitHub/Linear/runtime metadata.

## Provider API usage — owner cost/context directive (2026-10-08)
- Existing authorized API tokens are usable for real specialist work through the established Yellow capability and existing provider accounts; do not force a blanket zero-API mode that stalls the factory.
- Apply the **existing** `config/agent-context-policy.json`: task-scoped, minimal context, bounded per-call token budgets, metered usage evidence, no hidden retry/fallback, no raw credentials in logs/D1.
- For DeepSeek, use the existing authorized READ route `POST /api/capabilities/execute` with `provider=deepseek` and `capability=context_load`; do not impose an obsolete 256-token output cap or truncate useful output. Preserve finish_reason and enforce the currently configured context/spend policy.
- Ordinary approved READ inference need not ask for redundant approval. Approval remains required when spending beyond an authorized budget or for consequential external writes/deploys. Keep the existing Yellow/Ruby/Green execution boundaries, not a new policy gate.
- Never call failed transport attempts a completed analysis; only accept source-backed provider output with its GitHub run reference and Ruby verification state.

## Continuation behavior
Never stop at:
- PASS
- FAIL
- READY
- BLOCKED

Instead continue:
`state -> gap -> capability -> execute -> verify -> evidence -> next action`

Only stop for a true boundary:
- login / OAuth
- explicit human approval
- HITL takeover
- payment/spend approval
- inaccessible secret that cannot be resolved by an existing authorized path
- unsafe or forbidden scope

## Tool selection
### GitHub
Canonical implementation and CI evidence. Read targeted files/commits first. Write only on the staging branch.

### Linear
Use for ownership, issue state, avoiding duplicate work, and implementation coordination.

### Canva
Use for visual direction, hierarchy, brand exploration, presentation of screen concepts, and design critique. Do not treat Canva output as implementation evidence.

### Figma
Use for actual UI/UX components, states, spacing, tokens, developer-ready screens, and handoff.

### Lovable
Use only as a subordinate rapid prototype. Never replace the canonical Cloudflare/D1 architecture with a disconnected app.

### Vercel
Preview when relevant. Do not replace Cloudflare as canonical runtime.

## WAVE UX rules
- Connections page = configure/manage.
- Composer = use capabilities.
- No fake controls or fake notification dots.
- Message actions must be functional.
- Attachments must never silently disappear.
- Mobile Safari/Home Screen/PWA are required verification targets for composer reliability.

## OGE incident memory (reuse before debugging)
- On a failing OGE run, FIRST search the versioned `config/oge-error-memory.json` with `node scripts/oge-incident-memory.mjs lookup --oge OGE-35 --http 404 --component athena-yellow-resolver` or owner-auth `GET /api/knowledge-refinery/incident?oge=OGE-35&http=404`.
- **HTTP 404/409 alone is not a fingerprint.** Require the issue, failing component and structured error code when available. Return UNKNOWN rather than attach the wrong cause to an unrelated OGE.
- For genuinely new errors, `node scripts/oge-incident-memory.mjs record --oge OGE-10 --http 404 --component component-id --evidence https://github.com/<owner>/<repo>/actions/runs/<run_id>`; only record an observed symptom, mark UNVERIFIED, commit the catalog to staging, and comment the **existing** Linear OGE (do not open a duplicate).
- For a verified fix, update **that same** record with exact root cause, minimal recovery steps, commit and successful CI/runtime evidence. Do not promote guesses to CONFIRMED; do not weaken permission/billing guards to silence 404/409.
- This is a read-only advisory lookup, **not another execution Policy Gate**. D1 remains canonical application state; the GitHub+Linear incident ledger is versioned evidence. Do not add a D1 table.

## Reporting
Use compact evidence-first updates:

### RESULT
- what changed
- what is VERIFIED
- commit/run/evidence references

### BLOCKED
- exact blocker only
- use `READ_UNAVAILABLE` when a source cannot actually be read

### NEXT
- next safe action
- continue automatically unless true owner approval is required

## Definition of DONE
A feature is DONE only when applicable evidence exists for:
1. code/change
2. staging path
3. successful execution/runtime
4. verification
5. evidence reference
6. forbidden scopes untouched
7. UI control is real if UI-related
8. state/evidence returns to owner-main / 1LSS when required

## OGE closure visual requirement
For new Codex-driven OGE closures:
- add one truthful human-readable visual under `docs/evidence/OGE-<id>/` (or a real UI screenshot under `public/evidence/OGE-<id>/`)
- add a closure README with RESULT / CHANGED / TESTS / EVIDENCE / RESIDUAL RISK
- link the canonical GitHub commit/CI evidence from the Linear closure comment
- never fabricate a screenshot or runtime state; use deterministic Mermaid/SVG when no natural screenshot exists
- default exhibition style is black/white/grayscale

