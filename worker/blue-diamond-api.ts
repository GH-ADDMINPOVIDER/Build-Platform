import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import {
  buildBlueDiamondRegistry,
  type BlueDiamondActor,
  type BlueDiamondRegistryEnv,
} from "./blue-diamond-registry";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type BlueDiamondBindings = AuthBindings & BlueDiamondRegistryEnv & { DB?: D1 };
type Env = { Bindings: BlueDiamondBindings };

type PermissionClass = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";
type CheckinEvent = "NEW_CHAT" | "RESUME_SESSION" | "CONTEXT_SHIFT";
type PreflightEvent = CheckinEvent | "AGENT_PRE_RUN";

type CheckinBody = {
  event?: unknown;
  intent?: unknown;
};

type PreflightBody = {
  actor_id?: unknown;
  event?: unknown;
  intent?: unknown;
  permission_class?: unknown;
  execute?: unknown;
};

const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION = "1LSS_OWNER_MAIN";
const CONTROL_POLICY = "OWNER_CONTINUITY_ATHENA_CHECKIN_AGENT_PRE_RUN";
const EXECUTION_AUTHORITY = "YELLOW_STONE_ONLY";
const permissions = new Set<PermissionClass>(["READ", "WRITE", "EXECUTE", "DANGEROUS"]);
const checkinEvents = new Set<CheckinEvent>(["NEW_CHAT", "RESUME_SESSION", "CONTEXT_SHIFT"]);
const preflightEvents = new Set<PreflightEvent>(["NEW_CHAT", "RESUME_SESSION", "CONTEXT_SHIFT", "AGENT_PRE_RUN"]);

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function permission(value: unknown): PermissionClass {
  const next = clean(value, 20).toUpperCase() as PermissionClass;
  return permissions.has(next) ? next : "READ";
}

function checkinEvent(value: unknown): CheckinEvent {
  const next = clean(value, 40).toUpperCase() as CheckinEvent;
  return checkinEvents.has(next) ? next : "NEW_CHAT";
}

