import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import {
  evaluateUseCardLease,
  publicUseCardPolicy,
  type UseCardDescriptor,
  type UseCardLeaseRequest,
} from "./use-card-policy";

type Env = { Bindings: AuthBindings };
type LeaseBody = Partial<UseCardLeaseRequest> & {
  borrower?: Partial<UseCardDescriptor>;
  source?: Partial<UseCardDescriptor>;
};

const api = new Hono<Env>();
const noStore = { "Cache-Control": "no-store" };

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function card(value: Partial<UseCardDescriptor> | undefined): UseCardDescriptor | null {
  if (!value) return null;
  const permission = clean(value.permission_class, 20).toUpperCase();
  if (!["READ", "WRITE", "EXECUTE", "DANGEROUS"].includes(permission)) return null;
  const state = clean(value.state, 20).toUpperCase();
  if (!["READY", "BORROWED", "LENT", "EXPIRING", "RETURNED", "BLOCKED"].includes(state)) return null;
  const provider = clean(value.provider_id, 120);
  const capability = clean(value.capability_id, 160);
  const cardId = clean(value.card_id, 260);
  if (!provider || !capability || !cardId) return null;
  return {
    card_id: cardId,
    slot_id: clean(value.slot_id, 160) || `slot.${provider}`,
    holder: clean(value.holder, 120) || "yellow-stone",
    tier: (clean(value.tier, 30).toUpperCase() || "WHITE") as UseCardDescriptor["tier"],
    state: state as UseCardDescriptor["state"],
    provider_id: provider,
    capability_id: capability,
    permission_class: permission as UseCardDescriptor["permission_class"],
    environment: clean(value.environment, 40) || null,
    source_surface: "SERVER_SIDE_BROKER",
    direct_source_value_exposed: false,
    lease_eligible: value.lease_eligible === true,
  };
}

api.use("/api/use-card/*", async (c, next) => {
  if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }
  await next();
});

api.get("/api/use-card/status", (c) => c.json({
  ok: true,
  system: "OGENIC_USE_CARD",
  concept: "50_IN_1_FOR_1LSS",
  policy: publicUseCardPolicy(),
  execution_authority: "YELLOW_STONE_ONLY",
  ruby_verification_required: true,
  green_retention: "VERIFIED_SUMMARY_AND_EVIDENCE_ONLY",
  schema_change: false,
}, 200, noStore));

api.post("/api/use-card/lease/evaluate", async (c) => {
  const body = await c.req.json<LeaseBody>().catch(() => ({} as LeaseBody));
  const borrower = card(body.borrower);
  const source = card(body.source);
  if (!borrower || !source) {
    return c.json({ ok: false, code: "VALID_CARD_DESCRIPTORS_REQUIRED" }, 400, noStore);
  }
  const requested = clean(body.requested_permission, 20).toUpperCase();
  if (!["READ", "WRITE", "EXECUTE", "DANGEROUS"].includes(requested)) {
    return c.json({ ok: false, code: "VALID_PERMISSION_REQUIRED" }, 400, noStore);
  }

  const decision = evaluateUseCardLease({
    borrower,
    source,
    reason: clean(body.reason, 40),
    requested_permission: requested as UseCardLeaseRequest["requested_permission"],
    requested_ttl_minutes: body.requested_ttl_minutes,
    requested_max_calls: body.requested_max_calls,
    operation: clean(body.operation, 200),
  });

  const now = Date.now();
  const borrowId = decision.allowed ? `borrow_${crypto.randomUUID()}` : null;
  return c.json({
    ok: decision.allowed,
    decision,
    lease: decision.allowed ? {
      borrow_id: borrowId,
      holder: borrower.holder,
      borrower_card_id: borrower.card_id,
      source_card_id: source.card_id,
      reason: clean(body.reason, 40).toUpperCase(),
      provider_id: source.provider_id,
      capability_id: source.capability_id,
      permission_class: decision.permission_class,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + decision.ttl_minutes * 60_000).toISOString(),
      max_calls: decision.max_calls,
      return_state: "RETURN_REQUIRED",
      evidence_state: "RUBY_PENDING",
    } : null,
    raw_values_exposed: false,
    direct_provider_bypass: false,
  }, decision.allowed ? 200 : 409, noStore);
});

export function createUseCardApi() {
  return api;
}
