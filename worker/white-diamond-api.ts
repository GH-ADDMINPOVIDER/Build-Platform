import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { buildWhiteDiamondRegistry, type RegistryEnv, type WhiteDiamondAgent } from "./white-diamond-registry";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type WhiteDiamondBindings = AuthBindings & RegistryEnv & { DB?: D1 };
type Env = { Bindings: WhiteDiamondBindings };

type Mode = "SOLO" | "TEAM_3" | "TEAM_5" | "TEAM_10" | "FULL_15";
type PermissionClass = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";

type PlanBody = {
  intent?: unknown;
  mode?: unknown;
  permission_class?: unknown;
  provider?: unknown;
  capability?: unknown;
  parallel?: unknown;
  execute?: unknown;
};

type HandoffBody = PlanBody & { agent_id?: unknown };

const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION = "1LSS_OWNER_MAIN";
const MODE_SIZE: Record<Mode, number> = { SOLO: 1, TEAM_3: 3, TEAM_5: 5, TEAM_10: 10, FULL_15: 15 };
const permissions = new Set<PermissionClass>(["READ", "WRITE", "EXECUTE", "DANGEROUS"]);

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function mode(value: unknown): Mode {
  const next = clean(value, 20).toUpperCase() as Mode;
  return next in MODE_SIZE ? next : "SOLO";
}

