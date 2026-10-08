export type AuthorityPermission = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";

export type AuthorityLease = {
  leaseId: string;
  parentLeaseId: string | null;
  providerId: string;
  capabilityId: string;
  permission: AuthorityPermission;
  environment: string | null;
  allowedEgress: string[];
  expiresAt: number;
  revoked: boolean;
};

const rank: Record<AuthorityPermission, number> = {
  READ: 1,
  WRITE: 2,
  EXECUTE: 2,
  DANGEROUS: 3,
};

function normalizedOrigins(values: string[]) {
  return [...new Set(values.map((value) => {
    try { return new URL(value).origin; } catch { return ""; }
  }).filter(Boolean))].sort();
}

export function deriveLease(
  parent: AuthorityLease,
  request: Omit<AuthorityLease, "parentLeaseId" | "revoked">,
  now: number,
) {
  if (parent.revoked || now >= parent.expiresAt) return { ok: false as const, code: "PARENT_LEASE_INACTIVE" };
  if (request.providerId !== parent.providerId) return { ok: false as const, code: "CROSS_PROVIDER_LEASE_DENIED" };
  if (request.capabilityId !== parent.capabilityId) return { ok: false as const, code: "CAPABILITY_SCOPE_MISMATCH" };
  if ((request.environment ?? "") !== (parent.environment ?? "")) {
    return { ok: false as const, code: "ENVIRONMENT_SCOPE_MISMATCH" };
  }
  if (rank[request.permission] > rank[parent.permission]) {
    return { ok: false as const, code: "PERMISSION_ESCALATION_DENIED" };
  }
  if (request.expiresAt > parent.expiresAt || request.expiresAt <= now) {
    return { ok: false as const, code: "LEASE_EXPIRY_OUT_OF_BOUNDS" };
  }
  const parentEgress = new Set(normalizedOrigins(parent.allowedEgress));
  const requestedEgress = normalizedOrigins(request.allowedEgress);
  if (requestedEgress.some((origin) => !parentEgress.has(origin))) {
    return { ok: false as const, code: "EGRESS_ESCALATION_DENIED" };
  }
  return {
    ok: true as const,
    code: "LEASE_DERIVED",
    lease: {
      ...request,
      parentLeaseId: parent.leaseId,
      allowedEgress: requestedEgress,
      revoked: false,
    } satisfies AuthorityLease,
  };
}

export function revokeLease(lease: AuthorityLease): AuthorityLease {
  return { ...lease, revoked: true };
}

export function isRevokedThroughLineage(lease: AuthorityLease, leases: Map<string, AuthorityLease>) {
  const seen = new Set<string>();
  let cursor: AuthorityLease | undefined = lease;
  while (cursor) {
    if (cursor.revoked) return true;
    if (seen.has(cursor.leaseId)) return true;
    seen.add(cursor.leaseId);
    cursor = cursor.parentLeaseId ? leases.get(cursor.parentLeaseId) : undefined;
  }
  return false;
}

export function authorizeInvocation(input: {
  lease: AuthorityLease;
  leases: Map<string, AuthorityLease>;
  providerId: string;
  capabilityId: string;
  permission: AuthorityPermission;
  environment: string | null;
  egressUrl?: string | null;
  now: number;
}) {
  const { lease } = input;
  if (isRevokedThroughLineage(lease, input.leases)) return { ok: false as const, code: "LEASE_REVOKED" };
  if (input.now >= lease.expiresAt) return { ok: false as const, code: "LEASE_EXPIRED" };
  if (input.providerId !== lease.providerId) return { ok: false as const, code: "PROVIDER_SCOPE_MISMATCH" };
  if (input.capabilityId !== lease.capabilityId) return { ok: false as const, code: "CAPABILITY_SCOPE_MISMATCH" };
  if ((input.environment ?? "") !== (lease.environment ?? "")) return { ok: false as const, code: "ENVIRONMENT_SCOPE_MISMATCH" };
  if (rank[input.permission] > rank[lease.permission]) return { ok: false as const, code: "PERMISSION_ESCALATION_DENIED" };
  if (input.egressUrl) {
    let origin = "";
    try { origin = new URL(input.egressUrl).origin; } catch { return { ok: false as const, code: "EGRESS_URL_INVALID" }; }
    if (!normalizedOrigins(lease.allowedEgress).includes(origin)) return { ok: false as const, code: "EGRESS_DENIED" };
  }
  return { ok: true as const, code: "INVOCATION_AUTHORIZED" };
}

export function brokeredCredentialReference(value: string) {
  return /^(?:vault|binding):\/\/[A-Za-z0-9._:/-]+$/.test(String(value ?? ""));
}

export function safePublicAuthorityMetadata(input: Record<string, unknown>) {
  const blocked = /(?:credential|password|private[_-]?key|access[_-]?token|api[_-]?key|secret)/i;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.test(key)));
}
