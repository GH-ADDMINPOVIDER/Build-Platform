export type CapabilityPermission = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";

export type ResolverRequest = {
  intent?: string;
  capability?: string;
  provider?: string;
  environment?: string;
  allowMigration?: boolean;
  allowOptional?: boolean;
};

export type ResolverCandidate = {
  capability_id: string;
  capability_description?: string | null;
  permission_class: CapabilityPermission;
  capability_enabled: boolean;
  provider_id: string;
  provider_status: string;
  provider_capability_enabled: boolean;
  priority: number;
  binding_id?: string | null;
  binding_type?: string | null;
  binding_status?: string | null;
  binding_environment?: string | null;
  runtime_capability?: boolean;
};

export type ResolverStatus =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "UNAVAILABLE"
  | "CONFIGURATION_REQUIRED"
  | "UNSUPPORTED";

export type CapabilityDescriptor = {
  capability_id: string;
  provider_id: string;
  permission_class: CapabilityPermission;
  provider_status: string;
  binding_id: string | null;
  binding_type: string | null;
  binding_status: string | null;
  environment: string | null;
  executable: boolean;
};

export type ResolverResult = {
  ok: boolean;
  status: ResolverStatus;
  request: {
    intent: string;
    capability: string | null;
    provider: string | null;
    environment: string | null;
  };
  descriptor?: CapabilityDescriptor;
  candidates?: CapabilityDescriptor[];
  reason?: string;
};

type ScoredCandidate = ResolverCandidate & { score: number };

const READY_BINDING_STATES = new Set(["active", "configured", "verified"]);
const BASE_PROVIDER_STATES = new Set(["active"]);

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const compact = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);

function allowedProviderStatuses(request: ResolverRequest) {
  const allowed = new Set(BASE_PROVIDER_STATES);
  if (request.allowMigration) allowed.add("migration");
  if (request.allowOptional) allowed.add("optional");
  return allowed;
}

function tokenize(intent: string) {
  return normalize(intent)
    .split(/[^a-z0-9_@.-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 32);
}

function keywordScore(candidate: ResolverCandidate, tokens: string[]) {
  if (tokens.length === 0) return 0;
  const haystack = `${candidate.capability_id} ${candidate.provider_id} ${candidate.capability_description ?? ""}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (candidate.capability_id.toLowerCase() === token) score += 80;
    else if (candidate.provider_id.toLowerCase() === token) score += 60;
    else if (haystack.includes(token)) score += 10;
  }
  return score;
}

function isBindingReady(candidate: ResolverCandidate, requestedEnvironment: string) {
  if (candidate.runtime_capability) return true;
  const bindingStatus = normalize(candidate.binding_status);
  const bindingEnvironment = normalize(candidate.binding_environment);
  if (!READY_BINDING_STATES.has(bindingStatus)) return false;
  if (!requestedEnvironment) return true;
  return bindingEnvironment === requestedEnvironment;
}

function descriptor(candidate: ResolverCandidate, requestedEnvironment: string): CapabilityDescriptor {
  const ready = isBindingReady(candidate, requestedEnvironment);
  return {
    capability_id: candidate.capability_id,
    provider_id: candidate.provider_id,
    permission_class: candidate.permission_class,
    provider_status: normalize(candidate.provider_status),
    binding_id: candidate.binding_id ?? null,
    binding_type: candidate.binding_type ?? null,
    binding_status: candidate.binding_status ?? null,
    environment: candidate.binding_environment ?? (requestedEnvironment || null),
    executable: ready,
  };
}

/**
 * Deterministic, side-effect-free resolver for Yellow Stone v1.
 *
 * The caller owns D1 reads and supplies candidates that already contain only
 * non-secret operational metadata. This function never receives credentials,
 * provider URLs, cookies, tokens, or secret references.
 */
export function resolveCapability(
  rawRequest: ResolverRequest,
  candidates: ResolverCandidate[],
): ResolverResult {
  const request: ResolverRequest = {
    intent: compact(rawRequest.intent, 1200),
    capability: compact(rawRequest.capability, 160),
    provider: compact(rawRequest.provider, 120),
    environment: compact(rawRequest.environment, 40),
    allowMigration: Boolean(rawRequest.allowMigration),
    allowOptional: Boolean(rawRequest.allowOptional),
  };

  const requestedCapability = normalize(request.capability);
  const requestedProvider = normalize(request.provider);
  const requestedEnvironment = normalize(request.environment);
  const allowedStatuses = allowedProviderStatuses(request);
  const tokens = tokenize(request.intent ?? "");

  const eligible = candidates.filter((candidate) => {
    if (!candidate.capability_enabled || !candidate.provider_capability_enabled) return false;
    if (!allowedStatuses.has(normalize(candidate.provider_status))) return false;
    if (requestedCapability && normalize(candidate.capability_id) !== requestedCapability) return false;
    if (requestedProvider && normalize(candidate.provider_id) !== requestedProvider) return false;
    return true;
  });

  if (eligible.length === 0) {
    const explicitlyRequested = Boolean(requestedCapability || requestedProvider);
    return {
      ok: false,
      status: explicitlyRequested ? "UNAVAILABLE" : "UNSUPPORTED",
      request: {
        intent: request.intent ?? "",
        capability: request.capability || null,
        provider: request.provider || null,
        environment: request.environment || null,
      },
      reason: explicitlyRequested ? "REQUESTED_CAPABILITY_OR_PROVIDER_NOT_ELIGIBLE" : "NO_ELIGIBLE_CAPABILITY",
    };
  }

  const scored: ScoredCandidate[] = eligible.map((candidate) => {
    let score = keywordScore(candidate, tokens);
    if (requestedCapability) score += 1000;
    if (requestedProvider) score += 800;
    if (isBindingReady(candidate, requestedEnvironment)) score += 200;
    score += Math.max(0, 100 - Math.min(100, Number(candidate.priority) || 100));
    return { ...candidate, score };
  });

  scored.sort((left, right) =>
    right.score - left.score ||
    left.priority - right.priority ||
    left.capability_id.localeCompare(right.capability_id) ||
    left.provider_id.localeCompare(right.provider_id) ||
    compact(left.binding_id).localeCompare(compact(right.binding_id))
  );

  const top = scored[0];
  const tied = scored.filter((candidate) => candidate.score === top.score && candidate.priority === top.priority);

  if (!requestedCapability && !requestedProvider && tied.length > 1) {
    const compactCandidates = tied.slice(0, 8).map((candidate) => descriptor(candidate, requestedEnvironment));
    return {
      ok: false,
      status: "AMBIGUOUS",
      request: {
        intent: request.intent ?? "",
        capability: null,
        provider: null,
        environment: request.environment || null,
      },
      candidates: compactCandidates,
      reason: "MULTIPLE_EQUAL_CANDIDATES",
    };
  }

  const selected = descriptor(top, requestedEnvironment);
  if (!selected.executable) {
    return {
      ok: false,
      status: "CONFIGURATION_REQUIRED",
      request: {
        intent: request.intent ?? "",
        capability: request.capability || null,
        provider: request.provider || null,
        environment: request.environment || null,
      },
      descriptor: selected,
      reason: "NO_READY_BINDING_FOR_REQUESTED_ENVIRONMENT",
    };
  }

  return {
    ok: true,
    status: "RESOLVED",
    request: {
      intent: request.intent ?? "",
      capability: request.capability || null,
      provider: request.provider || null,
      environment: request.environment || null,
    },
    descriptor: selected,
  };
}
