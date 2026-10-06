import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type TaskInboxBindings = AuthBindings & {
  DB?: D1Like;
};

type Env = { Bindings: TaskInboxBindings };
type AssignBody = {
  title?: unknown;
  origin_session_ref?: unknown;
  target_session_ref?: unknown;
  priority?: unknown;
};
type ResultBody = {
  session_ref?: unknown;
  status?: unknown;
  result_ref?: unknown;
  summary?: unknown;
};

type SessionRow = { id: string; session_ref: string };
type TaskRow = {
  id: string;
  title: string;
  capability: string | null;
  status: string;
  priority: number;
  resource_key: string | null;
  claimed_by: string | null;
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

const CONVERSATION_ID = "owner-main";
const SESSION_PREFIX = "1lss-session:";
const TERMINAL = new Set(["DONE", "BLOCKED", "FAILED"]);
const RESULT_STATES = new Set(["DONE", "BLOCKED", "FAILED"]);

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function secretLike(value: unknown) {
  return /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i.test(String(value ?? ""));
}

function safePriority(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 50;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function taskIdentity(idempotencyKey: string) {
  const digest = await sha256Hex(`${CONVERSATION_ID}:task-inbox:${idempotencyKey}`);
  return {
    task_id: `taskinbox_${digest}`,
    correlation_id: `taskinbox-corr-${digest.slice(0, 40)}`,
    assign_event_id: `event-assign-${digest}`,
  };
}

async function sessionExists(db: D1Like, sessionRef: string) {
  return db.prepare(
    `SELECT id, session_ref
     FROM chat_session_refs
     WHERE conversation_id = ? AND session_ref = ?
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  ).bind(CONVERSATION_ID, sessionRef).first<SessionRow>();
}

function resultExternalRef(resultRef: string, summary: string) {
  return JSON.stringify({
    result_ref: resultRef || null,
    summary: summary || null,
  });
}

export function createTaskInboxApi() {
  const api = new Hono<Env>();

  api.use("/api/task-inbox/*", async (c, next) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    if (!c.env.DB) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    }
    await next();
  });

  api.post("/api/task-inbox/assign", async (c) => {
    const db = c.env.DB!;
    const idempotencyKey = clean(c.req.header("Idempotency-Key"), 500);
    if (!idempotencyKey) {
      return c.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
    }

    const body = await c.req.json<AssignBody>().catch(() => ({} as AssignBody));
    const title = clean(body.title, 180);
    const originSessionRef = clean(body.origin_session_ref, 220);
    const targetSessionRef = clean(body.target_session_ref, 220);
    const priority = safePriority(body.priority);

    if (!title || !originSessionRef || !targetSessionRef) {
      return c.json({
        ok: false,
        code: "INVALID_REQUEST",
        message: "title, origin_session_ref, and target_session_ref are required",
      }, 400);
    }
    if (secretLike(title) || secretLike(originSessionRef) || secretLike(targetSessionRef)) {
      return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    }

    const [origin, target] = await Promise.all([
      sessionExists(db, originSessionRef),
      sessionExists(db, targetSessionRef),
    ]);
    if (!origin) return c.json({ ok: false, code: "ORIGIN_SESSION_NOT_FOUND" }, 404);
    if (!target) return c.json({ ok: false, code: "TARGET_SESSION_NOT_FOUND" }, 404);

    const identity = await taskIdentity(idempotencyKey);
    const resourceKey = `${SESSION_PREFIX}${targetSessionRef}`;
    const existing = await db.prepare(
      `SELECT id, title, capability, status, priority, resource_key, claimed_by,
              correlation_id, source_ref, created_at, updated_at, completed_at
       FROM agent_tasks
       WHERE id = ?
       LIMIT 1`,
    ).bind(identity.task_id).first<TaskRow>();

    if (existing) {
      const sameContract =
        existing.title === title &&
        existing.resource_key === resourceKey &&
        existing.source_ref === originSessionRef;
      if (!sameContract) {
        return c.json({
          ok: false,
          code: "IDEMPOTENCY_CONFLICT",
          task_id: existing.id,
        }, 409);
      }
      return c.json({
        ok: true,
        idempotent_replay: true,
        task: existing,
      }, 200, { "Cache-Control": "no-store" });
    }

    await db.prepare(
      `INSERT INTO agent_tasks(
         id, title, capability, status, priority, resource_key, claimed_by,
         correlation_id, source_ref, attempt_count, created_at, updated_at
       ) VALUES (?, ?, 'cross_session_task', 'QUEUED', ?, ?, NULL, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).bind(
      identity.task_id,
      title,
      priority,
      resourceKey,
      identity.correlation_id,
      originSessionRef,
    ).run();

    await db.prepare(
      `INSERT OR IGNORE INTO agent_events(
         id, task_id, event_type, actor, correlation_id, external_ref, created_at
       ) VALUES (?, ?, 'TASK_ASSIGNED', 'owner-main', ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      identity.assign_event_id,
      identity.task_id,
      identity.correlation_id,
      JSON.stringify({
        origin_session_ref: originSessionRef,
        target_session_ref: targetSessionRef,
      }),
    ).run();

    const saved = await db.prepare(
      `SELECT id, title, capability, status, priority, resource_key, claimed_by,
              correlation_id, source_ref, created_at, updated_at, completed_at
       FROM agent_tasks
       WHERE id = ?
       LIMIT 1`,
    ).bind(identity.task_id).first<TaskRow>();

    return c.json({
      ok: true,
      idempotent_replay: false,
      task: saved,
      routing: {
        conversation_id: CONVERSATION_ID,
        origin_session_ref: originSessionRef,
        target_session_ref: targetSessionRef,
      },
    }, 201, { "Cache-Control": "no-store" });
  });

  api.get("/api/task-inbox", async (c) => {
    const db = c.env.DB!;
    const sessionRef = clean(c.req.query("session_ref"), 220);
    if (!sessionRef) return c.json({ ok: false, code: "SESSION_REF_REQUIRED" }, 400);
    if (!(await sessionExists(db, sessionRef))) {
      return c.json({ ok: false, code: "SESSION_REF_NOT_FOUND" }, 404);
    }

    const result = await db.prepare(
      `SELECT id, title, capability, status, priority, resource_key, claimed_by,
              correlation_id, source_ref, created_at, updated_at, completed_at
       FROM agent_tasks
       WHERE resource_key = ?
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 50`,
    ).bind(`${SESSION_PREFIX}${sessionRef}`).all<TaskRow>();

    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session_ref: sessionRef,
      tasks: result.results ?? [],
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/task-inbox/:id/result", async (c) => {
    const db = c.env.DB!;
    const taskId = clean(c.req.param("id"), 180);
    const body = await c.req.json<ResultBody>().catch(() => ({} as ResultBody));
    const sessionRef = clean(body.session_ref, 220);
    const status = clean(body.status, 40).toUpperCase();
    const resultRef = clean(body.result_ref, 500);
    const summary = clean(body.summary, 240);

    if (!taskId || !sessionRef || !RESULT_STATES.has(status)) {
      return c.json({
        ok: false,
        code: "INVALID_REQUEST",
        message: "task id, session_ref, and terminal status DONE|BLOCKED|FAILED are required",
      }, 400);
    }
    if (!resultRef && !summary) {
      return c.json({ ok: false, code: "RESULT_REFERENCE_OR_SUMMARY_REQUIRED" }, 400);
    }
    if (secretLike(resultRef) || secretLike(summary) || secretLike(sessionRef)) {
      return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    }
    if (!(await sessionExists(db, sessionRef))) {
      return c.json({ ok: false, code: "SESSION_REF_NOT_FOUND" }, 404);
    }

    const task = await db.prepare(
      `SELECT id, title, capability, status, priority, resource_key, claimed_by,
              correlation_id, source_ref, created_at, updated_at, completed_at
       FROM agent_tasks
       WHERE id = ?
       LIMIT 1`,
    ).bind(taskId).first<TaskRow>();
    if (!task) return c.json({ ok: false, code: "TASK_NOT_FOUND" }, 404);

    const expectedResource = `${SESSION_PREFIX}${sessionRef}`;
    if (task.resource_key !== expectedResource) {
      return c.json({
        ok: false,
        code: "TASK_TARGET_SESSION_MISMATCH",
        task_id: taskId,
      }, 403);
    }

    const externalRef = resultExternalRef(resultRef, summary);
    const resultDigest = await sha256Hex(`${taskId}:${status}:${externalRef}`);
    const eventId = `event-result-${resultDigest}`;

    if (TERMINAL.has(task.status)) {
      if (task.status !== status) {
        return c.json({
          ok: false,
          code: "TASK_ALREADY_TERMINAL",
          current_status: task.status,
        }, 409);
      }
      const prior = await db.prepare(
        `SELECT id, task_id, event_type, actor, correlation_id, external_ref, created_at
         FROM agent_events
         WHERE id = ?
         LIMIT 1`,
      ).bind(eventId).first<EventRow>();
      return c.json({
        ok: true,
        idempotent_replay: Boolean(prior),
        task,
        result_event: prior,
      }, 200, { "Cache-Control": "no-store" });
    }

    await db.prepare(
      `UPDATE agent_tasks
       SET status = ?,
           updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(status, taskId).run();

    await db.prepare(
      `INSERT OR IGNORE INTO agent_events(
         id, task_id, event_type, actor, correlation_id, external_ref, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      eventId,
      taskId,
      `TASK_RESULT_${status}`,
      `session:${sessionRef}`,
      task.correlation_id,
      externalRef,
    ).run();

    const updated = await db.prepare(
      `SELECT id, title, capability, status, priority, resource_key, claimed_by,
              correlation_id, source_ref, created_at, updated_at, completed_at
       FROM agent_tasks
       WHERE id = ?
       LIMIT 1`,
    ).bind(taskId).first<TaskRow>();

    return c.json({
      ok: true,
      idempotent_replay: false,
      task: updated,
      result: {
        status,
        result_ref: resultRef || null,
        summary: summary || null,
      },
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/task-inbox/:id/trail", async (c) => {
    const db = c.env.DB!;
    const taskId = clean(c.req.param("id"), 180);
    const task = await db.prepare(
      `SELECT id, title, capability, status, priority, resource_key, claimed_by,
              correlation_id, source_ref, created_at, updated_at, completed_at
       FROM agent_tasks
       WHERE id = ?
       LIMIT 1`,
    ).bind(taskId).first<TaskRow>();
    if (!task) return c.json({ ok: false, code: "TASK_NOT_FOUND" }, 404);

    const events = await db.prepare(
      `SELECT id, task_id, event_type, actor, correlation_id, external_ref, created_at
       FROM agent_events
       WHERE task_id = ?
       ORDER BY created_at ASC, id ASC
       LIMIT 100`,
    ).bind(taskId).all<EventRow>();

    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      task,
      events: events.results ?? [],
      canonical_trail: "owner-main",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
