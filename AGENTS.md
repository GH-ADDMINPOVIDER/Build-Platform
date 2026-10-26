# OGENIC / WAVE Agent Operating Rules

Scope: `phase-vi-provider-incentive-metering` only.

## Owner identity correction — requested 26 Oct 2026
- GH-1 remains GitHub principal `Ogenicchocolate21debug` / ID `306097555` / `tawatchaisamornrum11@gmail.com`. Its requested display/legacy secret label is **`STORE ONLY`**; the machine-safe reference is `STORE_ONLY`. It is read-only/legacy for dispatch and must not be selected as the GH-2 runner credential.
- GH-2 remains GitHub principal `Wave-Runner-2` / ID `342175560` / `tomload21@gmail.com`. Its requested canonical Infisical secret name is **`GH_ADDMINPROVIDER`**. The observed repository permission is still `write`; an Admin grant and the new secret's live principal/Actions-write proof are **not verified** in this checkout.
- The existing old Infisical names are migration references: `GH_ID_TAWATCHAI_STORE(OLD)`, `GH-ID-TOMLOAD-RUNNER-2`, `GIT_HUB_RUNNER-2`, and `GITHUB_TOKEN_OGE34`. Do not delete or rename their values from code; perform an owner-controlled Infisical migration, verify `GH_ADDMINPROVIDER`, then retire old references. Never log or commit token values.
- The canonical machine label is `SELF_HOST_MACHINE`; it maps to physical hostname/DigitalOcean name `OCIAN-S-Host`, existing GitHub runner registration `wave-runner-01`, and the single droplet `604432491`. This label is a machine identity, not a GitHub account or agent identity.

## Owner operating authority — verified account topology (20 Oct 2026)
- **Owner sets objectives and final authorization.** GS and GT are implementers/operators, not a second source of ownership or a second consent gate. Carry out already-authorized staging work through existing systems and continue after PASS/FAIL until the requested runtime outcome is verified or a genuine access/budget/safety boundary is reached. Do not substitute a status report, repeated planning, or delegation ping-pong for execution.
- **Existing signed Owner session is sufficient for scoped WAVE staging commands** where the implemented route permits it; do not demand a duplicate Yellow Stone/Agent confirmation. Yellow remains the tools/capability adapter and scope enforcement; it cannot mint identity or impersonate Owner. Reject unauthenticated requests, unsupported operations, missing adapter binding, wrong environment or spending beyond authority. Do not interpret bare text or `-Ow` as a cryptographic login.
- **Account 1 — Tawatchai / GH Runner-1:** GitHub connector principal `Ogenicchocolate21debug` (user ID `306097555`, profile email `tawatchaisamornrum11@gmail.com`). Repository collaborator permission observed `admin`, but **repository admin is NOT proof that every PAT has Actions write**: the legacy `GITHUB_TOKEN_OGE34` returned dispatch HTTP 403 on the examined workflow. Do not falsely advertise blanket token scope.
- **Account 2 — Tomload21 / GH Runner-2:** GitHub connector principal `Wave-Runner-2` (user ID `342175560`, profile email `tomload21@gmail.com`). Repository collaborator permission observed `write` even though Owner enabled all available account/install permissions; repo permission and token grants are distinct. Infisical staging credential **`GH-ID-TOMLOAD-RUNNER-2`** was principal-verified, and its invalid-ref Actions dispatch canary returned **HTTP 422** (Actions-write recognized; NO actual workflow was run by the canary). The `GIT_HUB_RUNNER_2` fine-grained credential was NOT verified as usable for this repo. GH-2 is the **existing WAVE staging dispatch primary**.
- **Platform Engineer (GH-2 / Tomload21) — Owner-assigned 21 Oct 2026:** The second GitHub account `Wave-Runner-2` / user ID `342175560` is the **existing staging Platform Engineer**, accountable for GH-2 Actions Dispatch, staging CI/integration repairs, Runner-1 routing and verified job/result receipts. Operational role, **not a GitHub custom ACL**: the observed repository permission stays `write`. GH-1/Tawatchai remains repo Owner/Admin and Cloudflare credential custodian. GH-2 is not a second self-hosted runner, cannot impersonate Owner, and gains no Secret/Admin/Production privileges from this title. The binding, precise duties, credential reference and authorization limits are canonical in `docs/CCS_AUTHORITY_CONTRACT.md`; verify the current principal/token scope and repo SHA before delegated writes.\n- **Only one self-hosted machine:** DigitalOcean Droplet `604432491` is `wave-runner-01`. `GH Runner-2` denotes the second **GitHub account**, never a second host. Codex GS is historically under `/home/wave/.codex`; Codex TS is historically under `/root/.codex` and completed a real Docker-mediated inference in run `39124078680`. A historical E2E is evidence, **not a fresh operational receipt for both identities**; do not reinstall, erase, or override either auth directory when a test only checks one.
- **One Certificate record:** `Certificate lincenc` is an evidence/connector registry within the original OGE-128 certificate, with separate Staging D1 table `certificate_lincenc`; it is NOT an automatic OAuth token, a provider license, or a certificate issued by a CA. Read prior receipts before proposing any reconnection. Do not create replacement certificate IDs or modify the seven-stone canonical tables.
- **Latest GH-2 recovery proof:** GitHub Actions run `39400379296` confirmed principal, the 422 dispatch authorization probe, `OGE34_STAGING_WORKER_GITHUB_TOKEN_BINDING=UPDATED`, and staging health. This repairs the prior 403 path **for that selected credential**, not a claim that `WAVE → Runner-1 → Codex TS/GS → COMMAND_RESULT_DONE → D1` currently passes. Confirm live operation with a legitimate scoped end-to-end receipt before declaring DONE.
- **Cross-chat continuity:** Before answering another GS/GT takeover, read this file, `docs/OGENIC_SESSION_LOCK_CANONICAL.md`, the original certificate, recent source SHA and exact failing logs. Report in one compact line `RESULT | CHANGED | TEST | DEPLOY | RUNTIME | SHA | RUN_ID | UI_URL | BLOCKER/NEXT_ACTION`. If a connector/tool cannot access a source, state exactly which source is unavailable; do not call all connections disconnected and do not ask Owner to re-enter facts already versioned here.
- **Stop boundary:** Never secretly overwrite production, secret values, credentials, billing, D1 schema or hard authorization limits. When a genuinely fresh Owner decision is required, ask for the exact scope once; otherwise implement and verify through the existing authorized staging path.


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