function permission(value: unknown): PermissionClass {
  const next = clean(value, 20).toUpperCase() as PermissionClass;
  return permissions.has(next) ? next : "READ";
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function canonicalSnapshot(db?: D1) {
  if (!db) return { available: false, conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION, latest_sequence: null as number | null };
  const row = await db.prepare(
    "SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1",
  ).bind(CANONICAL_CONVERSATION).first<{ last_sequence: number }>();
  const latest = row && Number.isFinite(Number(row.last_sequence)) ? Number(row.last_sequence) : null;
  return { available: latest !== null, conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION, latest_sequence: latest };
}

function intentCapabilities(intent: string) {
  const text = intent.toLowerCase();
  const wanted = new Set<string>();
  if (/(code|repo|github|commit|test|build|typescript|javascript)/.test(text)) ["code_search", "read_file", "test", "build"].forEach((item) => wanted.add(item));
  if (/(browser|website|page|web|click|login)/.test(text)) ["app_scan", "app_verify"].forEach((item) => wanted.add(item));
  if (/(linear|issue|task)/.test(text)) wanted.add("agent_delegate");
  if (/(drive|document|notion|gmail|mail|context)/.test(text)) ["knowledge_search", "context_load"].forEach((item) => wanted.add(item));
  if (/(line|meta|facebook|instagram|n8n|workflow|connector|mcp)/.test(text)) ["provider_discover", "connector_provision"].forEach((item) => wanted.add(item));
  if (!wanted.size) wanted.add("agent_capability_map");
  return [...wanted];
}

function score(agent: WhiteDiamondAgent, wanted: string[], explicitProvider: string) {
  let value = 0;
  for (const item of wanted) if (agent.capabilities.includes(item)) value += 20;
  if (explicitProvider && agent.provider === explicitProvider) value += 100;
  if (agent.state === "LIVE") value += 8;
  if (agent.state === "DEGRADED") value += 4;
  if (agent.state === "SIMULATED") value -= 4;
  if (agent.state === "CONFIGURATION_REQUIRED" || agent.state === "OFFLINE") value -= 20;
  return value - agent.priority / 100;
}

function selectAgents(registry: WhiteDiamondAgent[], body: PlanBody) {
  const selectedMode = mode(body.mode);
  const target = MODE_SIZE[selectedMode];
  const manager = registry.find((agent) => agent.kind === "manager") || registry[0];
  if (target === 1) return { selectedMode, agents: [manager] };
  const wanted = intentCapabilities(clean(body.intent, 1200));
  const explicitProvider = clean(body.provider, 80).toLowerCase();
  const specialists = registry
    .filter((agent) => agent.agent_id !== manager.agent_id)
    .sort((a, b) => score(b, wanted, explicitProvider) - score(a, wanted, explicitProvider));
  return { selectedMode, agents: [manager, ...specialists.slice(0, target - 1)] };
}

function safeAgent(agent: WhiteDiamondAgent) {
  return { ...agent, auth_ref: agent.auth_ref ? "SERVER_SIDE_REFERENCE_PRESENT" : null };
}

async function plan(body: PlanBody, env: WhiteDiamondBindings) {
  const intent = clean(body.intent, 1200);
  if (!intent) return { status: 400 as const, body: { ok: false, code: "INTENT_REQUIRED" } };
  const requestedPermission = permission(body.permission_class);
  const requestedMode = mode(body.mode);
  const wantsParallel = body.parallel === true;
  const wantsExecution = body.execute === true;
  const context = await canonicalSnapshot(env.DB);
  if (!context.available) {
    return { status: 503 as const, body: { ok: false, code: "CONFIGURATION_REQUIRED", missing: "owner-main / 1LSS_OWNER_MAIN context", canonical: context } };
  }
  if (wantsExecution || requestedPermission !== "READ") {
    return {
      status: 409 as const,
      body: {
        ok: false,
        code: "HUMAN_APPROVAL_REQUIRED",
        yellow_stone_required: true,
        direct_execution_rejected: true,
        requested_permission: requestedPermission,
        next: "/api/capabilities/resolve",
        policy: "WHITE_DIAMOND_MAY_PLAN_BUT_CANNOT_BYPASS_OGE25_OGE26",
        canonical: context,
      },
    };
  }
  const registry = buildWhiteDiamondRegistry(env);
  const selected = selectAgents(registry, body);
  const wanted = intentCapabilities(intent);
  const runHash = await digest(`${CANONICAL_SESSION}:${context.latest_sequence}:${requestedMode}:${intent}`);
  const runId = `wd_${runHash.slice(0, 24)}`;
  const children = await Promise.all(selected.agents.map(async (agent, index) => ({
    child_id: `wdc_${(await digest(`${runId}:${agent.agent_id}:${index}`)).slice(0, 20)}`,
    agent_id: agent.agent_id,
    provider: agent.provider,
    state: agent.state,
    role: index === 0 ? "manager" : "specialist_as_tool",
    capability_match: agent.capabilities.filter((capability) => wanted.includes(capability)),
    next: agent.agent_id === "white-diamond-manager" ? "/api/capabilities/resolve" : agent.route,
    execution_authority: "YELLOW_STONE_ONLY",
  })));
  return {
    status: 200 as const,
    body: {
      ok: true,
      runtime: "WHITE_DIAMOND_COMMAND_PLANE_V1",
      plan_only: true,
      run_id: runId,
      mode: selected.selectedMode,
      requested_permission: requestedPermission,
      parallel: wantsParallel && requestedPermission === "READ",
      max_agents: 15,
      selected_agents: selected.agents.map(safeAgent),
      children,
      handoff_contract: "EXPLICIT_AGENT_ID_THEN_YELLOW_STONE_RESOLVE",
      yellow_stone_required: true,
      next: "/api/capabilities/resolve",
      canonical: context,
      evidence_policy: "STAMP_VERIFIED_RESULTS_ONLY_TO_1LSS",
    },
  };
}

export function createWhiteDiamondApi() {
  const api = new Hono<Env>();

  api.use("/api/white-diamond/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/white-diamond/registry", async (c) => {
    const canonical = await canonicalSnapshot(c.env.DB);
    return c.json({
      ok: true,
      runtime: "WHITE_DIAMOND_AGENT_REGISTRY_V1",
      agents: buildWhiteDiamondRegistry(c.env).map(safeAgent),
      modes: Object.keys(MODE_SIZE),
      max_active_specialists: 15,
      yellow_stone_required: true,
      canonical,
      policy: "NO_DIRECT_EXECUTION_BYPASS",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/white-diamond/plan", async (c) => {
    const body = await c.req.json<PlanBody>().catch(() => ({}));
    const result = await plan(body, c.env);
    return c.json(result.body, result.status, { "Cache-Control": "no-store" });
  });

  api.post("/api/white-diamond/handoff", async (c) => {
    const body = await c.req.json<HandoffBody>().catch(() => ({}));
    const agentId = clean(body.agent_id, 100);
    const requestedPermission = permission(body.permission_class);
    const registry = buildWhiteDiamondRegistry(c.env);
    const target = registry.find((agent) => agent.agent_id === agentId);
    const canonical = await canonicalSnapshot(c.env.DB);
    if (!target) return c.json({ ok: false, code: "AGENT_NOT_FOUND" }, 404);
    if (!canonical.available) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "1LSS canonical context", canonical }, 503);
    if (requestedPermission !== "READ" || body.execute === true) {
      return c.json({ ok: false, code: "HUMAN_APPROVAL_REQUIRED", direct_execution_rejected: true, yellow_stone_required: true, agent: safeAgent(target), next: "/api/capabilities/resolve", canonical }, 409);
    }
    if (["CONFIGURATION_REQUIRED", "OFFLINE"].includes(target.state)) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", agent: safeAgent(target), canonical, fallback_agent_id: target.fallback_agent_id }, 503);
    }
    const ref = `wdh_${(await digest(`${CANONICAL_SESSION}:${canonical.latest_sequence}:${target.agent_id}:${clean(body.intent, 1200)}`)).slice(0, 24)}`;
    return c.json({
      ok: true,
      handoff_id: ref,
      plan_only: true,
      agent: safeAgent(target),
      yellow_stone_required: true,
      next: "/api/capabilities/resolve",
      canonical,
      policy: "EXPLICIT_HANDOFF_NO_DIRECT_PROVIDER_EXECUTION",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
