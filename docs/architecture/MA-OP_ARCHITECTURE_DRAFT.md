# MA-OP — Multi-Agent Operations Protocol Architecture Draft

Status: architecture draft for canonical staging
Issue: OGE-41
Repository: Ogenicchocolate21debug/Build-Platform
Branch: phase-vi-provider-incentive-metering

> MA-OP does not replace integrations; it operates across them.

## 1. Purpose

MA-OP is a provider-neutral operations protocol and control layer for WAVE/OGENIC. It normalizes how authorized Agents and runtimes discover, select, invoke, verify, and retain the outcome of capabilities exposed through existing integration methods.

Third-party systems do not need native MA-OP support. MA-OP consumes their existing programmable interfaces through adapters.

Supported interface families include:
- MCP
- official SDKs
- REST/OpenAPI
- GraphQL
- Webhooks
- OAuth/service accounts
- CLI
- Agent APIs

The protocol must work for one Agent and scale to multiple Agents without making multi-agent orchestration a prerequisite.

## 2. Canonical WAVE invariants

Canonical evidence on this branch establishes these boundaries:

- Green / 1LSS is the canonical retained state. Current canonical conversation/session are `owner-main / 1LSS_OWNER_MAIN`.
- Blue Diamond / ATHENA performs admission, check-in, actor eligibility and read-before-run controls.
- Yellow Stone is the sole execution authority. Existing guarded routes include `/api/capabilities/resolve`, `/api/capabilities/execute` and `/api/wave/command`.
- Violet Stone performs orchestration, team formation, delegation and merge coordination. Current modes are SOLO, TEAM_3, TEAM_5, TEAM_10 and FULL_15.
- Ruby Stone is the verification layer and must distinguish PASS, FAIL, BLOCKED and NOT_MEASURED rather than fabricating success.
- Knowledge Refinery may distill verified outcomes, but retention is gated by provenance and Ruby verification.
- Raw secrets never enter prompts, Agent-visible tool arguments/results, 1LSS, D1, or ordinary logs.
- No adapter may bypass Yellow to execute a side effect.

## 3. System context and planes

```text
Agent / WAVE / Automation
          |
          v
     MA-OP Control Plane
  Actor / Intent / Readiness
  Policy / Cost / Approval
  Routing / Evidence / State
          |
          v
      Adapter Boundary
 MCP | SDK | REST | GraphQL
 Webhook | OAuth | CLI | Agent API
          |
          v
   Native Provider / Runtime
          |
          v
       Evidence Result
          |
          v
       Ruby Verify
          |
          v
      Green / 1LSS
```

### Control Plane

The control plane owns:
- actor identity and role
- capability registry
- credential references
- readiness
- intent normalization
- policy
- cost/quota state
- routing
- approval requirements
- idempotency
- evidence requirements
- verification state
- retention decision

### Data Plane

The data plane consists of native adapter execution:
- MCP server/client calls
- SDK calls
- REST/OpenAPI requests
- GraphQL requests
- webhook delivery/ingress
- OAuth/service-account token exchange handled server-side
- CLI invocation
- Agent API calls

Adapters translate between MA-OP contracts and native interfaces. They do not own policy, approval, canonical memory, or secrets.

## 4. Protocol lifecycle

Canonical lifecycle:

```text
DISCOVER
  -> ADMIT
  -> CHECK_READINESS
  -> CHECK_COST
  -> CHECK_POLICY
  -> SELECT_ROUTE
  -> APPROVE_IF_REQUIRED
  -> OPERATE
  -> VERIFY
  -> RETAIN
```

No stage may silently skip a previous control stage when the requested permission class or policy requires it.

## 5. Core building blocks

MA-OP defines the following core building blocks.

### Actor

Represents an Agent, controller, worker, human, or authorized system participant.

Required fields:
- actor_id
- actor_class
- role
- provider
- runtime
- capabilities
- availability_state

### Capability

A normalized operation an actor may request.

Required fields:
- capability_id
- provider_id
- permission_class
- input_schema
- output_schema
- adapter_id
- evidence_required
- supported_environment

### CredentialRef

