import { Hono } from "hono";
import pstackFullCatalog from "../config/pstack-full-catalog.json";
import { selectPstackSkillStack, planSkillLearning } from "./violet-pstack-selector";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { buildWhiteDiamondRegistry, type RegistryEnv, type WhiteDiamondAgent } from "./white-diamond-registry";
import { buildBlueDiamondRegistry } from "./blue-diamond-registry";
import { planVioletDistribution, type DistributionInput, type ActiveClaim } from "./violet-distribution-planner";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<{meta?:{changes?:number};success?:boolean}>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type VioletStoneBindings = AuthBindings & RegistryEnv & { DB?: D1 };
type Env = { Bindings: VioletStoneBindings };

type VioletStatus = "queued" | "planning" | "running" | "waiting_approval" | "blocked" | "failed" | "completed" | "canceled";
type VioletMode = "SOLO" | "TEAM_3" | "TEAM_5" | "TEAM_10" | "FULL_15";
type Strategy = "parallel" | "sequential";
type PermissionClass = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";

type VioletIdentity = {
  agent_id: string;
  source_agent_id: string;
  app: "OpenAI" | "Codex" | "Manus";
  rank: "CEO" | "CTO" | "COO";
  position: "BRAIN" | "LEFT_ARM" | "RIGHT_ARM";
  aliases: string[];
  capabilities: string[];
  availability_state: string;
  runtime: string;
};

type TaskRow = {
  id: string;
  capability?: string | null;
  status: string;
  claimed_by?: string | null;
  attempt_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  claimed_at?: string | null;
  completed_at?: string | null;
};

type EventRow = {
  event_type: string;
  actor: string;
  created_at?: string | null;
};

type LaneRow = {
  id: string;
  display_name: string;
  provider: string;
  role: string;
  execution_mode: string;
  status: string;
  current_task_id?: string | null;
  last_heartbeat_at?: string | null;
  updated_at?: string | null;
};

type PlanBody = {
  intent?: unknown;
  mode?: unknown;
  strategy?: unknown;
  permission_class?: unknown;
};

type HandoffBody = PlanBody & {
  run_id?: unknown;
  agent_id?: unknown;
  capability?: unknown;
  provider?: unknown;
  execute?: unknown;
};

type MergeResult = {
  agent_id?: unknown;
  status?: unknown;
  summary?: unknown;
  evidence_ref?: unknown;
  verified?: unknown;
};

type MergeBody = { run_id?: unknown; results?: unknown };

const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION = "1LSS_OWNER_MAIN";
const MODE_SIZE: Record<VioletMode, number> = { SOLO: 1, TEAM_3: 3, TEAM_5: 5, TEAM_10: 10, FULL_15: 15 };
const PERMISSIONS = new Set<PermissionClass>(["READ", "WRITE", "EXECUTE", "DANGEROUS"]);

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function mode(value: unknown): VioletMode {
  const next = clean(value, 20).toUpperCase() as VioletMode;
  return next in MODE_SIZE ? next : "TEAM_3";
}

function strategy(value: unknown): Strategy {
  return clean(value, 20).toLowerCase() === "sequential" ? "sequential" : "parallel";
}

