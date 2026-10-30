# YELLOW STONE ARCHITECTURE v1 — OWNER APPROVED

Project: OGENIC / Unifiend
Phase: YELLOW STONE — Tools Control Panel · Operate Capability
Approval date: 2026-09-28
Status: APPROVED FOR STAGING PLANNING + IMPLEMENTATION

## 1. GREEN STONE invariants

- `owner-main / 1LSS_OWNER_MAIN` remains the single canonical ordered session line.
- D1 remains canonical operational memory/state.
- Cloudflare Worker remains the primary runtime/router.
- GitHub remains canonical source/version control.
- Every surface/provider/agent resolves back to the same 1LSS.
- No new memory/session database may replace, duplicate, or fork 1LSS.
- Raw credentials, cookies, refresh tokens, bearer tokens, or authorization headers must never be stored in D1.
- Staging first.
- Side effects require approval according to risk.
- Essential operation must remain practical from an iPhone.
- Multi-agent / multi-provider architecture.
- MCP may be an adapter/source, but is not required at runtime.

## 2. Position

YELLOW STONE is a **Cloudflare-operated, policy-enforced capability plane bound to canonical 1LSS**.

It is not a second memory system, generic MCP wrapper, duplicate workflow platform, or new control plane above the existing Phase VI architecture.

Core lifecycle:

`Intent → Discover → Authorize → Execute → Verify → Audit → Persist → Resume`

Only verified operational outcomes return to canonical 1LSS as trusted state.

## 3. Unifiend Agent Deck

One Unifiend chat surface exposes:

- **Direct** — one selected model/agent.
- **Delegate** — send a durable task to one agent and continue chatting.
- **Council** — fan out one objective to multiple specialist agents; results return independently.
- **Auto** — OGENIC chooses the specialist lane based on task/capability.

Initial lanes:

- OpenAI Agent — supervisor/orchestrator
- Codex — repository implementation/review
- Claude — adversarial architecture/failure analysis
- DeepSeek — deterministic registry/router/system internals
- Perplexity — external research with citations
- Cloudflare Agent — runtime/primitive fit
- Linear Agent — delivery graph/dependencies/acceptance criteria
- Manus — end-to-end mobile operator simulation
- Gemini — divergent product/UX ideas

Agents may propose work. They do not grant themselves authority to execute high-risk actions.

## 4. Run Center

Every delegated/council job has a stable run record:

`Run ID → Agent → Capability → Status → Checkpoint → Evidence → Verified Result → 1LSS`

Runs may continue while the user leaves the agent page. Completion, blocked, approval-needed, and failure states must surface in a mobile inbox/notification with a deep link to the exact Unifiend run.

## 5. Capability model

A **Capability** is the abstract governed contract.

- **Tool** — callable schema exposed to an agent.
- **SDK** — implementation package for one or more capabilities.
- **Skill** — reusable composed plan/orchestration of capabilities.
- **Doc** — API specs, schemas, examples, operating guidance, verification notes.
- **Provider Adapter** — normalized executor for GitHub, Linear, Cloudflare, LINE, OpenAI, etc.
- **Workflow** — durable multi-step execution only where required.

MCP is one possible adapter format; native APIs, Worker functions, browser/session connectors, and future SDKs are equally valid.

## 6. Capability Registry and discovery

GitHub is canonical for versioned manifests, adapters, schemas, docs, and source. D1 stores queryable operational/indexed capability metadata and runtime references in the existing binding.

Minimum metadata:

- stable capability ID
- semantic version
- kind (`tool|sdk|skill|doc|workflow`)
- provider/adapter binding
- input/output schema refs
- permission/risk class
- environment/resource scope
- reversibility
- idempotency policy
- timeout/retry policy
- verification contract
- Git SHA / manifest hash
- status (`staging|active|deprecated|disabled`)

Agents should not receive the whole toolkit. Prefer meta-capabilities:

- `cap.search`
- `cap.describe`
- `cap.invoke`
- `cap.status`
- `cap.resume`

The router performs deterministic filtering and returns only the minimum relevant descriptors/top-N schemas. Semantic search may generate candidates later, but final routing/authorization remains deterministic.