A server-side reference to authentication material.

Required metadata:
- credential_ref
- provider_id
- owner/environment
- scopes
- expiry if known
- rotation state if known

Raw credential values are never part of the MA-OP envelope.

### Readiness

A measured or explicitly unknown readiness state.

Possible values should include:
- VERIFIED
- DEGRADED
- CONFIGURATION_REQUIRED
- OFFLINE
- NOT_MEASURED

Unknown quota/billing/readiness must remain unknown rather than being promoted to READY.

### Intent

Normalized statement of requested outcome.

### Policy

Decision inputs and result for:
- permission
- environment
- owner restrictions
- cost
- network/runtime requirements
- side-effect class
- retention

### Cost / Quota

Safe usage/capacity metadata. Missing telemetry is NOT_MEASURED, not zero.

### Task

A uniquely identified operation with actor, capability, input, environment, idempotency key and lifecycle state.

### Approval

An explicit authorization envelope for WRITE, EXECUTE or DANGEROUS actions where Yellow requires owner/HITL approval.

### Evidence

Verifiable references describing what actually happened. Evidence is not equivalent to a model claim.

### State / Retention

Verified outcome retained into the canonical Green/1LSS state only after required verification succeeds.

## 6. Core contracts

Illustrative TypeScript contracts:

```ts
export type PermissionClass = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";

export type ReadinessState =
  | "VERIFIED"
  | "DEGRADED"
  | "CONFIGURATION_REQUIRED"
  | "OFFLINE"
  | "NOT_MEASURED";

export interface MaopActor {
  actorId: string;
  actorClass: "controller" | "agent" | "worker" | "human" | "service";
  role: string;
  provider: string;
  runtime: string;
  capabilities: string[];
  readiness: ReadinessState;
}

export interface MaopCapability {
  capabilityId: string;
  providerId: string;
  adapterId: string;
  permissionClass: PermissionClass;
  environment: "staging" | "production" | string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  evidenceRequired: boolean;
}

export interface MaopCredentialRef {
  ref: string;
  providerId: string;
  scopes: string[];
  environment: string;
  expiresAt?: string;
  rotationState?: "CURRENT" | "ROTATE_SOON" | "EXPIRED" | "NOT_MEASURED";
}

export interface MaopTask {
  taskId: string;
  actorId: string;
  capabilityId: string;
  intent: string;
  input: unknown;
  environment: string;
  idempotencyKey: string;
  requestedPermission: PermissionClass;
}

export interface MaopEvidence {
  evidenceId: string;
  providerId: string;
  capabilityId: string;
  actorId: string;
  sourceRef: string;
  createdAt: string;
  digest?: string;
  verificationState: "verified" | "partially_verified" | "unverified" | "blocked" | "failed";
}

export interface MaopResult<T = unknown> {
  ok: boolean;
  taskId: string;
  capabilityId: string;
  providerId: string;
  actorId: string;
  permissionClass: PermissionClass;
  output?: T;
  safeError?: {
    code: string;
    message?: string;
  };
  evidence: MaopEvidence[];
  retentionEligible: boolean;
}
```

Illustrative capability wrapper:

```json
{
  "id": "github.file.read",
  "provider": "github",
  "role": "repo_read",
  "capability": "read_file",
  "permission": "READ",
  "cost_mode": "FREE_OR_INCLUDED",
  "auth_ref": "vault://github/main",
  "evidence_required": true,
  "input_schema": {},
  "output_schema": {}
}
```

## 7. Adapter boundary and normalization

Every adapter implements a narrow translation contract.

```ts
export interface MaopAdapter<I = unknown, O = unknown> {
  id: string;
  interfaceFamily:
    | "mcp"
    | "sdk"
    | "rest"
    | "graphql"
    | "webhook"
    | "oauth"
    | "cli"
    | "agent_api";

  discover?(context: AdapterContext): Promise<MaopCapability[]>;
  readiness(context: AdapterContext): Promise<ReadinessReport>;
  execute(request: AdapterRequest<I>, context: AdapterContext): Promise<AdapterResult<O>>;
}
```