function permission(value: unknown): PermissionClass {
  const next = clean(value, 20).toUpperCase() as PermissionClass;
  return PERMISSIONS.has(next) ? next : "READ";
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function canonicalSnapshot(db?: D1) {
  if (!db) return { available: false, conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION, latest_sequence: null as number | null };
  const row = await db.prepare("SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1")
    .bind(CANONICAL_CONVERSATION)
    .first<{ last_sequence: number }>();
  const latest = row && Number.isFinite(Number(row.last_sequence)) ? Number(row.last_sequence) : null;
  return { available: latest !== null, conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION, latest_sequence: latest };
}

function source(registry: WhiteDiamondAgent[], id: string) {
  return registry.find((agent) => agent.agent_id === id);
}

export function buildVioletAgentRegistry(env: VioletStoneBindings): VioletIdentity[] {
  const white = buildWhiteDiamondRegistry(env);
  const manager = source(white, "white-diamond-manager");
  const codex = source(white, "codex-left-arm");
  const manus = source(white, "manus-specialist");
  const identities: VioletIdentity[] = [];
  if (manager) identities.push({
    agent_id: "openai-ceo",
    source_agent_id: manager.agent_id,
    app: "OpenAI",
    rank: "CEO",
    position: "BRAIN",
    aliases: ["openai-ceo", "white-diamond-manager", "openai", "manager"],
    capabilities: manager.capabilities,
    availability_state: manager.state,
    runtime: manager.runtime,
  });
  if (codex) identities.push({
    agent_id: "codex-cto",
    source_agent_id: codex.agent_id,
    app: "Codex",
    rank: "CTO",
    position: "LEFT_ARM",
    aliases: ["codex-cto", "codex-left-arm", "codex"],
    capabilities: codex.capabilities,
    availability_state: codex.state,
    runtime: codex.runtime,
  });
  if (manus) identities.push({
    agent_id: "manus-coo",
    source_agent_id: manus.agent_id,
    app: "Manus",
    rank: "COO",
    position: "RIGHT_ARM",
    aliases: ["manus-coo", "manus-specialist", "manus"],
    capabilities: manus.capabilities,
    availability_state: manus.state,
    runtime: manus.runtime,
  });
  return identities;
}

function canonicalAgentId(value: unknown, agents: VioletIdentity[]) {
  const key = clean(value, 120).toLowerCase();
  for (const agent of agents) {
    if (agent.aliases.some((alias) => alias.toLowerCase() === key)) return agent.agent_id;
  }
  return null;
}

function statusFromTask(status: unknown): VioletStatus {
  const value = clean(status, 40).toUpperCase();
  if (value === "RUNNING" || value === "VERIFYING") return "running";
  if (value === "CLAIMED") return "planning";
  if (value === "DONE") return "completed";
  if (value === "FAILED") return "failed";
  if (value === "CANCELLED") return "canceled";
  if (value === "BLOCKED" || value === "REAUTH_REQUIRED" || value === "CONFIGURATION_REQUIRED") return "blocked";
  return "queued";
}

function availabilityFallback(state: string): VioletStatus {
  return state === "CONFIGURATION_REQUIRED" || state === "OFFLINE" ? "blocked" : "queued";
}

function eventStatus(eventType: string): VioletStatus | null {
  const event = clean(eventType, 80).toUpperCase();
  if (event.includes("APPROVAL_REQUIRED")) return "waiting_approval";
  if (event === "RUNNING") return "running";
  if (event === "FAILED") return "failed";
  if (event === "BLOCKED" || event === "REAUTH_REQUIRED" || event === "CONFIGURATION_REQUIRED") return "blocked";
  if (event === "DONE") return "completed";
  return null;
}

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const normalize = (value: string) => /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const a = Date.parse(normalize(start));
  const b = Date.parse(normalize(end));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 1000;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

async function telemetry(db: D1 | undefined, agents: VioletIdentity[]) {
  if (!db) return { agents: agents.map((agent) => emptyAgentTelemetry(agent)), executors: [], evidence: "D1_UNAVAILABLE" };
  const [taskResult, eventResult, laneResult] = await Promise.all([
    db.prepare("SELECT id, capability, status, claimed_by, attempt_count, created_at, updated_at, claimed_at, completed_at FROM agent_tasks ORDER BY updated_at DESC LIMIT 250").all<TaskRow>(),
    db.prepare("SELECT event_type, actor, created_at FROM agent_events ORDER BY created_at DESC LIMIT 500").all<EventRow>(),
    db.prepare("SELECT id, display_name, provider, role, execution_mode, status, current_task_id, last_heartbeat_at, updated_at FROM agent_lanes ORDER BY priority DESC, updated_at DESC").all<LaneRow>(),
  ]);
  const tasks = taskResult.results ?? [];
  const events = eventResult.results ?? [];
  const lanes = laneResult.results ?? [];
  const rows = agents.map((agent) => {
    const ownTasks = tasks.filter((task) => canonicalAgentId(task.claimed_by, agents) === agent.agent_id);
    const ownEvents = events.filter((event) => canonicalAgentId(event.actor, agents) === agent.agent_id);
    const completed = ownTasks.filter((task) => task.status === "DONE").length;
    const failed = ownTasks.filter((task) => task.status === "FAILED").length;
    const blocked = ownTasks.filter((task) => ["BLOCKED", "REAUTH_REQUIRED", "CONFIGURATION_REQUIRED"].includes(task.status)).length;
    const terminal = completed + failed + blocked;
    const durations = ownTasks.map((task) => secondsBetween(task.claimed_at || task.created_at, task.completed_at || task.updated_at)).filter((value): value is number => value !== null);
    const pass = ownEvents.filter((event) => event.event_type === "RUBY_EVAL_PASS").length;
    const fail = ownEvents.filter((event) => event.event_type === "RUBY_EVAL_FAIL").length;
    const samples = pass + fail;
    const capabilityUsage: Record<string, number> = {};
    for (const task of ownTasks) {
      const capability = clean(task.capability, 120);
      if (capability) capabilityUsage[capability] = (capabilityUsage[capability] || 0) + 1;
    }
    const recentEventState = ownEvents.map((event) => eventStatus(event.event_type)).find(Boolean) || null;
    const recentTaskState = ownTasks.length ? statusFromTask(ownTasks[0].status) : null;
    return {
      ...agent,
      visible_identity: `${agent.app} • Agent • ${agent.rank}`,
      status: recentEventState || recentTaskState || availabilityFallback(agent.availability_state),
      stats: {
        jobs_assigned: ownTasks.length,
        completed,
        failed,
        blocked,
        success_rate: terminal ? Number(((completed / terminal) * 100).toFixed(1)) : null,
        accuracy: samples ? Number(((pass / samples) * 100).toFixed(1)) : null,
        accuracy_state: samples ? "MEASURED" : "NOT_MEASURED",
        accuracy_sample_size: samples,
        average_duration_seconds: durations.length ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1)) : null,
        median_duration_seconds: durations.length ? Number((median(durations) || 0).toFixed(1)) : null,
        approval_waits: ownEvents.filter((event) => event.event_type.includes("APPROVAL_REQUIRED")).length,
        retries: ownTasks.reduce((sum, task) => sum + Math.max(0, Number(task.attempt_count || 0) - 1), 0),
        handoffs: ownEvents.filter((event) => /HANDOFF|DELEGAT/.test(event.event_type)).length,
        verified_outcomes: ownEvents.filter((event) => /VERIFIED|CI_PASSED|RUBY_EVAL_PASS/.test(event.event_type)).length,
        capability_usage: capabilityUsage,
      },
    };
  });
  return {
    agents: rows,
    executors: lanes.map((lane) => ({ ...lane, kind: "EXECUTOR_RUNTIME", agent: false })),
    evidence: "D1_AGENT_TASKS_EVENTS_LANES",
  };
}

