import cardPolicy from "../config/use-card-policy.json";
import type { CapabilityDescriptor, CapabilityPermission } from "./capability-resolver";

export type UseCardState = "READY" | "BORROWED" | "LENT" | "EXPIRING" | "RETURNED" | "BLOCKED";
export type UseCardTier = "WHITE" | "BLUE" | "GOLD" | "OWNER_BREAK_GLASS";
export type UseCardLeaseReason = "RATE_LIMIT" | "QUOTA_EXHAUSTED" | "SOURCE_EXPIRED" | "SOURCE_DEGRADED";

export type UseCardDescriptor = {
  card_id: string;
  slot_id: string;
  holder: string;
  tier: UseCardTier;
  state: UseCardState;
  provider_id: string;
  capability_id: string;
  permission_class: CapabilityPermission;
  environment: string | null;
  source_surface: "SERVER_SIDE_BROKER";
  direct_source_value_exposed: false;
  lease_eligible: boolean;
};

export type UseCardLeaseRequest = {
  borrower: UseCardDescriptor;
  source: UseCardDescriptor;
  reason: UseCardLeaseReason | string;
  requested_permission: CapabilityPermission;
  requested_ttl_minutes?: number;
  requested_max_calls?: number;
  operation?: string;
};

export type UseCardLeaseDecision = {
  allowed: boolean;
  code: string;
  provider_id: string;
  capability_id: string;
  permission_class: CapabilityPermission;
  ttl_minutes: number;
  max_calls: number;
  ruby_verification_required: true;
  green_retention: "VERIFIED_SUMMARY_AND_EVIDENCE_ONLY";
  direct_provider_bypass: false;
};

const permissionRank: Record<CapabilityPermission, number> = {
  READ: 1,
  WRITE: 2,
  EXECUTE: 2,
  DANGEROUS: 3,
};

const allowedReasons = new Set<string>(cardPolicy.lease_policy.allowed_reasons);
const protectedOperation = /(prod(?:uction)?|billing|delete|destructive|secret[ _-]?reveal|d1[ _-]?schema)/i;

function safePart(value: unknown, fallback = "unknown") {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

function tierFor(permission: CapabilityPermission): UseCardTier {
  if (permission === "READ") return "WHITE";
  if (permission === "DANGEROUS") return "GOLD";
  return "BLUE";
}

function boundedInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

export function wrapCapabilityAsUseCard(
  descriptor: CapabilityDescriptor,
  holder = "yellow-stone",
): UseCardDescriptor {
  const provider = safePart(descriptor.provider_id);
  const capability = safePart(descriptor.capability_id);
  const environment = descriptor.environment ? safePart(descriptor.environment) : null;
  return {
    card_id: `card.${provider}.${capability}.${environment ?? "default"}`,
    slot_id: `slot.${provider}`,
    holder: safePart(holder, "yellow-stone"),
    tier: tierFor(descriptor.permission_class),
    state: descriptor.executable ? "READY" : "BLOCKED",
    provider_id: descriptor.provider_id,
    capability_id: descriptor.capability_id,
    permission_class: descriptor.permission_class,
    environment: descriptor.environment,
    source_surface: "SERVER_SIDE_BROKER",
    direct_source_value_exposed: false,
    lease_eligible: descriptor.executable && descriptor.permission_class !== "DANGEROUS",
  };
}

export function evaluateUseCardLease(request: UseCardLeaseRequest): UseCardLeaseDecision {
  const ttl = boundedInteger(
    request.requested_ttl_minutes,
    cardPolicy.lease_policy.default_ttl_minutes,
    cardPolicy.lease_policy.max_ttl_minutes,
  );
  const maxCalls = boundedInteger(
    request.requested_max_calls,
    cardPolicy.lease_policy.default_max_calls,
    cardPolicy.lease_policy.max_calls,
  );
  const base = {
    provider_id: request.source.provider_id,
    capability_id: request.source.capability_id,
    permission_class: request.requested_permission,
    ttl_minutes: ttl,
    max_calls: maxCalls,
    ruby_verification_required: true as const,
    green_retention: "VERIFIED_SUMMARY_AND_EVIDENCE_ONLY" as const,
    direct_provider_bypass: false as const,
  };

  if (!request.borrower.lease_eligible || !request.source.lease_eligible) {
    return { allowed: false, code: "CARD_NOT_LEASE_ELIGIBLE", ...base };
  }
  if (request.borrower.card_id === request.source.card_id) {
    return { allowed: false, code: "SOURCE_CARD_MUST_DIFFER", ...base };
  }
  if (request.borrower.provider_id !== request.source.provider_id) {
    return { allowed: false, code: "CROSS_PROVIDER_LEASE_DENIED_V1", ...base };
  }
  if (request.borrower.capability_id !== request.source.capability_id) {
    return { allowed: false, code: "CAPABILITY_SCOPE_MISMATCH", ...base };
  }
  if ((request.borrower.environment ?? "") !== (request.source.environment ?? "")) {
    return { allowed: false, code: "ENVIRONMENT_SCOPE_MISMATCH", ...base };
  }
  if (!allowedReasons.has(String(request.reason ?? "").trim().toUpperCase())) {
    return { allowed: false, code: "LEASE_REASON_NOT_ALLOWED", ...base };
  }
  if (request.requested_permission === "DANGEROUS") {
    return { allowed: false, code: "DANGEROUS_LEASE_REQUIRES_OWNER", ...base };
  }
  if (protectedOperation.test(String(request.operation ?? ""))) {
    return { allowed: false, code: "PROTECTED_OPERATION_REQUIRES_OWNER", ...base };
  }
  const requestedRank = permissionRank[request.requested_permission];
  if (
    requestedRank > permissionRank[request.borrower.permission_class] ||
    requestedRank > permissionRank[request.source.permission_class]
  ) {
    return { allowed: false, code: "PERMISSION_ESCALATION_DENIED", ...base };
  }

  return { allowed: true, code: "LEASE_ALLOWED_BY_SIGNED_POLICY", ...base };
}

export function publicUseCardPolicy() {
  return {
    schema_version: cardPolicy.schema_version,
    name: cardPolicy.name,
    wrapper: cardPolicy.wrapper,
    execution_authority: cardPolicy.execution_authority,
    canonical_session: cardPolicy.canonical_session,
    dynamic_slots: cardPolicy.dynamic_slots,
    states: cardPolicy.states,
    tiers: cardPolicy.tiers,
    lease_policy: {
      enabled: cardPolicy.lease_policy.enabled,
      owner_pre_authorized_policy: cardPolicy.lease_policy.owner_pre_authorized_policy,
      same_provider_only_v1: cardPolicy.lease_policy.same_provider_only_v1,
      cross_provider_hidden_fallback: cardPolicy.lease_policy.cross_provider_hidden_fallback,
      allowed_reasons: cardPolicy.lease_policy.allowed_reasons,
      default_ttl_minutes: cardPolicy.lease_policy.default_ttl_minutes,
      max_ttl_minutes: cardPolicy.lease_policy.max_ttl_minutes,
      default_max_calls: cardPolicy.lease_policy.default_max_calls,
      max_calls: cardPolicy.lease_policy.max_calls,
      protected_operations: cardPolicy.lease_policy.protected_operations,
      return_required: cardPolicy.lease_policy.return_required,
      ruby_verification_required: cardPolicy.lease_policy.ruby_verification_required,
    },
    source_visibility: "BROKERED_REFERENCE_ONLY",
    raw_values_exposed: false,
  };
}