Adapter rules:
1. Accept only normalized MA-OP capability requests.
2. Resolve credentials server-side using CredentialRef.
3. Reject unsupported permission classes.
4. Never self-approve.
5. Never write directly to Green/1LSS.
6. Return structured evidence and safe errors.
7. Treat provider-native success as unverified until Ruby or an equivalent configured verifier accepts the evidence.
8. Fail closed when Yellow policy context is absent.

## 8. Credential Vault / Broker model

MA-OP does not implement home-grown cryptography.

The broker layer points to existing proven secret storage, including the current server-side secret-manager pattern.

Agents receive only:
- credential_ref
- provider
- scopes
- environment
- expiry/rotation metadata when known

They never receive:
- API keys
- access tokens
- cookies
- passwords
- MFA secrets
- signing secrets

OAuth-first is preferred for normal product UX. BYOK is an advanced mode.

## 9. Lifecycle and state machine

Suggested task states:

```text
DISCOVERED
ADMITTED
READINESS_CHECKED
COST_CHECKED
POLICY_CHECKED
ROUTED
WAITING_APPROVAL
APPROVED
RUNNING
VERIFYING
VERIFIED
RETAINED

terminal:
BLOCKED
FAILED
CANCELED
```

Rules:
- READ may auto-run only when current Yellow policy permits it.
- WRITE / EXECUTE / DANGEROUS actions require the deterministic Yellow approval path defined for the capability.
- An idempotency key must prevent duplicate side effects.
- Retry behavior must distinguish replay-safe reads from consequential writes.
- Verification failure prevents RETAINED.
- NOT_MEASURED never upgrades itself to VERIFIED.

## 10. Version negotiation and idempotency

Protocol envelope includes:
- protocol_version
- capability_version
- adapter_version

Version selection:
1. caller provides supported MA-OP range
2. runtime intersects with adapter-supported range
3. no overlap -> VERSION_UNSUPPORTED
4. compatible version is pinned for the task

Idempotency:
- every task has a stable idempotency key
- adapters that support provider-native idempotency forward a derived key
- MA-OP stores/reuses result references for safe replay
- duplicate consequential calls must not be re-executed without an explicit policy-approved retry

## 11. Compatibility matrix

| Interface family | MA-OP role | Native support required from third party? |
|---|---|---|
| MCP | capability discovery/call adapter | No |
| Official SDK | typed native adapter | No |
| REST/OpenAPI | HTTP adapter + schema normalization | No |
| GraphQL | query/mutation adapter | No |
| Webhook | event ingress/egress adapter | No |
| OAuth/service account | credential broker | No |
| CLI | bounded worker adapter | No |
| Agent API | interactive/autonomous actor adapter | No |

WAVE mapping:
- Blue/ATHENA -> ADMIT / actor readiness
- Yellow -> CHECK_POLICY / APPROVE / OPERATE authority
- Violet -> SELECT_ROUTE / multi-agent coordination
- Ruby -> VERIFY
- Green/1LSS -> RETAIN
- Knowledge Refinery -> provenance-aware distillation of verified outcomes

## 12. Threat model

MA-OP must explicitly defend against:

### Credential leakage
Mitigation: CredentialRef only; server-side resolution; redaction and deny-list tests.

### Confused deputy
Mitigation: bind actor, capability, permission, environment and approval to one task envelope.

### Privilege escalation
Mitigation: capability-specific permission classes; Yellow-only authority; fail closed on missing policy.

### Replay
Mitigation: idempotency keys, replay detection and provider-native idempotency where available.

### Tool spoofing
Mitigation: registered capability IDs, adapter identity and signed/digested evidence where appropriate.

### Poisoned schemas or descriptions
Mitigation: capability allowlists, schema validation and no executable instructions from provider descriptions.

### SSRF / webhook abuse
Mitigation: host allowlists, URL validation, bounded redirect policy and authenticated webhook verification.

### Prompt injection through tool outputs
Mitigation: tool output is untrusted data; structured normalization; no direct promotion to instruction authority.

### Cost runaway
Mitigation: CHECK_COST stage, quota/budget state, task bounds, no automatic paid fallback.