function emptyAgentTelemetry(agent: VioletIdentity) {
  return {
    ...agent,
    visible_identity: `${agent.app} • Agent • ${agent.rank}`,
    status: availabilityFallback(agent.availability_state),
    stats: {
      jobs_assigned: 0, completed: 0, failed: 0, blocked: 0, success_rate: null,
      accuracy: null, accuracy_state: "NOT_MEASURED", accuracy_sample_size: 0,
      average_duration_seconds: null, median_duration_seconds: null,
      approval_waits: 0, retries: 0, handoffs: 0, verified_outcomes: 0, capability_usage: {},
    },
  };
}

function unavailable(agent: VioletIdentity) {
  return agent.availability_state === "CONFIGURATION_REQUIRED" || agent.availability_state === "OFFLINE";
}

function rankSpecialists(intent: string, specialists: VioletIdentity[]) {
  const lower = intent.toLowerCase();
  const codeIntent = /(code|repo|github|commit|test|build|typescript|javascript|deploy)/.test(lower);
  const opsIntent = /(operate|operation|delegate|handoff|research|plan|long|workflow|project|task)/.test(lower);
  return [...specialists].sort((a, b) => {
    const score = (agent: VioletIdentity) => {
      if (agent.agent_id === "codex-cto") return codeIntent ? 20 : 5;
      if (agent.agent_id === "manus-coo") return opsIntent ? 20 : 4;
      return 0;
    };
    return score(b) - score(a);
  });
}