## 7. Permission and risk

Baseline classes:

- **READ** — observation only; auto-allow when scoped.
- **WRITE** — mutation; staging + reversible may auto-allow, external writes generally require approval.
- **EXECUTE** — code/command execution; isolated staging may auto-allow, external/prod requires approval.
- **DANGEROUS** — destructive, irreversible, production, secret-sensitive, merge/deploy/delete/payment; human approval required.

Risk also considers environment, resource scope, reversibility, side effects, and idempotency.

### LLM hard boundaries

An LLM must not control:

- approval/authorization token issuance
- self-risk classification
- capability-registry writes
- audit-log integrity
- retry/backoff/circuit-breaker logic
- session/lock concurrency primitives
- credential choice or secret injection
- provider endpoint URLs
- D1 migrations
- its own permission escalation
- whether an irreversible action is safely reversible

These are deterministic Worker/policy decisions.

## 8. Execution contract

Each execution carries at minimum:

- canonical 1LSS/session ref
- run ID
- step ID
- pinned capability version
- actor and authorization context
- environment/resource scope
- deterministic idempotency key where required
- deadline/retry budget
- expected output schema
- verification requirement

Lifecycle:

1. Resolve canonical 1LSS.
2. Normalize intent.
3. Search/filter eligible capabilities.
4. Pin capability/provider/adapter versions.
5. Evaluate policy/permission.
6. Create approval request if required.
7. Persist intent/PENDING state before side effect.
8. Execute through Worker/provider adapter.
9. Validate typed result.
10. Verify intended postcondition/evidence.
11. Write audit/result envelope.
12. Commit verified compact outcome to D1/1LSS.
13. Create checkpoint/resume pointer for remaining work.

A provider HTTP 200 is not enough for canonical truth.

Verification states should distinguish at least:

`verified | partially_verified | unverified | contradicted | blocked | failed | compensation_pending`

## 9. Idempotency, retry, recovery

- External side effects use deterministic idempotency keys generated by the Worker, not the agent.
- On timeout/uncertain external side effect, reconcile provider state before retry/fallback.
- Retry/backoff/circuit-breaker logic is Worker-owned.
- Resume from durable intent/checkpoint/receipt state, never from reconstructed LLM memory.
- Irreversible actions prefer terminal workflow placement or an explicit compensating-action path.
- Material payload changes invalidate prior approval.
- Reuse existing D1 optimistic/lease/fence patterns first. Add Durable Objects only if staging proves real coordination contention.

## 10. A–Z Session Directory

A–Z is navigation/resolution metadata, not memory.

Examples:

- `A` → Apple
- `G` → GitHub / Google
- `L` → LINE / Linear
- `N` → Notion
- `O` → OpenAI
- `V` → Vercel

Resolver entries may contain bucket, provider ID, account/session reference ID, display metadata, capability scope, health, expiry/revocation state, first/last 1LSS sequence refs, and a secret/credential reference handle only.

Raw cookies/tokens never enter D1.

Resolution path:

`A–Z UI → D1 session/provider ref → Worker policy → runtime credential/session resolution → provider action → verification → 1LSS sequence`

## 11. Minimal Cloudflare v1 stack

Start minimal and reuse existing Phase VI modules:

- **Workers** — ingress, routing, adapters, policy, retries, resolver, health.
- **D1** — canonical 1LSS + capability metadata + run/checkpoint/approval/audit/session refs/usage.
- **R2** — only for large artifacts/payloads that should not live inline in D1.
- **Secrets / existing secret source** — raw credentials remain outside D1.
- **Cron/Scheduled triggers** — expiry cleanup and stale-run/approval maintenance where needed.
- **GitHub** — source/version control and versioned manifests/adapters/docs.

Defer until measured need:

- Durable Objects — real high-contention coordination/sub-second shared state.
- Cloudflare Workflows — long-running waits/retries beyond current Worker+D1 workflow limits.
- Queues — high-volume async dispatch/DLQ requirements.
- KV — only if D1 manifest lookup becomes a measured bottleneck; never a competing source of truth.
- Vectorize — only if exact/FTS capability discovery is insufficient.
- Service Bindings/multi-Worker split — only for real isolation/scaling/deploy-cadence needs.