## OGE-112 — Rule taxonomy & real closure provenance
- RULE STONE is sole canonical task category and pstack number authority: `config/pstack-task-taxonomy.json` referenced by `config/oge95-rules-center.json`. VIOLET consumes it and picks skills/team, BLUE checks Agent readiness, YELLOW alone authorizes action, RUBY independent verdict, GREEN only memory. Do not create an additional gating Stone.
- Every prospective OGE closeout requires truthful visual circuit or UI proof, OGE-specific README and `closure.json` with source checksum-matched `Pstack: 1,9,24,36` numbers, implementer/reviewer/committer/deployer and exact CI/deploy/Ruby evidence. Unverified is BLOCKED, not DONE.
- Run `node scripts/oge112-check-closure.mjs OGE-ID` before proposed Linear Done. The same gate runs on staging pushes touching `docs/evidence/OGE-*`; every package must include a truthful circuit/UI visual, README, ordered immutable Pstack number+ID+SHA refs, task-category match, distinct implementer/reviewer, committer, deployer, root-cause/missed-step review, and exact CI/deploy/Ruby source SHA matching `commit_sha`. Ruby must independently authenticate the remote receipts. This GitHub check does not itself prevent a Linear status change; never claim that it does. No fake screenshot or owner QA delegation.

## Hard guardrails
- NEVER touch `main`, production, Candy, D1 schema, billing, or secrets unless the owner explicitly instructs it.
- Staging first. Minimum reversible diff.
- Do not expose credentials, tokens, cookies, private keys, or secret values.
- Do not claim DONE from memory, architecture, file existence, or build-only evidence.
- Fail closed on ambiguous permissions or environment scope.

## Canonical system
- Repo: `Wave-Runner-2/Build-Platform`
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
2. Require the canonical repo `Wave-Runner-2/Build-Platform`, expected branch `phase-vi-provider-incentive-metering`, and a verified remote (or authorized GitHub connector selecting this exact repo+branch explicitly). A sandbox branch named `work` is NOT sufficient; never write to `main` or an unrelated sandbox snapshot.
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

