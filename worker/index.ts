import { Hono } from "hono";
import providers from "../config/providers.json";
import capabilities from "../config/capabilities.json";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

type Bindings = {
  DB?: D1Like;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  OGENIC_PHASE: string;
  OGENIC_RUNTIME: string;
  OGENIC_OPS_KEY?: string;
};

type RouteRequest = { intent?: string };
type RoutePlan = {
  provider: string;
  capability: string;
  mode: "EXECUTE_IF_BOUND" | "RUNTIME_CAPABILITY" | "APPROVAL_REQUIRED";
};

type TaskStatus =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "VERIFYING"
  | "DONE"
  | "BLOCKED"
  | "REAUTH_REQUIRED"
  | "CONFIGURATION_REQUIRED"
  | "FAILED"
  | "CANCELLED";

type OpsTaskCreateRequest = {
  title?: string;
  capability?: string;
  priority?: number;
  resource_key?: string;
  parent_task_id?: string;
  correlation_id?: string;
  linear_issue_id?: string;
  github_repo?: string;
  github_pr_number?: number;
  source_ref?: string;
};

type OpsClaimRequest = {
  agent_id?: string;
  task_id?: string;
  lock_ttl_seconds?: number;
};

type OpsEventRequest = {
  task_id?: string;
  event_type?: string;
  actor?: string;
  correlation_id?: string;
  external_ref?: string;
};

type OpsCheckpointRequest = {
  task_id?: string;
  agent_id?: string;
  checkpoint_ref?: string;
  state_hash?: string;
};

type OpsReleaseLockRequest = {
  resource_key?: string;
  agent_id?: string;
  task_id?: string;
};

const TASK_COLUMNS =
  "id, title, capability, status, priority, resource_key, claimed_by, parent_task_id, correlation_id, linear_issue_id, github_repo, github_pr_number, source_ref, attempt_count, created_at, updated_at, claimed_at, completed_at";

const TASK_STATUSES = new Set<TaskStatus>([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "VERIFYING",
  "DONE",
  "BLOCKED",
  "REAUTH_REQUIRED",
  "CONFIGURATION_REQUIRED",
  "FAILED",
  "CANCELLED",
]);

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  "DONE",
  "BLOCKED",
  "REAUTH_REQUIRED",
  "CONFIGURATION_REQUIRED",
  "FAILED",
  "CANCELLED",
]);

const EVENT_STATUS: Record<string, TaskStatus> = {
  CLAIMED: "CLAIMED",
  RUNNING: "RUNNING",
  CODE_READY: "VERIFYING",
  VERIFYING: "VERIFYING",
  CI_PASSED: "VERIFYING",
  DONE: "DONE",
  BLOCKED: "BLOCKED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  CONFIGURATION_REQUIRED: "CONFIGURATION_REQUIRED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
};

const app = new Hono<{ Bindings: Bindings }>();

const dbRequired = (db?: D1Like) =>
  db ? null : { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" };

const boundedText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const sqliteTimestamp = (date: Date) => date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function requireOpsAuth(c: Parameters<Parameters<typeof app.use>[1]>[0]) {
  const configured = String(c.env.OGENIC_OPS_KEY ?? "");
  if (!configured) {
    return c.json(
      {
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        missing: "OGENIC_OPS_KEY",
        message: "Shared-state API is installed but write/read access is disabled until the Worker secret is bound.",
      },
      503,
    );
  }

  const authorization = c.req.header("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerKey = (c.req.header("x-ogenic-ops-key") ?? "").trim();
  const supplied = bearer || headerKey;
  if (!supplied || !(await secureEqual(supplied, configured))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", provider: "ogenic_ops" }, 401);
  }
  return null;
}

async function appendAgentEvent(
  db: D1Like,
  event: { task_id?: string; event_type: string; actor: string; correlation_id?: string; external_ref?: string },
) {
  const id = makeId("evt");
  await db
    .prepare(
      "INSERT INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      event.task_id || null,
      event.event_type,
      event.actor,
      event.correlation_id || null,
      event.external_ref || null,
    )
    .run();
  return id;
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    phase: c.env.OGENIC_PHASE ?? "VI",
    runtime: c.env.OGENIC_RUNTIME ?? "cloudflare",
    database: c.env.DB ? "BOUND" : "UNBOUND",
    toolkit: "OGENIC CORE",
    toolkit_count: 1,
    providers: providers.providers.length,
    operator_harness: "Harness—Ammonite-OC-Ops",
    shared_state: c.env.DB ? "D1_BOUND" : "UNBOUND",
    ops_api_auth: c.env.OGENIC_OPS_KEY ? "BOUND" : "CONFIGURATION_REQUIRED",
  }),
);

