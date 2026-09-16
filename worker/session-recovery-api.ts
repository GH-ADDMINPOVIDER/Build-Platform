import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

type D1Result<T = Record<string, unknown>> = { results?: T[] };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type SessionRecoveryBindings = AuthBindings & { DB?: D1Like };
type Env = { Bindings: SessionRecoveryBindings };

type SessionRefRow = {
  id: string;
  source_surface: string;
  session_ref: string;
  session_url?: string | null;
  label?: string | null;
  first_sequence?: number | null;
  last_sequence?: number | null;
  first_seen_at: number;
  last_seen_at: number;
};
type MessageRow = {
  id?: string;
  role: string;
  content: string;
  model?: string | null;
  run_id?: string | null;
  created_at: number;
  sequence_no?: number | null;
  source_surface?: string | null;
};

const CONVERSATION_ID = "owner-main";
const DEFAULT_PAGE = 60;
const MAX_PAGE = 120;
const MAX_SESSION_VIEW = 240;
const SURFACES = new Set([
  "ogenic-web",
  "ogenic-app",
  "chatgpt-dev",
  "chatgpt-app",
  "live-assist",
  "manus",
  "external-harness",
  "plugin-harness",
  "unknown",
]);

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}
function clampLimit(value: unknown, fallback = DEFAULT_PAGE, max = MAX_PAGE) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}
function cleanSurface(value: unknown) {
  const candidate = clean(value, 60).toLowerCase();
  return SURFACES.has(candidate) ? candidate : "external-harness";
}
function safeSessionUrl(value: unknown) {
  const candidate = clean(value, 1200);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return null;
  }
}
function mapMessage(message: MessageRow) {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    model: message.model ?? null,
    run_id: message.run_id ?? null,
    created_at: message.created_at,
    sequence_no: message.sequence_no ?? null,
    source_surface: message.source_surface ?? "legacy",
  };
}
async function ownerOnly(request: Request, env: SessionRecoveryBindings) {
  return hasOwnerSession(request, env);
}
async function ensureConversation(db: D1Like) {
  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(CONVERSATION_ID, now, now).run();
}