export async function buildVioletPlan(body: PlanBody, env: VioletStoneBindings) {
  const intent = clean(body.intent, 1600);
  if (!intent) return { status: 400 as const, body: { ok: false, code: "INTENT_REQUIRED" } };
  const requestedPermission = permission(body.permission_class);
  const selectedMode = mode(body.mode);
  const selectedStrategy = strategy(body.strategy);
  const canonical = await canonicalSnapshot(env.DB);
  if (!canonical.available) return { status: 503 as const, body: { ok: false, code: "CONFIGURATION_REQUIRED", missing: "owner-main / 1LSS_OWNER_MAIN", canonical } };
  const registry = buildVioletAgentRegistry(env);
  const ceo = registry.find((agent) => agent.agent_id === "openai-ceo");
  if (!ceo || unavailable(ceo)) return { status: 503 as const, body: { ok: false, code: "PRIMARY_AGENT_UNAVAILABLE", agent: ceo || null, canonical } };
  const requestedSize = MODE_SIZE[selectedMode];
  const availableSpecialists = rankSpecialists(intent, registry.filter((agent) => agent.agent_id !== ceo.agent_id && !unavailable(agent)));
  const team = [ceo, ...availableSpecialists.slice(0, Math.max(0, requestedSize - 1))];
  const runHash = await digest(`${CANONICAL_SESSION}:${canonical.latest_sequence}:${selectedMode}:${selectedStrategy}:${intent}`);
  const runId = `violet_${runHash.slice(0, 24)}`;
  const teamId = `team_${runHash.slice(24, 40)}`;
  const nodes: Array<Record<string, unknown>> = [{
    node_id: `${runId}:plan`,
    agent_id: ceo.agent_id,
    role: "plan",
    status: "queued",
    depends_on: [],
    execution_authority: "YELLOW_STONE_ONLY",
  }];
  const specialistNodes: string[] = [];
  team.slice(1).forEach((agent, index) => {
    const nodeId = `${runId}:agent:${agent.agent_id}`;
    specialistNodes.push(nodeId);
    nodes.push({
      node_id: nodeId,
      agent_id: agent.agent_id,
      role: "specialist",
      status: "queued",
      depends_on: selectedStrategy === "parallel" ? [`${runId}:plan`] : [index === 0 ? `${runId}:plan` : specialistNodes[index - 1]],
      execution_authority: "YELLOW_STONE_ONLY",
    });
  });
  nodes.push({
    node_id: `${runId}:merge`,
    agent_id: ceo.agent_id,
    role: "merge_verified_results",
    status: "queued",
    depends_on: specialistNodes.length ? specialistNodes : [`${runId}:plan`],
    execution_authority: "YELLOW_STONE_ONLY",
  });
  return {
    status: 200 as const,
    body: {
      ok: true,
      runtime: "VIOLET_STONE_ORCHESTRATOR_V1",
      run_id: runId,
      team_id: teamId,
      mode: selectedMode,
      strategy: selectedStrategy,
      requested_size: requestedSize,
      formed_size: team.length,
      coverage_limited: team.length < requestedSize,
      team: team.map((agent) => ({ ...agent, visible_identity: `${agent.app} • Agent • ${agent.rank}`, status: "queued" as VioletStatus })),
      graph: nodes,
      requested_permission: requestedPermission,
      yellow_stone_required: true,
      direct_execution_bypass: false,
      handoff_route: "/api/violet/handoff",
      merge_route: "/api/violet/merge",
      canonical,
      pstack_skill_stack:selectPstackSkillStack(intent,pstackFullCatalog.skills),
      pstack_source_full_text_loaded:false,
      skill_execution_state:"NOT_DISPATCHED",
    },
  };
}