app.get("/api/capabilities", (c) => c.json(capabilities));

app.get("/api/providers", async (c) => {
  const safeConfig = providers.providers.map(({ secret_ref: _secretRef, ...safe }) => safe);
  if (!c.env.DB) return c.json({ providers: safeConfig, state: "CONFIG_FALLBACK" });

  const bindings = await c.env.DB
    .prepare(
      "SELECT id, provider_id, environment, binding_type, status, last_checked_at, metadata_json, updated_at FROM provider_bindings ORDER BY provider_id, environment",
    )
    .all();

  return c.json({ providers: safeConfig, bindings: bindings.results ?? [], state: "D1" });
});

app.get("/api/state", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const meta = await c.env.DB!.prepare("SELECT key, value FROM system_meta ORDER BY key").all();
  return c.json({ ok: true, meta: meta.results ?? [] });
});

app.get("/api/system", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const db = c.env.DB!;

  const [toolkit, planes, commands, policies, sources] = await Promise.all([
    db.prepare(
      "SELECT id, name, phase, status, entrypoint, control_plane, runtime_provider, database_provider, secret_provider, version, metadata_json, updated_at FROM toolkits WHERE id = 'ogenic-core'",
    ).first(),
    db.prepare("SELECT id, ordinal, name, description, status, source_id, updated_at FROM system_planes ORDER BY ordinal").all(),
    db.prepare("SELECT alias, capability_id, description, enabled, source_id, updated_at FROM command_aliases WHERE enabled = 1 ORDER BY alias").all(),
    db.prepare("SELECT id, scope, rule_text, enforcement, enabled, source_id, updated_at FROM policy_rules WHERE enabled = 1 ORDER BY scope, id").all(),
    db.prepare("SELECT id, provider_id, external_id, title, canonical_url, source_kind, status, precedence, migration_status, source_last_edited_at, content_hash, metadata_json, updated_at FROM canonical_sources ORDER BY precedence, id").all(),
  ]);

  return c.json({
    ok: true,
    phase: c.env.OGENIC_PHASE ?? "VI",
    runtime: c.env.OGENIC_RUNTIME ?? "cloudflare",
    toolkit,
    planes: planes.results ?? [],
    commands: commands.results ?? [],
    policies: policies.results ?? [],
    sources: sources.results ?? [],
  });
});

app.get("/api/knowledge", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const docs = await c.env.DB!
    .prepare(
      "SELECT id, project_id, source_id, title, format, canonical, content_hash, source_last_edited_at, migrated_at, metadata_json, updated_at FROM knowledge_documents ORDER BY canonical DESC, updated_at DESC",
    )
    .all();
  return c.json({ ok: true, documents: docs.results ?? [] });
});

app.get("/api/knowledge/:id", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const id = c.req.param("id");
  const doc = await c.env.DB!
    .prepare(
      "SELECT id, project_id, source_id, title, body, format, canonical, content_hash, source_last_edited_at, migrated_at, metadata_json, updated_at FROM knowledge_documents WHERE id = ?",
    )
    .bind(id)
    .first();
  if (!doc) return c.json({ ok: false, code: "NOT_FOUND", id }, 404);
  return c.json({ ok: true, document: doc });
});

app.use("/api/ops/*", async (c, next) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const auth = await requireOpsAuth(c);
  if (auth) return auth;
  await next();
});