export function createSessionRecoveryApi() {
  const api = new Hono<Env>();

  api.get("/api/1lss/history-page", async (c) => {
    if (!(await ownerOnly(c.req.raw, c.env))) return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    await ensureConversation(db);

    const limit = clampLimit(c.req.query("limit"));
    const before = Math.floor(Number(c.req.query("before_sequence") || 0));
    const result = before > 0
      ? await db.prepare(
          `SELECT id, role, content, model, run_id, created_at, sequence_no, source_surface
           FROM chat_messages
           WHERE conversation_id = ? AND sequence_no < ?
           ORDER BY sequence_no DESC, created_at DESC, rowid DESC
           LIMIT ?`,
        ).bind(CONVERSATION_ID, before, limit).all<MessageRow>()
      : await db.prepare(
          `SELECT id, role, content, model, run_id, created_at, sequence_no, source_surface
           FROM chat_messages
           WHERE conversation_id = ?
           ORDER BY sequence_no DESC, created_at DESC, rowid DESC
           LIMIT ?`,
        ).bind(CONVERSATION_ID, limit).all<MessageRow>();

    const rows = [...(result.results ?? [])].reverse();
    const oldest = rows.reduce((min, row) => {
      const seq = Number(row.sequence_no ?? 0);
      return seq > 0 ? Math.min(min, seq) : min;
    }, Number.POSITIVE_INFINITY);
    const newest = rows.reduce((max, row) => Math.max(max, Number(row.sequence_no ?? 0)), 0);
    const older = Number.isFinite(oldest)
      ? await db.prepare(
          `SELECT sequence_no FROM chat_messages
           WHERE conversation_id = ? AND sequence_no < ?
           ORDER BY sequence_no DESC LIMIT 1`,
        ).bind(CONVERSATION_ID, oldest).first<{ sequence_no: number }>()
      : null;

    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      messages: rows.map(mapMessage),
      oldest_sequence: Number.isFinite(oldest) ? oldest : null,
      newest_sequence: newest || null,
      has_more: Boolean(older?.sequence_no),
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/1lss/sessions", async (c) => {
    if (!(await ownerOnly(c.req.raw, c.env))) return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const limit = clampLimit(c.req.query("limit"), 20, 50);
    const result = await db.prepare(
      `SELECT id, source_surface, session_ref, session_url, label,
              first_sequence, last_sequence, first_seen_at, last_seen_at
       FROM chat_session_refs
       WHERE conversation_id = ?
       ORDER BY last_seen_at DESC, last_sequence DESC
       LIMIT ?`,
    ).bind(CONVERSATION_ID, limit).all<SessionRefRow>();
    return c.json({ ok: true, conversation_id: CONVERSATION_ID, sessions: result.results ?? [] }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/1lss/sessions", async (c) => {
    if (!(await ownerOnly(c.req.raw, c.env))) return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    await ensureConversation(db);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const source = cleanSurface(body.source_surface);
    const sessionRef = clean(body.session_ref, 220);
    const sessionUrl = safeSessionUrl(body.session_url);
    const label = clean(body.label, 160) || null;
    if (!sessionRef) return c.json({ ok: false, code: "INVALID_REQUEST", message: "session_ref is required" }, 400);

    const conversation = await db.prepare(
      `SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1`,
    ).bind(CONVERSATION_ID).first<{ last_sequence?: number }>();
    const requestedSequence = Math.floor(Number(body.sequence_no ?? 0));
    const sequence = requestedSequence > 0 ? requestedSequence : Math.max(0, Number(conversation?.last_sequence ?? 0));
    const now = Date.now();
    const id = `session_${crypto.randomUUID()}`;
    await db.prepare(
      `INSERT INTO chat_session_refs(
         id, conversation_id, source_surface, session_ref, session_url, label,
         first_sequence, last_sequence, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(conversation_id, source_surface, session_ref) DO UPDATE SET
         session_url = COALESCE(excluded.session_url, chat_session_refs.session_url),
         label = COALESCE(excluded.label, chat_session_refs.label),
         first_sequence = CASE
           WHEN chat_session_refs.first_sequence IS NULL THEN excluded.first_sequence
           WHEN excluded.first_sequence IS NULL THEN chat_session_refs.first_sequence
           ELSE MIN(chat_session_refs.first_sequence, excluded.first_sequence)
         END,
         last_sequence = CASE
           WHEN chat_session_refs.last_sequence IS NULL THEN excluded.last_sequence
           WHEN excluded.last_sequence IS NULL THEN chat_session_refs.last_sequence
           ELSE MAX(chat_session_refs.last_sequence, excluded.last_sequence)
         END,
         last_seen_at = excluded.last_seen_at`,
    ).bind(
      id,
      CONVERSATION_ID,
      source,
      sessionRef,
      sessionUrl,
      label,
      sequence || null,
      sequence || null,
      now,
      now,
    ).run();

    const saved = await db.prepare(
      `SELECT id, source_surface, session_ref, session_url, label,
              first_sequence, last_sequence, first_seen_at, last_seen_at
       FROM chat_session_refs
       WHERE conversation_id = ? AND source_surface = ? AND session_ref = ?
       LIMIT 1`,
    ).bind(CONVERSATION_ID, source, sessionRef).first<SessionRefRow>();
    return c.json({ ok: true, session: saved }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/1lss/sessions/:id", async (c) => {
    if (!(await ownerOnly(c.req.raw, c.env))) return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const id = clean(c.req.param("id"), 180);
    const session = await db.prepare(
      `SELECT id, source_surface, session_ref, session_url, label,
              first_sequence, last_sequence, first_seen_at, last_seen_at
       FROM chat_session_refs
       WHERE id = ? AND conversation_id = ?
       LIMIT 1`,
    ).bind(id, CONVERSATION_ID).first<SessionRefRow>();
    if (!session) return c.json({ ok: false, code: "SESSION_REF_NOT_FOUND" }, 404);

    const first = Math.max(0, Number(session.first_sequence ?? 0));
    const last = Math.max(first, Number(session.last_sequence ?? first));
    const result = first > 0
      ? await db.prepare(
          `SELECT id, role, content, model, run_id, created_at, sequence_no, source_surface
           FROM chat_messages
           WHERE conversation_id = ? AND sequence_no >= ? AND sequence_no <= ?
           ORDER BY sequence_no ASC, created_at ASC, rowid ASC
           LIMIT ?`,
        ).bind(CONVERSATION_ID, first, last, MAX_SESSION_VIEW).all<MessageRow>()
      : { results: [] as MessageRow[] };

    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session,
      messages: (result.results ?? []).map(mapMessage),
      truncated: (result.results ?? []).length >= MAX_SESSION_VIEW,
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