function createHandoff(body: HandoffBody, agents: VioletIdentity[]) {
  const agentId = canonicalAgentId(body.agent_id, agents);
  const target = agents.find((agent) => agent.agent_id === agentId);
  if (!target) return { status: 404 as const, body: { ok: false, code: "AGENT_NOT_FOUND" } };
  if (unavailable(target)) return { status: 503 as const, body: { ok: false, code: "AGENT_UNAVAILABLE", agent: { ...target, visible_identity: `${target.app} • Agent • ${target.rank}` } } };
  const requestedPermission = permission(body.permission_class);
  const executeRequested = body.execute === true;
  const envelope = {
    run_id: clean(body.run_id, 120) || null,
    agent: { ...target, visible_identity: `${target.app} • Agent • ${target.rank}` },
    status: requestedPermission === "READ" && !executeRequested ? "planning" : "waiting_approval",
    intent: clean(body.intent, 1600),
    capability: clean(body.capability, 160) || undefined,
    provider: clean(body.provider, 120) || undefined,
    environment: "staging",
    yellow_stone_route: "/api/capabilities/execute",
    execution_authority: "YELLOW_STONE_ONLY",
    direct_execution_bypass: false,
    pstack_skill_stack:selectPstackSkillStack(clean(body.intent,1600),pstackFullCatalog.skills),
    full_skill_source_read_by_provider:false,
  };
  if (requestedPermission !== "READ" || executeRequested) {
    return { status: 409 as const, body: { ok: false, code: "HUMAN_APPROVAL_REQUIRED", handoff: envelope } };
  }
  return { status: 200 as const, body: { ok: true, code: "READY_FOR_YELLOW_STONE", handoff: envelope } };
}

function merge(body: MergeBody, agents: VioletIdentity[]) {
  const runId = clean(body.run_id, 120);
  if (!runId) return { status: 400 as const, body: { ok: false, code: "RUN_ID_REQUIRED" } };
  const raw = Array.isArray(body.results) ? body.results as MergeResult[] : [];
  if (!raw.length) return { status: 400 as const, body: { ok: false, code: "RESULTS_REQUIRED" } };
  const normalized = raw.map((result) => {
    const agentId = canonicalAgentId(result.agent_id, agents);
    return {
      agent_id: agentId,
      status: clean(result.status, 40).toLowerCase(),
      summary: clean(result.summary, 1200),
      evidence_ref: clean(result.evidence_ref, 500),
      verified: result.verified === true,
    };
  });
  if (normalized.some((result) => !result.agent_id)) return { status: 400 as const, body: { ok: false, code: "UNKNOWN_AGENT_RESULT" } };
  const verified = normalized.filter((result) => result.verified && result.evidence_ref);
  const failed = normalized.filter((result) => result.status === "failed" || result.status === "blocked");
  const state = failed.length ? "blocked" : verified.length === normalized.length ? "completed" : "running";
  return {
    status: 200 as const,
    body: {
      ok: true,
      runtime: "VIOLET_STONE_EVIDENCE_MERGE_V1",
      run_id: runId,
      status: state,
      result_count: normalized.length,
      verified_count: verified.length,
      unverified_count: normalized.length - verified.length,
      evidence: verified.map((result) => ({ agent_id: result.agent_id, evidence_ref: result.evidence_ref, summary: result.summary })),
      synthesis: verified.map((result) => result.summary).filter(Boolean).join("\n") || null,
      accuracy_policy: "RUBY_EVIDENCE_ONLY",
      direct_execution_bypass: false,
    },
  };
}