app.get("/api/ops/state", async (c) => {
  const db = c.env.DB!;
  await db.prepare("DELETE FROM agent_locks WHERE expires_at <= CURRENT_TIMESTAMP").run();
  const [statusCounts, locks, checkpoints, recentEvents] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) AS count FROM agent_tasks GROUP BY status ORDER BY status").all(),
    db.prepare("SELECT resource_key, task_id, owner_agent, acquired_at, expires_at FROM agent_locks ORDER BY expires_at").all(),
    db.prepare("SELECT task_id, agent_id, checkpoint_ref, state_hash, updated_at FROM agent_checkpoints ORDER BY updated_at DESC LIMIT 20").all(),
    db.prepare("SELECT id, task_id, event_type, actor, correlation_id, external_ref, created_at FROM agent_events ORDER BY created_at DESC LIMIT 50").all(),
  ]);
  return c.json({
    ok: true,
    operator_harness: "Harness—Ammonite-OC-Ops",
    shared_state_version: "v1",
    status_counts: statusCounts.results ?? [],
    locks: locks.results ?? [],
    checkpoints: checkpoints.results ?? [],
    recent_events: recentEvents.results ?? [],
  });
});

app.get("/api/ops/tasks", async (c) => {
  const db = c.env.DB!;
  const requestedStatus = boundedText(c.req.query("status"), 32).toUpperCase() as TaskStatus;
  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50;

  if (requestedStatus) {
    if (!TASK_STATUSES.has(requestedStatus)) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "unknown task status" }, 400);
    }
    const rows = await db
      .prepare(`SELECT ${TASK_COLUMNS} FROM agent_tasks WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?`)
      .bind(requestedStatus, limit)
      .all();
    return c.json({ ok: true, tasks: rows.results ?? [] });
  }

  const rows = await db
    .prepare(`SELECT ${TASK_COLUMNS} FROM agent_tasks ORDER BY updated_at DESC LIMIT ?`)
    .bind(limit)
    .all();
  return c.json({ ok: true, tasks: rows.results ?? [] });
});

