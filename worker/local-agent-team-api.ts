import { Hono } from "hono";
import { hasOwnerSession, hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { buildWhiteDiamondRegistry } from "./white-diamond-registry";

type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type LocalAgentTeamBindings = AuthBindings & {
  DB?: D1Like;
  GITHUB_TOKEN?: string;
  OPENAI_API_KEY?: string;
  OPENAI_EXECUTOR_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  XAI_API_KEY?: string;
  OPENCODE_API_KEY?: string;
  CURSOR_API_KEY?: string;
  CLINE_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
  LM_STUDIO_BASE_URL?: string;
};

type Env = { Bindings: LocalAgentTeamBindings };
type ExistingWaveDispatcher = (request: Request, env: LocalAgentTeamBindings, ctx: unknown) => Promise<Response>;
type ProofRow = { task_id?: string; event_type?: string; external_ref?: string; created_at?: string };
type TaskRow = {
  id: string;
  title: string;
  capability: string | null;
  status: string;
  priority: number;
  resource_key: string | null;
  claimed_by: string | null;
  parent_task_id: string | null;
  correlation_id: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
type EventRow = {
  id: string;
  task_id: string | null;
  event_type: string;
  actor: string;
  correlation_id: string | null;
  external_ref: string | null;
  created_at: string;
};

const ROOM = "launch";
const OWNER_SESSION = "owner-main/1LSS_OWNER_MAIN";
const MAX_SUMMARY = 800;
const TERMINAL = new Set(["DONE", "BLOCKED", "FAILED", "CANCELLED"]);
const PROVIDERS = [
  ["codex", "Codex", ["OPENAI_EXECUTOR_API_KEY", "OPENAI_API_KEY"], "GH-ADDMINT POVIDER / CODEX-TMN on OCIAN-S HOST"],
  ["claude", "Claude Code", ["ANTHROPIC_API_KEY"], "existing runner adapter pending"],
  ["gemini", "Gemini CLI", ["GEMINI_API_KEY"], "existing runner adapter pending"],
  ["grok", "Grok", ["XAI_API_KEY"], "existing runner adapter pending"],
  ["opencode", "OpenCode", ["OPENCODE_API_KEY"], "existing runner adapter pending"],
  ["cursor", "Cursor", ["CURSOR_API_KEY"], "existing runner adapter pending"],
  ["cline", "Cline", ["CLINE_API_KEY"], "existing runner adapter pending"],
  ["ollama", "Ollama", ["OLLAMA_BASE_URL"], "local endpoint; execution host must be verified"],
  ["lmstudio", "LM Studio", ["LM_STUDIO_BASE_URL"], "local endpoint; execution host must be verified"],
] as const;

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function secretLike(value: unknown) {
  return /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i.test(String(value ?? ""));
}

function safeStatus(status: string, latestEvent?: string | null) {
  if (latestEvent === "LOCAL_TEAM_APPROVAL_REQUIRED") return "ADAPTER_BINDING_REQUIRED";
  if (status === "QUEUED" || status === "CLAIMED") return "READY";
  if (status === "RUNNING" || status === "VERIFYING") return "RUNNING";
  if (status === "DONE") return "DONE";
  if (status === "FAILED") return "FAILED";
  return "BLOCKED";
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function providerReadiness(env: LocalAgentTeamBindings, proof: ProofRow | null = null) {
  const claim = proof?.event_type === "COMMAND_RESULT_DONE" && typeof proof.external_ref === "string";
  let receipt: Record<string, unknown> = {};
  try { receipt = JSON.parse(proof?.external_ref ?? "{}") as Record<string, unknown>; } catch { /* invalid receipt */ }
  const evidenced = claim &&
    /^[a-f0-9]{64}$/.test(String(receipt.result_sha256 ?? "")) &&
    /^https:\/\/github\.com\/Wave-Runner-2\/Build-Platform\/actions\/runs\/\d+$/.test(String(receipt.evidence_ref ?? ""));
  const codexAvailable = Boolean(evidenced && env.DB && env.GITHUB_TOKEN && env.OGENIC_OPS_KEY);
  return PROVIDERS.map(([id, label, keys, execution]) => {
    // Codex runs through the existing authorized execution binding under GH_ADDMIN_POVIDER, not an API key.
    if (id === "codex") return {
      id, label, configuration: evidenced ? "CLI_E2E_PREVIOUSLY_PROVEN" : "RUNTIME_PROOF_REQUIRED",
      executable_or_endpoint: "WAVE_COMMAND_CONSUMER_EXISTING",
      authentication: evidenced ? "CLI_EXISTING_LOGIN_EVIDENCED" : "UNVERIFIED",
      execution, smoke_test: evidenced ? "READONLY_E2E_PASS" : "NOT_RUN",
      dispatchable: codexAvailable, room_adapter: codexAvailable ? "CODEX_READONLY_EXISTING_WAVE" : "UNVERIFIED",
      billing: "EXISTING_CLI_SUBSCRIPTION_NO_NEW_PROVIDER_API_KEY",
      evidence: evidenced ? String(receipt.evidence_ref) : "No D1 COMMAND_RESULT_DONE receipt",
    };
    const configured = keys.every((key) => typeof env[key as keyof LocalAgentTeamBindings] === "string" && String(env[key as keyof LocalAgentTeamBindings]).trim());
    return {
      id,
      label,
      configuration: configured ? "DETECTED" : "CONFIGURATION_REQUIRED",
      executable_or_endpoint: configured ? "CONFIGURED_REFERENCE" : "NOT_DETECTED",
      authentication: configured ? "UNVERIFIED" : "MISSING",
      execution,
      smoke_test: "NOT_RUN",
      dispatchable: false,
      room_adapter: "UNVERIFIED",
      billing: "NO_PROVIDER_CALL_FROM_ROOM",
      evidence: configured ? "binding reference only; no live invocation performed" : `missing ${keys.join(" + ")}`,
    };
  });
}

async function taskById(db: D1Like, id: string) {
  return db.prepare(
    `SELECT id, title, capability, status, priority, resource_key, claimed_by,
            parent_task_id, correlation_id, source_ref, created_at, updated_at, completed_at
     FROM agent_tasks WHERE id = ? LIMIT 1`,
  ).bind(id).first<TaskRow>();
}

// Compatibility boundary WF-001. A Fabric task can never be completed, dispatched,
// or reassigned through the old Owner-only shortcuts: it must use verified Fabric APIs.
async function rejectFabricLegacyMutation(db: D1Like, taskId: string) {
  try {
    const row = await db.prepare("SELECT task_id FROM af_tasks WHERE task_id=? LIMIT 1")
      .bind(taskId).first<{task_id:string}>();
    return row ? { ok:false, code:"FABRIC_VERIFIER_ROUTE_REQUIRED",
      fabric_task_id:taskId, verified:false } : null;
  } catch (error) {
    // Before migration 0017 there are no Fabric tasks; preserve legacy behavior.
    // Any other query failure is not authorization to bypass verification.
    if (/no such table: af_tasks/i.test(String(error))) return null;
    throw error;
  }
}

async function latestEvent(db: D1Like, taskId: string) {
  return db.prepare(
    "SELECT event_type FROM agent_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(taskId).first<{ event_type: string }>();
}

function taskView(task: TaskRow, eventType?: string | null) {
  return {
    ...task,
    room: ROOM,
    owner_session: OWNER_SESSION,
    agent_state: safeStatus(task.status, eventType),
    latest_event: eventType ?? null,
    prompt: undefined,
  };
}

export function createLocalAgentTeamApi(dispatchExistingWave?: ExistingWaveDispatcher) {
  const api = new Hono<Env>();

  api.use("/api/local-agent-team/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    // Ops can inspect existing state. Only a signed Owner Session may submit changes.
    if (c.req.method !== "GET" && !(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, 401);
    }
    await next();
  });

  async function lastVerifiedCodexReceipt(db?: D1Like): Promise<ProofRow | null> {
    if (!db) return null;
    return db.prepare(
      "SELECT task_id, event_type, external_ref, created_at FROM agent_events WHERE event_type = 'COMMAND_RESULT_DONE' AND actor = 'codex-selfhost:wave-runner-01' ORDER BY created_at DESC LIMIT 1",
    ).first<ProofRow>();
  }

  api.get("/api/local-agent-team/providers", async (c) => c.json({
    ok: true,
    room: ROOM,
    providers: providerReadiness(c.env, await lastVerifiedCodexReceipt(c.env.DB)),
    execution_policy: "GH-ADDMINT POVIDER only; CODEX-TMN on OCIAN-S HOST; authorization requires a live D1 receipt",
  }, 200, { "Cache-Control": "no-store" }));

  api.get("/api/local-agent-team/state", async (c) => {
    if (!c.env.DB) {
      return c.json({ ok: true, room: ROOM, canonical_session: OWNER_SESSION, state: "CONFIGURATION_REQUIRED", missing: "D1 binding DB", agents: buildWhiteDiamondRegistry(c.env).map(({ agent_id, label, provider, state, capabilities }) => ({ agent_id, label, provider, state, capabilities })), tasks: [], events: [], providers: providerReadiness(c.env) }, 200, { "Cache-Control": "no-store" });
    }
    const [tasks, events, checkpoints, agents, codexProof] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, title, capability, status, priority, resource_key, claimed_by,
                parent_task_id, correlation_id, source_ref, created_at, updated_at, completed_at
         FROM agent_tasks WHERE resource_key LIKE 'local-agent-team:${ROOM}:%'
         ORDER BY created_at DESC LIMIT 50`,
      ).all<TaskRow>(),
      c.env.DB.prepare(
        `SELECT id, task_id, event_type, actor, correlation_id, external_ref, created_at
         FROM agent_events WHERE event_type LIKE 'LOCAL_TEAM_%'
         ORDER BY created_at DESC, id DESC LIMIT 120`,
      ).all<EventRow>(),
      c.env.DB.prepare("SELECT task_id, agent_id, checkpoint_ref, state_hash, updated_at FROM agent_checkpoints WHERE task_id LIKE 'localteam_%' ORDER BY updated_at DESC LIMIT 80").all<{ task_id: string; agent_id: string; checkpoint_ref: string; state_hash: string; updated_at: string }>(),
      Promise.resolve(buildWhiteDiamondRegistry(c.env).map(({ agent_id, label, provider, state, capabilities, runtime }) => ({ agent_id, label, provider, state, capabilities, runtime }))),
      lastVerifiedCodexReceipt(c.env.DB),
    ]);
    const eventRows = events.results ?? [];
    const eventByTask = new Map<string, string>();
    for (const event of eventRows) {
      if (event.task_id && !eventByTask.has(event.task_id)) eventByTask.set(event.task_id, event.event_type);
    }
    const taskPermissions = new Map<string, string>();
    const commandLinks = new Map<string, string>();
    const taskEvidence = new Map<string, { status: string; result_ref?: string }>();
    for (const event of eventRows) {
      if (!event.task_id) continue;
      try {
        const data = JSON.parse(event.external_ref ?? "{}") as Record<string, unknown>;
        if (event.event_type === "LOCAL_TEAM_TASK_CREATED") {
          taskPermissions.set(event.task_id, String(data.permission ?? "READ").toUpperCase());
        } else if (event.event_type === "LOCAL_TEAM_COMMAND_LINKED") {
          const id = String(data.command_task_id ?? "");
          if (/^wavecmd_[a-f0-9]{64}$/.test(id)) commandLinks.set(event.task_id, id);
        } else if (event.event_type === "LOCAL_TEAM_RESULT_VERIFIED") {
          taskEvidence.set(event.task_id, {
            status: String(data.status ?? "NOT_VERIFIED"),
            result_ref: String(data.evidence_ref ?? ""),
          });
        }
      } catch { /* malformed metadata cannot authorize dispatch */ }
    }
    const messages = eventRows.filter((event) => event.event_type === "LOCAL_TEAM_MESSAGE").map((event) => {
      let text = "";
      try { text = clean((JSON.parse(event.external_ref || "{}") as { text?: unknown }).text, MAX_SUMMARY); }
      catch { text = "[invalid message metadata]"; }
      return { id: event.id, task_id: event.task_id, actor: event.actor, text, created_at: event.created_at };
    }).reverse();
    return c.json({
      ok: true,
      room: ROOM,
      canonical_session: OWNER_SESSION,
      state: "OBSERVED",
      agents,
      providers: providerReadiness(c.env, codexProof),
      tasks: (tasks.results ?? []).map((task) => ({
        ...taskView(task, eventByTask.get(task.id)),
        permission: taskPermissions.get(task.id) || "UNKNOWN",
        command_task_id: commandLinks.get(task.id) || null,
        runtime_receipt: taskEvidence.get(task.id) || null,
      })),
      events: eventRows.map(({ external_ref, ...event }) => event),
      messages,
      checkpoints: checkpoints.results ?? [],
      storage: { canonical: "Cloudflare D1 / agent_tasks + agent_events + agent_checkpoints", local_only: false },
      recovery: "checkpoint references are stored in canonical agent_checkpoints; interrupted tasks remain inspectable and are never silently replayed",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/local-agent-team/messages", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ ok: false, code: "ORIGIN_DENIED" }, 403);
    const idempotencyKey = clean(c.req.header("Idempotency-Key"), 240);
    if (!idempotencyKey) return c.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const content = clean(body.text, MAX_SUMMARY);
    const taskId = clean(body.task_id, 100);
    if (!content || secretLike(content)) return c.json({ ok: false, code: "INVALID_OR_SECRET_LIKE_MESSAGE" }, 400);
    if (taskId) {
      const task = await taskById(c.env.DB, taskId);
      if (!task || task.capability !== "local_agent_team" || !task.resource_key?.startsWith("local-agent-team:" + ROOM + ":")) {
        return c.json({ ok: false, code: "ROOM_TASK_NOT_FOUND" }, 404);
      }
    }
    const identity = await digest(ROOM + ":message:" + idempotencyKey);
    const eventId = "event-localteam-message-" + identity;
    await c.env.DB.prepare("INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref, created_at) VALUES (?, ?, 'LOCAL_TEAM_MESSAGE', 'owner-main', ?, ?, CURRENT_TIMESTAMP)")
      .bind(eventId, taskId || null, "localteam-chat-" + identity.slice(0, 32), JSON.stringify({ room: ROOM, text: content, owner_session: OWNER_SESSION })).run();
    return c.json({ ok: true, message_id: eventId, persisted: "agent_events", canonical_session: OWNER_SESSION, provider_execution: "NOT_STARTED" }, 202, { "Cache-Control": "no-store" });
  });

  api.post("/api/local-agent-team/tasks", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const idempotencyKey = clean(c.req.header("Idempotency-Key"), 240);
    if (!idempotencyKey) return c.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const title = clean(body.title, 180);
    const description = clean(body.description ?? body.prompt, MAX_SUMMARY);
    const workspace = clean(body.workspace_ref, 180) || "workspace:staging";
    const permission = clean(body.permission, 20).toUpperCase() || "READ";
    const requestedAgent = clean(body.agent_id, 100) || null;
    if (!title || !description || !["READ", "WRITE", "EXECUTE"].includes(permission)) return c.json({ ok: false, code: "INVALID_REQUEST", message: "title, description, and permission READ|WRITE|EXECUTE are required" }, 400);
    if ([title, description, workspace, requestedAgent].some(secretLike)) return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    const identity = await digest(`${ROOM}:${idempotencyKey}`);
    const taskId = `localteam_${identity}`;
    const correlationId = `localteam-corr-${identity.slice(0, 40)}`;
    const resourceKey = `local-agent-team:${ROOM}:${workspace}`;
    const existing = await taskById(c.env.DB, taskId);
    if (existing) return c.json({ ok: true, idempotent_replay: true, task: taskView(existing), execution: { state: permission === "READ" ? "READY" : "ADAPTER_BINDING_REQUIRED" } }, 200, { "Cache-Control": "no-store" });
    await c.env.DB.prepare(
      `INSERT INTO agent_tasks(id, title, capability, status, priority, resource_key, claimed_by,
        correlation_id, source_ref, attempt_count, created_at, updated_at)
       VALUES (?, ?, 'local_agent_team', 'QUEUED', 50, ?, NULL, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).bind(taskId, title, resourceKey, correlationId, OWNER_SESSION).run();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref, created_at)
       VALUES (?, ?, 'LOCAL_TEAM_TASK_CREATED', 'owner-main', ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(`event-localteam-create-${identity}`, taskId, correlationId, JSON.stringify({ room: ROOM, workspace_ref: workspace, permission, agent_id: requestedAgent, description_sha256: await digest(description) })).run();
    const saved = await taskById(c.env.DB, taskId);
    return c.json({ ok: true, idempotent_replay: false, task: saved ? taskView(saved, "LOCAL_TEAM_TASK_CREATED") : null, execution: { state: permission === "READ" ? "READY" : "ADAPTER_BINDING_REQUIRED", provider_execution: "NOT_STARTED", receipt: null }, handoff: { next: permission === "READ" ? "SUPERVISOR_ASSIGNMENT" : "ADAPTER_BINDING_REQUIRED" } }, 202, { "Cache-Control": "no-store" });
  });


  // Local OpenBot-mode tasks reuse the same Owner-authorized WAVE command and
  // GH_ADDMIN_POVIDER Codex lane. They do not install the external OpenBot app.
  // The first operational adapter is deliberately READ-only; every other
  // provider remains non-dispatchable until a real runtime receipt exists.
  api.post("/api/local-agent-team/tasks/:taskId/dispatch", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ ok: false, code: "ORIGIN_DENIED" }, 403);
    if (!dispatchExistingWave) return c.json({ ok: false, code: "RUNTIME_ADAPTER_UNAVAILABLE" }, 503);
    const taskId = clean(c.req.param("taskId"), 100);
    const fabricConflict = await rejectFabricLegacyMutation(c.env.DB, taskId);
    if (fabricConflict) return c.json(fabricConflict, 409, { "Cache-Control": "no-store" });
    if (!/^localteam_[a-f0-9]{64}$/.test(taskId)) return c.json({ ok: false, code: "INVALID_TASK_ID" }, 400);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const agentId = clean(body.agent_id, 48);
    if (agentId !== "codex") return c.json({ ok: false, code: "RUNTIME_ADAPTER_UNAVAILABLE", agent_id: agentId }, 422);
    const task = await taskById(c.env.DB, taskId);
    if (!task || task.capability !== "local_agent_team" || !task.resource_key?.startsWith("local-agent-team:" + ROOM + ":")) {
      return c.json({ ok: false, code: "ROOM_TASK_NOT_FOUND" }, 404);
    }
    if (TERMINAL.has(task.status)) return c.json({ ok: false, code: "TASK_TERMINAL", status: task.status }, 409);
    const created = await c.env.DB.prepare(
      "SELECT external_ref FROM agent_events WHERE task_id = ? AND event_type = 'LOCAL_TEAM_TASK_CREATED' LIMIT 1",
    ).bind(taskId).first<{ external_ref?: string }>();
    let permission = "";
    try { permission = String((JSON.parse(created?.external_ref || "{}") as Record<string, unknown>).permission || ""); }
    catch { /* untrusted metadata */ }
    if (permission !== "READ") {
      return c.json({ ok: false, code: "READ_ONLY_ADAPTER_SCOPE", requested_permission: permission }, 409);
    }
    const proof = await lastVerifiedCodexReceipt(c.env.DB);
    if (!providerReadiness(c.env, proof).some((p) => p.id === "codex" && p.dispatchable === true)) {
      return c.json({ ok: false, code: "CODEX_READONLY_RUNTIME_UNVERIFIED" }, 503);
    }
    const linked = await c.env.DB.prepare(
      "SELECT external_ref FROM agent_events WHERE task_id = ? AND event_type = 'LOCAL_TEAM_COMMAND_LINKED' LIMIT 1",
    ).bind(taskId).first<{ external_ref?: string }>();
    if (linked) {
      let previous = "";
      try { previous = String((JSON.parse(linked.external_ref || "{}") as Record<string, unknown>).command_task_id || ""); }
      catch { /* refuse malformed recorded link */ }
      if (!/^wavecmd_[a-f0-9]{64}$/.test(previous)) return c.json({ ok: false, code: "INVALID_EXISTING_COMMAND_LINK" }, 409);
      return c.json({ ok: true, code: "COMMAND_ALREADY_LINKED", command_task_id: previous,
        execution: { status: "PENDING_RECEIPT", consumer_proven: false }, idempotent_replay: true }, 200);
    }

    // Stable idempotency key per room task even after browser reloads or retries.
    const hash = await digest("openbot-room-codex-readonly:" + taskId);
    const idempotencyKey = [hash.slice(0, 8), hash.slice(8, 12), "4" + hash.slice(13, 16),
      "8" + hash.slice(17, 20), hash.slice(20, 32)].join("-");
    const commandUrl = new URL(c.req.url);
    commandUrl.pathname = "/api/wave/command";
    const headers = new Headers(c.req.raw.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", idempotencyKey);
    const delegated = new Request(commandUrl.toString(), {
      method: "POST", headers,
      body: JSON.stringify({
        intent: "OGE129 READONLY PROOF: OpenBot Launch Room " + taskId + " — " + clean(task.title, 140),
        capability: "codex_selfhost", provider: "openai", mode: "read", environment: "staging",
      }),
    });
    const response = await dispatchExistingWave(delegated, c.env, c.executionCtx);
    const command = await response.json().catch(() => ({})) as {
      ok?: boolean; code?: string; task?: { id?: string }; execution?: { status?: string };
    };
    const commandId = String(command.task?.id || "");
    const recognized = ["COMMAND_DISPATCHED", "COMMAND_ALREADY_QUEUED", "COMMAND_MANUAL_DISPATCH_REQUIRED", "COMMAND_ALREADY_DONE"];
    if (!command.ok || !recognized.includes(String(command.code)) || !/^wavecmd_[a-f0-9]{64}$/.test(commandId)) {
      return c.json({ ok: false, code: command.code || "WAVE_COMMAND_FAILED",
        execution: { status: "NOT_STARTED", consumer_proven: false } }, response.status >= 400 ? response.status as 400 : 503);
    }
    const realDispatch = command.code === "COMMAND_DISPATCHED" || command.code === "COMMAND_ALREADY_QUEUED";
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref, created_at) VALUES (?, ?, 'LOCAL_TEAM_COMMAND_LINKED', 'owner-main', ?, ?, CURRENT_TIMESTAMP)",
    ).bind("event-localteam-command-" + hash, taskId, commandId,
      JSON.stringify({ command_task_id: commandId, agent_id: "codex", permission: "READ",
        dispatch_status: command.code, consumer_proven: false })).run();
    if (realDispatch) {
      await c.env.DB.prepare(
        "UPDATE agent_tasks SET status = 'RUNNING', claimed_by = 'GH_ADDMIN_POVIDER', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'QUEUED'",
      ).bind(taskId).run();
    }
    return c.json({
      ok: true, code: command.code, room_task_id: taskId, command_task_id: commandId,
      execution: { status: realDispatch ? "DISPATCHED_AWAITING_RESULT" : "AWAITING_DISPATCH", consumer_proven: false },
      completion_url: "/api/wave/command/status?task_id=" + commandId,
      billing: "EXISTING_CLI_LOGIN", canonical_session: OWNER_SESSION,
    }, 202, { "Cache-Control": "no-store" });
  });

  api.post("/api/local-agent-team/tasks/:taskId/handoff", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const taskId = clean(c.req.param("taskId"), 100);
    const fabricConflict = await rejectFabricLegacyMutation(c.env.DB, taskId);
    if (fabricConflict) return c.json(fabricConflict, 409, { "Cache-Control": "no-store" });
    const idempotencyKey = clean(c.req.header("Idempotency-Key"), 240);
    const targetAgent = clean((await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))).agent_id, 100);
    if (!idempotencyKey || !targetAgent) return c.json({ ok: false, code: "IDEMPOTENCY_KEY_AND_AGENT_REQUIRED" }, 400);
    if (secretLike(targetAgent)) return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    const task = await taskById(c.env.DB, taskId);
    if (!task) return c.json({ ok: false, code: "TASK_NOT_FOUND" }, 404);
    if (TERMINAL.has(task.status)) return c.json({ ok: false, code: "TASK_TERMINAL", status: task.status }, 409);
    const eventId = `event-localteam-handoff-${await digest(`${taskId}:${idempotencyKey}`)}`;
    if (task.capability !== "local_agent_team") return c.json({ ok: false, code: "TASK_NOT_LOCAL_AGENT_TEAM" }, 409);
    const target = buildWhiteDiamondRegistry(c.env).find((agent) => agent.agent_id === targetAgent);
    if (!target) return c.json({ ok: false, code: "AGENT_NOT_REGISTERED", agent_id: targetAgent }, 404);
    if (target.kind !== "specialist" || target.state !== "LIVE" || !target.auth_ref) {
      return c.json({ ok: false, code: "AGENT_UNAVAILABLE", agent_id: targetAgent, state: target.state, missing: "verified room runtime adapter and authenticated execution receipt" }, 409);
    }
    await c.env.DB.prepare("UPDATE agent_tasks SET claimed_by = ?, status = 'CLAIMED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('QUEUED','CLAIMED')").bind(targetAgent, taskId).run();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref, created_at)
       VALUES (?, ?, 'LOCAL_TEAM_HANDOFF_REQUESTED', 'owner-main', ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(eventId, taskId, task.correlation_id, JSON.stringify({ target_agent: targetAgent, authorization: "SIGNED_OWNER_SESSION", execution: "ADAPTER_BINDING_REQUIRED" })).run();
    const updated = await taskById(c.env.DB, taskId);
    return c.json({ ok: true, task: updated ? taskView(updated, "LOCAL_TEAM_HANDOFF_REQUESTED") : null, execution: { state: "ADAPTER_BINDING_REQUIRED", provider_execution: "NOT_STARTED", receipt: null } }, 202, { "Cache-Control": "no-store" });
  });

  api.post("/api/local-agent-team/tasks/:taskId/result", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const taskId = clean(c.req.param("taskId"), 100);
    const fabricConflict = await rejectFabricLegacyMutation(c.env.DB, taskId);
    if (fabricConflict) return c.json(fabricConflict, 409, { "Cache-Control": "no-store" });
    const idempotencyKey = clean(c.req.header("Idempotency-Key"), 240);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const status = clean(body.status, 30).toUpperCase();
    const resultRef = clean(body.result_ref, 240);
    const summary = clean(body.summary, MAX_SUMMARY);
    if (!idempotencyKey || !["DONE", "BLOCKED", "FAILED"].includes(status) || !resultRef || !summary) return c.json({ ok: false, code: "INVALID_RESULT", message: "Idempotency-Key, terminal status, result_ref, and summary are required" }, 400);
    if ([resultRef, summary].some(secretLike)) return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    const task = await taskById(c.env.DB, taskId);
    if (!task) return c.json({ ok: false, code: "TASK_NOT_FOUND" }, 404);
    if (TERMINAL.has(task.status)) return c.json({ ok: true, idempotent_replay: true, task: taskView(task) }, 200, { "Cache-Control": "no-store" });
    await c.env.DB.prepare("UPDATE agent_tasks SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, taskId).run();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref, created_at)
       VALUES (?, ?, 'LOCAL_TEAM_RESULT_RECORDED', 'owner-main', ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(`event-localteam-result-${await digest(`${taskId}:${idempotencyKey}`)}`, taskId, task.correlation_id, JSON.stringify({ result_ref: resultRef, summary_sha256: await digest(summary), status })).run();
    const saved = await taskById(c.env.DB, taskId);
    return c.json({ ok: true, idempotent_replay: false, task: saved ? taskView(saved, "LOCAL_TEAM_RESULT_RECORDED") : null, receipt: { result_ref: resultRef, status, summary_recorded: true } }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/local-agent-team/tasks/:taskId/checkpoint", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const taskId = clean(c.req.param("taskId"), 100);
    const fabricConflict = await rejectFabricLegacyMutation(c.env.DB, taskId);
    if (fabricConflict) return c.json(fabricConflict, 409, { "Cache-Control": "no-store" });
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const agentId = clean(body.agent_id, 100);
    const checkpointRef = clean(body.checkpoint_ref, 240);
    const stateHash = clean(body.state_hash, 128);
    if (!agentId || !checkpointRef || !stateHash) return c.json({ ok: false, code: "INVALID_CHECKPOINT" }, 400);
    if ([agentId, checkpointRef, stateHash].some(secretLike)) return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    const task = await taskById(c.env.DB, taskId);
    if (!task) return c.json({ ok: false, code: "TASK_NOT_FOUND" }, 404);
    await c.env.DB.prepare(
      `INSERT INTO agent_checkpoints(task_id, agent_id, checkpoint_ref, state_hash, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(task_id, agent_id) DO UPDATE SET checkpoint_ref = excluded.checkpoint_ref, state_hash = excluded.state_hash, updated_at = CURRENT_TIMESTAMP`,
    ).bind(taskId, agentId, checkpointRef, stateHash).run();
    return c.json({ ok: true, checkpoint: { task_id: taskId, agent_id: agentId, checkpoint_ref: checkpointRef, state_hash: stateHash, persisted: true } }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