## 12. Mobile UX requirements

Unifiend is the operational cockpit, not a provider-console launcher.

Required surfaces:

1. Single Feed / 1LSS chat
2. Agent Deck — Direct / Delegate / Council / Auto
3. Run Center — durable tasks, checkpoints, status, evidence
4. Approval Inbox — payload/risk-bound approvals
5. A–Z Provider/Session Resolver
6. Capability Sheet — version, scope, risk, verification
7. Bottom-sheet technical details/logs/evidence
8. Notification return path to the exact run

Generic `Allow`/`Continue` is insufficient for consequential actions. Approval must show exact action, destination/resource, payload/hash/scope, expiry, and verification plan.

## 13. No-change boundaries

Do not:

- replace or fork 1LSS
- create a second memory/control database
- expose raw secrets to models or D1
- touch `main`, production, or Candy for Yellow Stone development
- make MCP mandatory
- let agents invent provider URLs or arbitrary import paths
- rebuild existing Phase VI workflow/auth/1LSS/connector/agent-task/audit/runtime modules when they can be wrapped/reused
- treat model tracing as the audit source of truth

## 14. Acceptance gates for v1

Unifiend is not `one app and done` until a phone-only operator can:

1. Fix a GitHub issue from Unifiend and see branch/commit/PR/test evidence without requiring GitHub for the normal path.
2. Diagnose a Cloudflare staging failure from Unifiend.
3. Use a valid LINE/provider session reference without exposing a raw token/cookie.
4. Add a new capability through a versioned staging contract/test flow.
5. Approve a consequential external side effect after seeing exact payload/scope/destination/expiry/verification.
6. Stop after a checkpoint and resume without duplicating side effects.
7. Handle expired/unavailable connectors with a precise remediation state, not a generic login loop.
8. Invalidate approval when a material input changes.
9. Determine `what happened / what remains / what is safe to retry` quickly from Run Center on mobile.
10. Verify no raw secret/cookie/token/auth header appears in D1, 1LSS, GitHub, prompts, logs, or mobile analytics.

## 15. Delivery order

### MUST HAVE v1

1. Repository reuse audit and minimum-diff map.
2. Capability manifest/registry contract using existing config + D1 structures where possible.
3. Deterministic resolver/router and meta-tool surface.
4. Provider adapter normalization around existing adapters/connectors.
5. Permission + approval + deterministic execution gates.
6. Verification/result envelope + 1LSS return.
7. Durable run/checkpoint/resume using existing workflow/task tables first.
8. A–Z provider/session resolver metadata.
9. Unifiend Agent Deck + Run Center + Approval Inbox minimal mobile UI.
10. Mobile end-to-end staging verification.

### SHOULD HAVE v1.1

- Council fan-out/fan-in summaries
- rich notification/deep-link experience
- additional provider adapters
- artifact offload to R2 when actual result size requires it
- improved capability discovery/ranking

### LATER / MEASURE FIRST

- Durable Objects, Queues, Workflows expansion/replacement, KV cache, Vectorize
- native App Store packaging
- high-scale multi-tenant policy layers

### EXPERIMENT

- multi-model consensus/reviewer lanes
- server-driven mini-UI per capability
- biometric approval UX when supported by the native/mobile platform

## 16. Review-council synthesis

Accepted:

- deterministic capability registry + top-N/meta-tool discovery
- policy-enforced capability plane positioning
- verified-result gate
- provider-independent adapter model
- secret-free operational memory
- Run Center + notification/approval inbox
- A–Z as resolver/index, never memory
- minimal Cloudflare stack first; add primitives only from measured need

Rejected/deferred:

- new KV memory/session store
- unconditional Durable Object/Queue/Workflow adoption before measured need
- dumping every tool schema into every model context
- model-controlled authorization/risk/routing endpoints
- raw browser/login material in D1

This file is the approved architecture source for execution-graph creation and minimum-diff staging implementation.