export function createVioletStoneApi() {
  const api = new Hono<Env>();

  api.use("/api/violet/*", async (c, next) => {
    if (c.req.path === "/api/violet/health") return next();
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    await next();
  });

  api.get("/api/violet/health", (c) => c.json({
    ok: true,
    stone: "VIOLET_STONE",
    runtime: "VIOLET_STONE_ORCHESTRATOR_V1",
    authority: "YELLOW_STONE_ONLY",
    canonical_memory: "GREEN_STONE_1LSS",
    admission: "BLUE_DIAMOND_ATHENA",
    agents: ["OpenAI • Agent • CEO", "Codex • Agent • CTO", "Manus • Agent • COO"],
    accuracy_policy: "NOT_MEASURED_UNTIL_RUBY_EVIDENCE",
    schema_change: false,
  }, 200, { "Cache-Control": "no-store" }));

  // OGE-110: complete portable skill SOURCE catalog; Violet owns workflow selection.
  // This is not provider execution: Yellow alone authorizes calls, Ruby independently verifies.
  api.get("/api/violet/pstack/catalog", (c) => c.json({
    ok: true,
    controller: "VIOLET_STONE_04",
    authority: "YELLOW_STONE_ONLY",
    source_pin: pstackFullCatalog.pin_commit,
    upstream: pstackFullCatalog.upstream,
    skill_count: pstackFullCatalog.skill_count,
    agent_definition_count: pstackFullCatalog.agent_definition_count,
    source_installed: pstackFullCatalog.vendor_complete,
    execution_state: "NOT_DISPATCHED",
    automation_state: "INERT_SOURCE_ONLY",
    canonical_memory: "owner-main / 1LSS_OWNER_MAIN",
    skills: pstackFullCatalog.skills.map((item) => ({
      id: item.id,
      description: item.description,
      path: item.agent_skill_path,
      state: "SOURCE_AVAILABLE_NOT_RUNTIME_VERIFIED",
    })),
  }, 200, { "Cache-Control": "no-store" }));


  // Read-only task-to-skill router; never dispatches or certifies provider knowledge.
  api.post("/api/violet/pstack/select", async (c) => {
    const body=await c.req.json<{task?:unknown}>().catch(()=>null);
    const selected=selectPstackSkillStack(body?.task,pstackFullCatalog.skills);
    if(!selected.ok)return c.json(selected,400,{ "Cache-Control":"no-store" });
    const candidates=buildBlueDiamondRegistry(c.env).filter(a=>a.agent_eligible &&
      a.actor_class==="execution_agent" && a.maturity==="PROVEN" &&
      a.capabilities.includes(selected.capability));
    return c.json({...selected,controller:"VIOLET_STONE_04",
      blue_agents:candidates.map(a=>({id:a.actor_id,provider:a.provider,readiness:a.state,
        eligible_for_live_preflight:a.state==="LIVE",automatic_dispatch:false})),
      execution_authority:"YELLOW_STONE_ONLY",independent_verifier:"RUBY_STONE",
      green_memory:"owner-main / 1LSS_OWNER_MAIN",prior_context_loaded:false,
      planning_only:true},200,{ "Cache-Control":"no-store" });
  });
  // A bounded 51/51 syllabus is not evidence that any model has read it.
  api.get("/api/violet/pstack/learning-plan", (c) => c.json({
    ok:true,...planSkillLearning(pstackFullCatalog.skills),
    source_pin:pstackFullCatalog.pin_commit,
    controller:"VIOLET_STONE_04",execution_authority:"YELLOW_STONE_ONLY",
    required_real_agent_receipt:"SESSION_ID_SOURCE_HASHES_AND_INDEPENDENT_RUBY_PROOF",
    agents:buildBlueDiamondRegistry(c.env).filter(a=>a.agent_eligible).map(a=>({
      id:a.actor_id,provider:a.provider,readiness:a.state,maturity:a.maturity,
      read_state:"NOT_VERIFIED",dispatch_state:"NOT_DISPATCHED",
    })),
    canonical_memory:"owner-main / 1LSS_OWNER_MAIN",
  },200,{ "Cache-Control":"no-store" }));

  api.get("/api/violet/status", async (c) => {
    const agents = buildVioletAgentRegistry(c.env);
    const canonical = await canonicalSnapshot(c.env.DB);
    const live = await telemetry(c.env.DB, agents);
    return c.json({
      ok: true,
      runtime: "VIOLET_STONE_TELEMETRY_V1",
      canonical,
      ...live,
      policy: "AGENTS_INTERACTIVE_EXECUTORS_SEPARATE_YELLOW_AUTHORITY_ONLY",
    }, 200, { "Cache-Control": "no-store" });
  });

  // Violet owns team selection. Blue owns identities; Yellow alone can authorize execution.
  // Planning is read-only against existing canonical D1 task occupancy.
  api.get("/api/violet/distribution/roster", (c) => {
    const actors = buildBlueDiamondRegistry(c.env);
    return c.json({
      ok: true,
      controller: "VIOLET_STONE_04",
      source_registry: "BLUE_DIAMOND_03",
      agents: actors.filter((actor) => actor.agent_eligible).map((actor) => ({
        agent_id: actor.actor_id,
        label: actor.label,
        provider: actor.provider,
        actor_class: actor.actor_class,
        maturity: actor.maturity,
        readiness: actor.state,
        capabilities: actor.capabilities,
        planning_eligible: actor.actor_class === "execution_agent" &&
          actor.maturity === "PROVEN" && Boolean(actor.auth_ref) &&
          (actor.state === "LIVE" || actor.state === "DEGRADED"),
      })),
      execution_authority: "YELLOW_STONE_ONLY",
      planning_only: true,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/violet/distribution/plan", async (c) => {
    const request = await c.req.json<DistributionInput>().catch(() => ({} as DistributionInput));
    const canonical = await canonicalSnapshot(c.env.DB);
    if (!canonical.available) {
      return c.json({ok:false,code:"CANONICAL_1LSS_REQUIRED",canonical},503);
    }
    let claims: ActiveClaim[] = [];
    try {
      if (!c.env.DB) throw new Error("D1_UNAVAILABLE");
      const rows = await c.env.DB.prepare(
        "SELECT claimed_by, status FROM agent_tasks WHERE status IN ('QUEUED','CLAIMED','RUNNING','VERIFYING') LIMIT 501",
      ).all<ActiveClaim>();
      claims = rows.results ?? [];
      if (claims.length >= 501) return c.json({ok:false,code:"ACTIVE_TASK_SCAN_LIMIT"},503);
    } catch {
      return c.json({ok:false,code:"ACTIVE_TASK_READ_FAILED"},503);
    }
    const result = planVioletDistribution(request, buildBlueDiamondRegistry(c.env), claims, true);
    return c.json({...result, canonical}, result.http_status, { "Cache-Control": "no-store" });
  });

  // Metadata-only reservation of EXISTING queued work. Never executes a provider/tool.
  // Conditional D1 update atomically prevents two competing Violet assignments.
  api.post("/api/violet/distribution/claim", async (c) => {
    const body = await c.req.json<{
      task_id?: string; agent_id?: string;
    }>().catch(() => ({ } as { task_id?: string; agent_id?: string }));
    const taskId = clean(body.task_id, 80);
    const agentId = clean(body.agent_id, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(taskId) ||
        !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(agentId)) {
      return c.json({ok:false,code:"INVALID_CLAIM_ID"},400);
    }
    if (!c.env.DB) return c.json({ok:false,code:"D1_REQUIRED"},503);
    const canonical = await canonicalSnapshot(c.env.DB);
    if (!canonical.available) return c.json({ok:false,code:"CANONICAL_1LSS_REQUIRED"},503);
    try {
      const task = await c.env.DB.prepare(
        "SELECT id, capability, status, claimed_by, resource_key FROM agent_tasks WHERE id = ? LIMIT 1",
      ).bind(taskId).first<{id:string;capability:string|null;status:string;claimed_by:string|null;resource_key:string|null}>();
      if (!task) return c.json({ok:false,code:"TASK_NOT_FOUND"},404);
      if (task.status === "CLAIMED" && task.claimed_by === agentId)
        return c.json({ok:true,replayed:true,task_id:taskId,agent_id:agentId,
          status:"CLAIMED",execution_dispatched:false,execution_authority:"YELLOW_STONE_ONLY"},200);
      if (task.status !== "QUEUED")
        return c.json({ok:false,code:"TASK_NOT_QUEUED",status:task.status},409);
      const roster = buildBlueDiamondRegistry(c.env);
      const agent = roster.find((a) => a.actor_id === agentId);
      const active = await c.env.DB.prepare(
        "SELECT claimed_by, status FROM agent_tasks WHERE status IN ('QUEUED','CLAIMED','RUNNING','VERIFYING') LIMIT 501",
      ).all<ActiveClaim>();
      if ((active.results || []).length >= 501) return c.json({ok:false,code:"ACTIVE_TASK_SCAN_LIMIT"},503);
      const planned = planVioletDistribution({
        tasks:[{task_id:taskId,capability:task.capability || "",preferred_agent_id:agentId}],
        max_parallel:1,
      },roster,active.results||[],true);
      if (!planned.ok || planned.assignments.length !== 1)
        return c.json({ok:false,code:"NOT_ELIGIBLE_FOR_VIOLET_CLAIM",reason:planned.ok?planned.queue[0]?.status:planned.code},409);
      // DEGRADED is not verified LIVE; require Blue preflight before a persistent claim.
      if (!agent || agent.state !== "LIVE")
        return c.json({ok:false,code:"BLUE_LIVE_PREFLIGHT_REQUIRED",
          next:"/api/blue-diamond/preflight"},409);
      const outcome = await c.env.DB.prepare(
        `UPDATE agent_tasks
         SET status = 'CLAIMED', claimed_by = ?, claimed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1
         WHERE id = ? AND status = 'QUEUED' AND claimed_by IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM agent_tasks AS other
             WHERE other.id <> ? AND other.claimed_by = ?
               AND other.status IN ('CLAIMED','RUNNING','VERIFYING')
           )
           AND NOT EXISTS (
             SELECT 1 FROM agent_tasks AS other
             WHERE other.id <> ? AND ? IS NOT NULL
               AND other.resource_key = ?
               AND other.status IN ('CLAIMED','RUNNING','VERIFYING')
           )`,
      ).bind(agentId,taskId,taskId,agentId,taskId,task.resource_key,task.resource_key).run();
      if (outcome.meta?.changes !== 1)
        return c.json({ok:false,code:"CLAIM_CONFLICT_RETRY_WITH_FRESH_PLAN"},409);
      const eventId = "violet-claim-" + await digest(taskId + ":" + agentId);
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO agent_events(id,task_id,event_type,actor,external_ref,created_at)
         VALUES(?,?,'VIOLET_CLAIM_PENDING_YELLOW',?,'YELLOW_APPROVAL_REQUIRED',CURRENT_TIMESTAMP)`,
      ).bind(eventId,taskId,agentId).run();
      return c.json({ok:true,replayed:false,task_id:taskId,agent_id:agentId,
        status:"CLAIMED",execution_dispatched:false,
        yellow_stone_required:true,execution_authority:"YELLOW_STONE_ONLY",
        next:"/api/capabilities/execute",ruby_verification:"PENDING",
        canonical},200,{"Cache-Control":"no-store"});
    } catch {
      return c.json({ok:false,code:"D1_CLAIM_UNVERIFIED"},503);
    }
  });

  api.post("/api/violet/plan", async (c) => {
    const body = await c.req.json<PlanBody>().catch(() => ({} as PlanBody));
    const result = await buildVioletPlan(body, c.env);
    return c.json(result.body, result.status, { "Cache-Control": "no-store" });
  });

  api.post("/api/violet/handoff", async (c) => {
    const body = await c.req.json<HandoffBody>().catch(() => ({} as HandoffBody));
    const result = createHandoff(body, buildVioletAgentRegistry(c.env));
    return c.json(result.body, result.status, { "Cache-Control": "no-store" });
  });

  api.post("/api/violet/merge", async (c) => {
    const body = await c.req.json<MergeBody>().catch(() => ({} as MergeBody));
    const result = merge(body, buildVioletAgentRegistry(c.env));
    return c.json(result.body, result.status, { "Cache-Control": "no-store" });
  });

  return api;
}
