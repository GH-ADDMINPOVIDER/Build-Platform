import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { evaluateUseCardLease, type UseCardDescriptor, type UseCardLeaseRequest } from "./use-card-policy";
import {
  publicCcsStatus,
  resolveWebToolkitAlias,
  transitionCcsState,
  type CcsState,
  type CcsVerb,
} from "./capability-card-stone";

type Env = { Bindings: AuthBindings };

const api = new Hono<Env>();
const noStore = { "Cache-Control": "no-store" };
const states = new Set(["ABSENT", "INSERTED", "VERIFIED", "IN_USE", "LEASED", "RETURNED", "REVOKED", "BLOCKED"]);
const verbs = new Set(["INSERT", "VERIFY", "USE", "LEASE", "RETURN", "REVOKE"]);
const cardStates = new Set(["READY", "BORROWED", "LENT", "EXPIRING", "RETURNED", "BLOCKED"]);
const permissions = new Set(["READ", "WRITE", "EXECUTE", "DANGEROUS"]);

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function state(value: unknown): CcsState {
  const next = clean(value, 20).toUpperCase();
  return (states.has(next) ? next : "ABSENT") as CcsState;
}

function verb(value: unknown): CcsVerb | null {
  const next = clean(value, 20).toUpperCase();
  return verbs.has(next) ? next as CcsVerb : null;
}

function useCard(value: unknown): UseCardDescriptor | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<UseCardDescriptor>;
  const permission = clean(item.permission_class, 20).toUpperCase();
  const currentState = clean(item.state, 20).toUpperCase();
  const cardId = clean(item.card_id, 260);
  const providerId = clean(item.provider_id, 120);
  const capabilityId = clean(item.capability_id, 160);
  if (!permissions.has(permission) || !cardStates.has(currentState)) return null;
  if (!cardId || !providerId || !capabilityId) return null;
  return {
    card_id: cardId,
    slot_id: clean(item.slot_id, 160) || `slot.${providerId}`,
    holder: clean(item.holder, 120) || "unassigned",
    tier: (clean(item.tier, 30).toUpperCase() || "WHITE") as UseCardDescriptor["tier"],
    state: currentState as UseCardDescriptor["state"],
    provider_id: providerId,
    capability_id: capabilityId,
    permission_class: permission as UseCardDescriptor["permission_class"],
    environment: clean(item.environment, 40) || null,
    source_surface: "SERVER_SIDE_BROKER",
    direct_source_value_exposed: false,
    lease_eligible: item.lease_eligible === true,
  };
}

api.use("/api/ccs/*", async (c, next) => {
  if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }
  await next();
});

api.get("/api/ccs/status", (c) => c.json(publicCcsStatus(), 200, noStore));

// Legacy God Toolkit / Control Tower names resolve to one canonical Web Toolkit card.
// This endpoint performs alias resolution only; it never executes a provider operation.
api.get("/api/ccs/resolve", (c) => {
  const requestedName = clean(c.req.query("name"), 160);
  const card = resolveWebToolkitAlias(requestedName);
  if (!card) {
    return c.json({ ok: false, code: "WEB_TOOLKIT_ALIAS_NOT_FOUND", canonical_name: "Web Toolkit", fail_closed: true }, 404, noStore);
  }
  return c.json({
    ok: true,
    canonical_card: { card_id: card.card_id, display_name: card.display_name, protocol: card.protocol, canonical: card.canonical },
    resolved_alias: requestedName,
    direct_execution_bypass: false,
    cost_guard: { mode: card.cost_guard.mode, max_paid_spend_usd: card.cost_guard.max_paid_spend_usd, paid_fallback: card.cost_guard.paid_fallback, missing_meter_adapter: card.cost_guard.missing_meter_adapter },
  }, 200, noStore);
});

api.post("/api/ccs/envelope", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ ok: false, code: "CCS_INVALID_BODY" }, 400, noStore);
  const requestedVerb = verb(body.verb);
  const cardId = clean(body.card_id, 260);
  const capability = clean(body.capability, 160);
  if (!requestedVerb || !cardId || !capability) {
    return c.json({ ok: false, code: "CCS_ENVELOPE_REQUIRED_FIELDS" }, 400, noStore);
  }

  const transition = transitionCcsState(state(body.state), requestedVerb);
  return c.json({
    ok: transition.ok,
    code: transition.code,
    protocol: "CCS/1.0",
    card: {
      card_id: cardId,
      stone_code: transition.stone_code,
      holder: clean(body.holder, 120) || "unassigned",
      role: clean(body.role, 120) || "capability_holder",
      capability,
      scope: {
        environment: null,
        permission: "READ",
      },
      state: transition.to,
    },
    action: {
      verb: transition.verb,
      from: transition.from,
      to: transition.to,
    },
    lease: requestedVerb === "LEASE" ? { state: transition.ok ? "REQUEST_POLICY_CHECK" : "DENIED" } : null,
    evidence: {
      state: transition.ok ? "PENDING" : "BLOCKED",
      verifier: "RUBY",
    },
    direct_execution_bypass: false,
  }, transition.ok ? 200 : 409, noStore);
});

api.post("/api/ccs/lease", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ ok: false, code: "CCS_INVALID_BODY" }, 400, noStore);
  const borrower = useCard(body.borrower);
  const source = useCard(body.source);
  const requestedPermission = clean(body.requested_permission, 20).toUpperCase();

  if (!borrower || !source || !permissions.has(requestedPermission)) {
    return c.json({ ok: false, code: "CCS_LEASE_REQUIRED_FIELDS" }, 400, noStore);
  }

  const decision = evaluateUseCardLease({
    borrower,
    source,
    reason: clean(body.reason, 40),
    requested_permission: requestedPermission as UseCardLeaseRequest["requested_permission"],
    requested_ttl_minutes: Number(body.requested_ttl_minutes) || undefined,
    requested_max_calls: Number(body.requested_max_calls) || undefined,
    operation: clean(body.operation, 200),
  });

  const now = Date.now();
  return c.json({
    ok: decision.allowed,
    code: decision.code,
    protocol: "CCS/1.0",
    stone_code: "YS-01",
    card: {
      holder: borrower.holder,
      source_card_id: source.card_id,
      capability: source.capability_id,
      scope: {
        permission: decision.permission_class,
        environment: source.environment,
      },
    },
    lease: decision.allowed ? {
      lease_id: `ccs_lease_${crypto.randomUUID()}`,
      reason: clean(body.reason, 40).toUpperCase(),
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + decision.ttl_minutes * 60_000).toISOString(),
      max_calls: decision.max_calls,
      return_state: "RETURN_REQUIRED",
    } : null,
    evidence: {
      state: decision.allowed ? "RUBY_PENDING" : "BLOCKED",
      verifier: "RUBY",
    },
    direct_execution_bypass: false,
  }, decision.allowed ? 200 : 409, noStore);
});

export function createCapabilityCardStoneApi() {
  return api;
}