### Stale readiness
Mitigation: timestamped readiness with TTL; NOT_MEASURED on missing telemetry.

### Evidence forgery
Mitigation: provider references, digests, canonical CI/runtime references and Ruby verification.

### Adapter supply-chain risk
Mitigation: pinned versions, reviewable adapters, conformance tests and least privilege.

## 13. Multi-agent semantics

MA-OP supports single-agent and multi-agent operation.

For multi-agent runs:
- Violet selects team/mode.
- each delegated task carries actor_id and capability scope
- agents cannot inherit broader permissions than the parent task
- parallel results are independently evidenced
- merge is a distinct step
- Ruby verifies the merged outcome before Green retention

The protocol does not treat ordinary tools, CLIs, Docker workers or GitHub itself as Agents.

## 14. Conformance strategy

A conforming MA-OP adapter must pass tests for:

1. capability registration
2. exact input schema validation
3. unsupported input rejection
4. permission-class enforcement
5. Yellow policy requirement
6. direct-provider bypass prevention
7. server-side credential handling
8. secret redaction
9. idempotency/replay behavior
10. safe normalized errors
11. evidence normalization
12. Ruby verification gate
13. retention gating
14. unload/cleanup lifecycle where applicable

Conformance levels:

- L0 Contract: schema and normalization only
- L1 Read: safe READ capability with evidence
- L2 Controlled Side Effect: approved WRITE/EXECUTE path
- L3 Multi-Agent: delegated tasks + merge evidence
- L4 Operational: readiness, cost, audit, verification and retention under production policy

## 15. Proposed module tree

```text
packages/
  maop-core/
    src/contracts.ts
    src/lifecycle.ts
    src/policy.ts
    src/evidence.ts
    src/idempotency.ts
  maop-adapters/
    mcp/
    rest/
    sdk/
    webhook/
    cli/
    agent-api/
  maop-conformance/
    fixtures/
    tests/
  maop-reference-runtime/
    src/runtime.ts

docs/
  architecture/
    MA-OP_ARCHITECTURE_DRAFT.md
```

This is a target structure; package creation is a later implementation slice and is not implied by this architecture-only issue.

## 16. MVP proof plan

Smallest useful build slice:

1. Define protocol contracts and JSON schemas.
2. Implement a no-op/reference adapter.
3. Implement one READ-only GitHub capability wrapper using the existing Yellow execution boundary rather than a second GitHub connector.
4. Add conformance tests for direct-provider bypass, credential redaction, evidence normalization and Ruby-before-Green retention.
5. Demonstrate five interface families with fixtures or local zero-cost paths: MCP, REST/OpenAPI, SDK, Webhook and CLI.
6. Keep all proof staging/local; no paid provider call is required.

The first live bridge candidate is the OGE-43 GitHub capability plugin for DeepSeek Harness.

## 17. Evidence and retention

Provider output is not automatically canonical truth.

Required flow:

```text
Native result
  -> normalized MA-OP result
  -> evidence references
  -> Ruby verification
  -> retention decision
  -> Green / owner-main / 1LSS_OWNER_MAIN
```

A failed or blocked verification result remains evidence but is not retained as a verified operational fact.

## 18. Open questions

- Which MA-OP contracts should be protocol-stable versus WAVE-internal extensions?
- Which evidence types require cryptographic digests versus provider IDs/URLs?
- What readiness TTL is appropriate per provider/interface family?
- Which operations are safe for automatic retry?
- How should adapter version deprecation be surfaced to routing?
- Which cost/quota fields can be normalized without inventing provider semantics?
- What minimum metadata is required before external implementations can claim conformance?

## 19. Acceptance

This draft is complete when:
- protocol primitives and lifecycle are defined
- control/data plane separation is explicit
- adapter and credential boundaries are explicit
- WAVE Blue/Yellow/Violet/Ruby/Green mapping is documented
- compatibility with existing integration families is defined without requiring native MA-OP support
- threat model and conformance strategy are documented
- the next implementation slice is bounded
- no runtime implementation, production mutation, Candy work, D1 schema change, secret mutation or paid readiness call is introduced by this document