app.post("/api/ops/tasks", async (c) => {
  const db = c.env.DB!;
  const body: OpsTaskCreateRequest = await c.req.json<OpsTaskCreateRequest>().catch(() => ({}));
  const title = boundedText(body.title, 160);
  if (!title) return c.json({ ok: false, code: "INVALID_REQUEST", message: "title is required" }, 400);

  const priorityNumber = Number(body.priority ?? 50);
  const priority = Number.isFinite(priorityNumber) ? Math.min(100, Math.max(0, Math.floor(priorityNumber))) : 50;
  const id = makeId("task");
  const correlationId = boundedText(body.correlation_id, 120) || makeId("corr");

  await db
    .prepare(
      "INSERT INTO agent_tasks(id, title, capability, priority, resource_key, parent_task_id, correlation_id, linear_issue_id, github_repo, github_pr_number, source_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      title,
      boundedText(body.capability, 120) || null,
      priority,
      boundedText(body.resource_key, 240) || null,
      boundedText(body.parent_task_id, 120) || null,
      correlationId,
      boundedText(body.linear_issue_id, 120) || null,
      boundedText(body.github_repo, 200) || null,
      Number.isFinite(Number(body.github_pr_number)) ? Math.floor(Number(body.github_pr_number)) : null,
      boundedText(body.source_ref, 240) || null,
    )
    .run();

  await appendAgentEvent(db, {
    task_id: id,
    event_type: "TASK_CREATED",
    actor: "Harness—Ammonite-OC-Ops",
    correlation_id: correlationId,
    external_ref: boundedText(body.source_ref, 240) || undefined,
  });

  const task = await db.prepare(`SELECT ${TASK_COLUMNS} FROM agent_tasks WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, task }, 201);
});

app.post("/api/ops/claim", async (c) => {
  const db = c.env.DB!;
  const body: OpsClaimRequest = await c.req.json<OpsClaimRequest>().catch(() => ({}));
  const agentId = boundedText(body.agent_id, 100);
  const taskId = boundedText(body.task_id, 120);
  if (!agentId) return c.json({ ok: false, code: "INVALID_REQUEST", message: "agent_id is required" }, 400);

  const ttlRaw = Number(body.lock_ttl_seconds ?? 900);
  const ttlSeconds = Number.isFinite(ttlRaw) ? Math.min(3600, Math.max(60, Math.floor(ttlRaw))) : 900;
  await db.prepare("DELETE FROM agent_locks WHERE expires_at <= CURRENT_TIMESTAMP").run();

  const claimSql = taskId
    ? `UPDATE agent_tasks
       SET status = 'CLAIMED', claimed_by = ?, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1
       WHERE id = ? AND status = 'QUEUED'
         AND (resource_key IS NULL OR NOT EXISTS (
           SELECT 1 FROM agent_locks l WHERE l.resource_key = agent_tasks.resource_key AND l.expires_at > CURRENT_TIMESTAMP
         ))
       RETURNING ${TASK_COLUMNS}`
    : `UPDATE agent_tasks
       SET status = 'CLAIMED', claimed_by = ?, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1
       WHERE id = (
         SELECT t.id FROM agent_tasks t
         WHERE t.status = 'QUEUED'
           AND (t.resource_key IS NULL OR NOT EXISTS (
             SELECT 1 FROM agent_locks l WHERE l.resource_key = t.resource_key AND l.expires_at > CURRENT_TIMESTAMP
           ))
         ORDER BY t.priority DESC, t.created_at ASC
         LIMIT 1
       ) AND status = 'QUEUED'
       RETURNING ${TASK_COLUMNS}`;

  const claimed = taskId
    ? await db.prepare(claimSql).bind(agentId, taskId).first<Record<string, unknown>>()
    : await db.prepare(claimSql).bind(agentId).first<Record<string, unknown>>();

  if (!claimed) {
    return c.json({ ok: false, code: "NO_CLAIMABLE_TASK", task_id: taskId || null }, 409);
  }

  const resourceKey = String(claimed.resource_key ?? "");
  if (resourceKey) {
    const expiresAt = sqliteTimestamp(new Date(Date.now() + ttlSeconds * 1000));
    const lock = await db
      .prepare(
        `INSERT INTO agent_locks(resource_key, task_id, owner_agent, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(resource_key) DO UPDATE SET
           task_id = excluded.task_id,
           owner_agent = excluded.owner_agent,
           acquired_at = CURRENT_TIMESTAMP,
           expires_at = excluded.expires_at
         WHERE agent_locks.expires_at <= CURRENT_TIMESTAMP
         RETURNING resource_key, task_id, owner_agent, acquired_at, expires_at`,
      )
      .bind(resourceKey, String(claimed.id), agentId, expiresAt)
      .first();

    if (!lock) {
      await db
        .prepare(
          "UPDATE agent_tasks SET status = 'QUEUED', claimed_by = NULL, claimed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'CLAIMED' AND claimed_by = ?",
        )
        .bind(String(claimed.id), agentId)
        .run();
      return c.json({ ok: false, code: "RESOURCE_LOCK_CONFLICT", resource_key: resourceKey }, 409);
    }
  }

  await appendAgentEvent(db, {
    task_id: String(claimed.id),
    event_type: "CLAIMED",
    actor: agentId,
    correlation_id: String(claimed.correlation_id ?? "") || undefined,
  });

  const task = await db.prepare(`SELECT ${TASK_COLUMNS} FROM agent_tasks WHERE id = ?`).bind(String(claimed.id)).first();
  return c.json({ ok: true, task, lock_ttl_seconds: resourceKey ? ttlSeconds : null });
});

app.get("/api/ops/events", async (c) => {
  const db = c.env.DB!;
  const taskId = boundedText(c.req.query("task_id"), 120);
  const limitRaw = Number(c.req.query("limit") ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 100;
  const rows = taskId
    ? await db
      .prepare("SELECT id, task_id, event_type, actor, correlation_id, external_ref, created_at FROM agent_events WHERE task_id = ? ORDER BY created_at DESC LIMIT ?")
      .bind(taskId, limit)
      .all()
    : await db
      .prepare("SELECT id, task_id, event_type, actor, correlation_id, external_ref, created_at FROM agent_events ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all();
  return c.json({ ok: true, events: rows.results ?? [] });
});

app.post("/api/ops/events", async (c) => {
  const db = c.env.DB!;
  const body: OpsEventRequest = await c.req.json<OpsEventRequest>().catch(() => ({}));
  const taskId = boundedText(body.task_id, 120);
  const eventType = boundedText(body.event_type, 64).toUpperCase();
  const actor = boundedText(body.actor, 100);
  if (!eventType || !actor) {
    return c.json({ ok: false, code: "INVALID_REQUEST", message: "event_type and actor are required" }, 400);
  }

  let correlationId = boundedText(body.correlation_id, 120);
  if (taskId) {
    const task = await db.prepare("SELECT id, correlation_id FROM agent_tasks WHERE id = ?").bind(taskId).first<Record<string, unknown>>();
    if (!task) return c.json({ ok: false, code: "NOT_FOUND", task_id: taskId }, 404);
    if (!correlationId) correlationId = String(task.correlation_id ?? "");
  }

  const eventId = await appendAgentEvent(db, {
    task_id: taskId || undefined,
    event_type: eventType,
    actor,
    correlation_id: correlationId || undefined,
    external_ref: boundedText(body.external_ref, 240) || undefined,
  });

  const nextStatus = EVENT_STATUS[eventType];
  if (taskId && nextStatus) {
    const completed = TERMINAL_TASK_STATUSES.has(nextStatus);
    await db
      .prepare(
        completed
          ? "UPDATE agent_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
          : "UPDATE agent_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(nextStatus, taskId)
      .run();

    if (completed) {
      await db.prepare("DELETE FROM agent_locks WHERE task_id = ?").bind(taskId).run();
    }
  }

  const task = taskId ? await db.prepare(`SELECT ${TASK_COLUMNS} FROM agent_tasks WHERE id = ?`).bind(taskId).first() : null;
  return c.json({ ok: true, event_id: eventId, task });
});

app.post("/api/ops/checkpoints", async (c) => {
  const db = c.env.DB!;
  const body: OpsCheckpointRequest = await c.req.json<OpsCheckpointRequest>().catch(() => ({}));
  const taskId = boundedText(body.task_id, 120);
  const agentId = boundedText(body.agent_id, 100);
  const checkpointRef = boundedText(body.checkpoint_ref, 300);
  const stateHash = boundedText(body.state_hash, 160);
  if (!taskId || !agentId || !checkpointRef) {
    return c.json({ ok: false, code: "INVALID_REQUEST", message: "task_id, agent_id and checkpoint_ref are required" }, 400);
  }

  const task = await db.prepare("SELECT id, correlation_id FROM agent_tasks WHERE id = ?").bind(taskId).first<Record<string, unknown>>();
  if (!task) return c.json({ ok: false, code: "NOT_FOUND", task_id: taskId }, 404);

  await db
    .prepare(
      `INSERT INTO agent_checkpoints(task_id, agent_id, checkpoint_ref, state_hash)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(task_id, agent_id) DO UPDATE SET
         checkpoint_ref = excluded.checkpoint_ref,
         state_hash = excluded.state_hash,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(taskId, agentId, checkpointRef, stateHash || null)
    .run();

  await appendAgentEvent(db, {
    task_id: taskId,
    event_type: "CHECKPOINT_SAVED",
    actor: agentId,
    correlation_id: String(task.correlation_id ?? "") || undefined,
    external_ref: checkpointRef,
  });

  const checkpoint = await db
    .prepare("SELECT task_id, agent_id, checkpoint_ref, state_hash, updated_at FROM agent_checkpoints WHERE task_id = ? AND agent_id = ?")
    .bind(taskId, agentId)
    .first();
  return c.json({ ok: true, checkpoint });
});

app.post("/api/ops/locks/release", async (c) => {
  const db = c.env.DB!;
  const body: OpsReleaseLockRequest = await c.req.json<OpsReleaseLockRequest>().catch(() => ({}));
  const resourceKey = boundedText(body.resource_key, 240);
  const agentId = boundedText(body.agent_id, 100);
  const taskId = boundedText(body.task_id, 120);
  if (!resourceKey || !agentId) {
    return c.json({ ok: false, code: "INVALID_REQUEST", message: "resource_key and agent_id are required" }, 400);
  }

  const lock = await db
    .prepare("SELECT resource_key, task_id, owner_agent, acquired_at, expires_at FROM agent_locks WHERE resource_key = ?")
    .bind(resourceKey)
    .first<Record<string, unknown>>();
  if (!lock) return c.json({ ok: true, released: false, reason: "NO_LOCK" });
  if (String(lock.owner_agent ?? "") !== agentId || (taskId && String(lock.task_id ?? "") !== taskId)) {
    return c.json({ ok: false, code: "LOCK_OWNERSHIP_MISMATCH", resource_key: resourceKey }, 409);
  }

  await db.prepare("DELETE FROM agent_locks WHERE resource_key = ? AND owner_agent = ?").bind(resourceKey, agentId).run();
  await appendAgentEvent(db, {
    task_id: String(lock.task_id ?? "") || undefined,
    event_type: "LOCK_RELEASED",
    actor: agentId,
    external_ref: resourceKey,
  });
  return c.json({ ok: true, released: true, resource_key: resourceKey });
});

function resolveRoute(intent: string): RoutePlan {
  const lowered = intent.toLowerCase();

  if (lowered.includes("production") || lowered.includes("promote")) {
    return { provider: "cloudflare", capability: "deploy_promote", mode: "APPROVAL_REQUIRED" };
  }
  if (lowered.includes("repo") || lowered.includes("github") || lowered.includes("code")) {
    return { provider: "github", capability: "code_search", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("drive") || lowered.includes("file") || lowered.includes("asset")) {
    return { provider: "google_drive", capability: "drive_scan", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("task") || lowered.includes("linear") || lowered.includes("issue")) {
    return { provider: "linear", capability: "agent_delegate", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("deploy") || lowered.includes("cloudflare") || lowered.includes("worker")) {
    return { provider: "cloudflare", capability: "deploy_preview", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("secret") || lowered.includes("identity") || lowered.includes("infisical")) {
    return { provider: "infisical", capability: "identity_health", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("notion") || lowered.includes("knowledge") || lowered.includes("context")) {
    return { provider: "cloudflare", capability: "context_load", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("document") || lowered.includes("word") || lowered.includes("pdf")) {
    return { provider: "documents", capability: "app_build", mode: "RUNTIME_CAPABILITY" };
  }
  if (lowered.includes("template")) {
    return { provider: "template_creator", capability: "app_build", mode: "RUNTIME_CAPABILITY" };
  }
  if (lowered.includes("n8n") || lowered.includes("workflow")) {
    return { provider: "n8n", capability: "workflow_run", mode: "EXECUTE_IF_BOUND" };
  }

  return { provider: "control", capability: "intent_route", mode: "RUNTIME_CAPABILITY" };
}

app.post("/api/route", async (c) => {
  const body: RouteRequest = await c.req.json<RouteRequest>().catch(() => ({} as RouteRequest));
  const intent = String(body.intent ?? "").trim();
  if (!intent) return c.json({ ok: false, code: "INVALID_REQUEST", message: "intent is required" }, 400);

  const route = resolveRoute(intent);
  let binding: Record<string, unknown> | null = null;

  if (c.env.DB && route.mode === "EXECUTE_IF_BOUND") {
    binding = await c.env.DB
      .prepare(
        "SELECT provider_id, environment, binding_type, status, last_checked_at, metadata_json FROM provider_bindings WHERE provider_id = ? ORDER BY CASE environment WHEN 'prod' THEN 0 WHEN 'migration' THEN 1 ELSE 2 END LIMIT 1",
      )
      .bind(route.provider)
      .first();
  }

  const executable = route.mode === "RUNTIME_CAPABILITY"
    ? true
    : route.mode === "APPROVAL_REQUIRED"
      ? false
      : Boolean(binding && ["verified", "configured", "active"].includes(String(binding.status ?? "")));

  return c.json({
    ok: true,
    intent,
    route,
    binding,
    executable,
    next: route.mode === "APPROVAL_REQUIRED"
      ? "EXPLICIT_APPROVAL_REQUIRED"
      : executable
        ? "READY"
        : "CAPABILITY_REQUIRED",
  });
});

app.all("/api/*", (c) => c.json({ ok: false, code: "NOT_FOUND" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