function preflightEvent(value: unknown): PreflightEvent {
  const next = clean(value, 40).toUpperCase() as PreflightEvent;
  return preflightEvents.has(next) ? next : "AGENT_PRE_RUN";
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function canonicalSnapshot(db?: D1) {
  if (!db) {
    return {
      available: false,
      conversation_id: CANONICAL_CONVERSATION,
      session_line: CANONICAL_SESSION,
      latest_sequence: null as number | null,
    };
  }
  const row = await db.prepare(
    "SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1",
  ).bind(CANONICAL_CONVERSATION).first<{ last_sequence: number }>();
  const latest = row && Number.isFinite(Number(row.last_sequence)) ? Number(row.last_sequence) : null;
  return {
    available: latest !== null,
    conversation_id: CANONICAL_CONVERSATION,
    session_line: CANONICAL_SESSION,
    latest_sequence: latest,
  };
}

function safeActor(actor: BlueDiamondActor) {
  return {
    ...actor,
    auth_ref: actor.auth_ref ? "SERVER_SIDE_REFERENCE_PRESENT" : null,
  };
}

function unavailable(actor: BlueDiamondActor) {
  return actor.state === "CONFIGURATION_REQUIRED" || actor.state === "OFFLINE";
}

export function createBlueDiamondApi() {
  const api = new Hono<Env>();

  api.use("/api/blue-diamond/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/blue-diamond/registry", async (c) => {
    const canonical = await canonicalSnapshot(c.env.DB);
    const actors = buildBlueDiamondRegistry(c.env);
    return c.json({
      ok: true,
      runtime: "BLUE_DIAMOND_AGENT_COMMAND_V0_1",
      stone: 4,
      identity: "ATHENA",
      control_policy: CONTROL_POLICY,
      execution_authority: EXECUTION_AUTHORITY,
      read_before_run: true,
      max_roster: 15,
      actors: actors.map(safeActor),
      agent_count: actors.filter((actor) => actor.agent_eligible).length,
      tool_or_runtime_count: actors.filter((actor) => !actor.agent_eligible).length,
      canonical,
      policy: "NO_DIRECT_EXECUTION_BYPASS",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/blue-diamond/check-in", async (c) => {
    const body = await c.req.json<CheckinBody>().catch(() => ({} as CheckinBody));
    const event = checkinEvent(body.event);
    const canonical = await canonicalSnapshot(c.env.DB);
    if (!canonical.available) {
      return c.json({
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        missing: "owner-main / 1LSS_OWNER_MAIN context",
        canonical,
      }, 503);
    }

    const registry = buildBlueDiamondRegistry(c.env);
    const athena = registry.find((actor) => actor.actor_id === "athena-command");
    if (!athena) return c.json({ ok: false, code: "ATHENA_NOT_REGISTERED", canonical }, 503);

    const intent = clean(body.intent, 1200);
    const checkinHash = await digest(`${CANONICAL_SESSION}:${canonical.latest_sequence}:${event}:${intent}`);
    return c.json({
      ok: true,
      status: "READY_WITH_LIMITS",
      checkin_id: `bdc_${checkinHash.slice(0, 24)}`,
      event,
      controller: "chatgpt-main-controller",
      athena: safeActor(athena),
      canonical,
      control_policy: CONTROL_POLICY,
      read_before_run: true,
      reconciliation_state: "PENDING_FRESH_TOOL_READS",
      authoritative_sources: ["1LSS", "GitHub", "Linear", "runtime-evidence-as-needed"],
      fresh_verification_claimed: false,
      next: "/api/blue-diamond/preflight",
      execution_authority: EXECUTION_AUTHORITY,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/blue-diamond/preflight", async (c) => {
    const body = await c.req.json<PreflightBody>().catch(() => ({} as PreflightBody));
    const actorId = clean(body.actor_id, 120);
    const event = preflightEvent(body.event);
    const requestedPermission = permission(body.permission_class);
    const intent = clean(body.intent, 1200);
    const canonical = await canonicalSnapshot(c.env.DB);

    if (!actorId) return c.json({ ok: false, code: "ACTOR_ID_REQUIRED" }, 400);
    if (!canonical.available) {
      return c.json({
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        missing: "owner-main / 1LSS_OWNER_MAIN context",
        canonical,
      }, 503);
    }

    const registry = buildBlueDiamondRegistry(c.env);
    const actor = registry.find((candidate) => candidate.actor_id === actorId);
    if (!actor) return c.json({ ok: false, code: "ACTOR_NOT_FOUND", canonical }, 404);

    if (!actor.agent_eligible) {
      return c.json({
        ok: false,
        code: "NOT_AGENT_EXECUTABLE",
        actor: safeActor(actor),
        next: "/api/capabilities/resolve",
        execution_authority: EXECUTION_AUTHORITY,
        canonical,
      }, 422);
    }

    if (actor.actor_class === "controller") {
      if (event === "AGENT_PRE_RUN") {
        return c.json({
          ok: true,
          status: "CHECKIN_NOT_REQUIRED",
          actor: safeActor(actor),
          rule: "PRIMARY_CONTROLLER_CHECKS_IN_ONLY_ON_CONTEXT_BOUNDARY",
          required_events: [...checkinEvents],
          canonical,
          control_policy: CONTROL_POLICY,
        }, 200, { "Cache-Control": "no-store" });
      }
    } else if (event !== "AGENT_PRE_RUN") {
      return c.json({
        ok: false,
        code: "PREFLIGHT_REQUIRED",
        actor: safeActor(actor),
        required_event: "AGENT_PRE_RUN",
        read_before_run: true,
        canonical,
        control_policy: CONTROL_POLICY,
      }, 409);
    }

    if (unavailable(actor)) {
      return c.json({
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        actor: safeActor(actor),
        canonical,
      }, 503);
    }

    if (body.execute === true || requestedPermission !== "READ") {
      return c.json({
        ok: false,
        code: "HUMAN_APPROVAL_REQUIRED",
        actor: safeActor(actor),
        requested_permission: requestedPermission,
        direct_execution_rejected: true,
        yellow_stone_required: true,
        next: "/api/capabilities/resolve",
        execution_authority: EXECUTION_AUTHORITY,
        canonical,
        policy: "ATHENA_CANNOT_SELF_APPROVE_OR_BYPASS_YELLOW_STONE",
      }, 409);
    }

    const preflightHash = await digest(
      `${CANONICAL_SESSION}:${canonical.latest_sequence}:${actor.actor_id}:${event}:${requestedPermission}:${intent}`,
    );
    return c.json({
      ok: true,
      status: actor.state === "BRIDGE_ONLY" ? "READY_WITH_LIMITS" : "READY",
      preflight_id: `bdp_${preflightHash.slice(0, 24)}`,
      actor: safeActor(actor),
      event,
      requested_permission: requestedPermission,
      read_before_run: true,
      canonical,
      control_policy: CONTROL_POLICY,
      athena_required: actor.actor_id !== "chatgpt-main-controller",
      reconciliation_state: "PENDING_FRESH_TOOL_READS",
      fresh_verification_claimed: false,
      handoff_contract: "ATHENA_RECONCILE_THEN_YELLOW_STONE_RESOLVE",
      yellow_stone_required: true,
      next: "/api/capabilities/resolve",
      execution_authority: EXECUTION_AUTHORITY,
      evidence_policy: "STAMP_VERIFIED_RESULTS_ONLY_TO_1LSS",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
