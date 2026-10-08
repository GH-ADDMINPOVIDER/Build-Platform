export type EffectOutcome = "pending" | "committed" | "unknown" | "not_committed" | "compensated";
export type EffectFailureClass = "proven_pre_effect" | "ambiguous" | "post_effect" | "policy_denied";

export type OperationInput = {
  capability: string;
  provider: string;
  target: string;
  scope: string;
  artifactIdentity: string;
  args: unknown;
};

export type ApprovalBinding = {
  operationId: string;
  envelopeDigest: string;
  argsDigest: string;
  capability: string;
  provider: string;
  target: string;
  scope: string;
  artifactIdentity: string;
  expiresAt: number;
  authorizationVersion: string;
  resourceVersion: string | null;
  revoked: boolean;
};

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(sortValue(value));
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function operationIdentity(input: OperationInput) {
  const digest = await sha256Hex(canonicalJson({
    capability: input.capability,
    provider: input.provider,
    target: input.target,
    scope: input.scope,
    artifactIdentity: input.artifactIdentity,
    args: input.args,
  }));
  return `op_${digest}`;
}

export async function bindApproval(input: OperationInput & {
  expiresAt: number;
  authorizationVersion: string;
  resourceVersion?: string | null;
}): Promise<ApprovalBinding> {
  const operationId = await operationIdentity(input);
  const argsDigest = await sha256Hex(canonicalJson(input.args));
  const envelopeDigest = await sha256Hex(canonicalJson({
    operationId,
    argsDigest,
    capability: input.capability,
    provider: input.provider,
    target: input.target,
    scope: input.scope,
    artifactIdentity: input.artifactIdentity,
    expiresAt: input.expiresAt,
    authorizationVersion: input.authorizationVersion,
    resourceVersion: input.resourceVersion ?? null,
  }));
  return {
    operationId,
    envelopeDigest,
    argsDigest,
    capability: input.capability,
    provider: input.provider,
    target: input.target,
    scope: input.scope,
    artifactIdentity: input.artifactIdentity,
    expiresAt: input.expiresAt,
    authorizationVersion: input.authorizationVersion,
    resourceVersion: input.resourceVersion ?? null,
    revoked: false,
  };
}

export async function verifyApprovalForExecution(
  approval: ApprovalBinding,
  actual: OperationInput & {
    now: number;
    authorizationVersion: string;
    resourceVersion?: string | null;
  },
) {
  if (approval.revoked) return { ok: false as const, code: "APPROVAL_REVOKED" };
  if (actual.now >= approval.expiresAt) return { ok: false as const, code: "APPROVAL_EXPIRED" };
  if (actual.authorizationVersion !== approval.authorizationVersion) {
    return { ok: false as const, code: "AUTHORIZATION_VERSION_CHANGED" };
  }
  if ((actual.resourceVersion ?? null) !== approval.resourceVersion) {
    return { ok: false as const, code: "RESOURCE_VERSION_CHANGED" };
  }
  const rebound = await bindApproval({
    ...actual,
    expiresAt: approval.expiresAt,
    authorizationVersion: approval.authorizationVersion,
    resourceVersion: approval.resourceVersion,
  });
  if (rebound.envelopeDigest !== approval.envelopeDigest || rebound.operationId !== approval.operationId) {
    return { ok: false as const, code: "APPROVAL_EXECUTION_MISMATCH" };
  }
  return { ok: true as const, code: "APPROVAL_BOUND" };
}

const transitions: Record<EffectOutcome, EffectOutcome[]> = {
  pending: ["committed", "unknown", "not_committed"],
  committed: ["compensated"],
  unknown: ["committed", "not_committed"],
  not_committed: ["pending"],
  compensated: [],
};

export function transitionOutcome(current: EffectOutcome, next: EffectOutcome) {
  return transitions[current].includes(next)
    ? { ok: true as const, outcome: next }
    : { ok: false as const, code: "INVALID_EFFECT_TRANSITION", outcome: current };
}

export function retryDecision(input: {
  outcome: EffectOutcome;
  failureClass: EffectFailureClass;
  attempt: number;
  budget: number;
}) {
  if (input.outcome === "unknown") return { retry: false as const, code: "UNKNOWN_REQUIRES_RECONCILIATION" };
  if (input.outcome === "committed" || input.outcome === "compensated") {
    return { retry: false as const, code: "EFFECT_ALREADY_OBSERVED" };
  }
  if (input.failureClass !== "proven_pre_effect" || input.outcome !== "not_committed") {
    return { retry: false as const, code: "FAILURE_NOT_PROVEN_PRE_EFFECT" };
  }
  if (input.attempt >= input.budget) return { retry: false as const, code: "RETRY_BUDGET_EXHAUSTED" };
  return { retry: true as const, code: "BOUNDED_PRE_EFFECT_RETRY" };
}

export function writeFence(expectedResourceVersion: string | null, currentResourceVersion: string | null) {
  return expectedResourceVersion === currentResourceVersion
    ? { ok: true as const, code: "WRITE_FENCE_MATCH" }
    : { ok: false as const, code: "STALE_WRITER_REJECTED" };
}
