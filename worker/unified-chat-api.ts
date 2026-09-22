import { Hono, type Context, type Next } from "hono";
import { hasOwnerOrOpsAccess, requireOwnerSession, type AuthBindings } from "./app-auth";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type UnifiedChatBindings = AuthBindings & {
  DB?: D1Like;
  OPENAI_API_KEY?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_GITHUB_BRANCH?: string;
};
type Env = { Bindings: UnifiedChatBindings };

type EphemeralBody = {
  prompt?: unknown;
  model?: unknown;
  reasoning_effort?: unknown;
  token_boost?: unknown;
};
type EventBody = {
  source_surface?: unknown;
  events?: Array<{ role?: unknown; content?: unknown; model?: unknown }>;
};
type EventRow = {
  id?: string;
  role: string;
  content: string;
  model?: string | null;
  created_at: number;
  sequence_no?: number | null;
  source_surface?: string | null;
};
type SurfaceSummaryRow = {
  source_surface?: string | null;
  last_sequence?: number | null;
  message_count?: number | null;
  last_seen_at?: number | null;
};
type SessionPresenceRow = {
  source_surface?: string | null;
  last_sequence?: number | null;
  last_seen_at?: number | null;
};
type ResponsesBody = {
  model?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  error?: { code?: string; message?: string } | null;
  usage?: { total_tokens?: number } | null;
};

const CONVERSATION_ID = "owner-main";
const MODELS = new Set(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-4.1-mini", "gpt-6-astra"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const BOOSTS = new Set([1, 10, 20]);
const ROLES = new Set(["user", "assistant", "system"]);
const EVENT_SURFACES = new Set([
  "ogenic-web",
  "ogenic-app",
  "chatgpt-dev",
  "chatgpt-app",
  "live-assist",
  "manus",
  "external-harness",
  "plugin-harness",
]);
const EXTERNAL_EVENT_SURFACES = new Set([
  "chatgpt-dev",
  "chatgpt-app",
  "live-assist",
  "manus",
  "external-harness",
  "plugin-harness",
]);

function clean(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }
function makeId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function responseText(body: ResponsesBody) {
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") out.push(part.text);
      if (part.type === "refusal" && typeof part.refusal === "string") out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
}
function secretLike(value: string) {
  return /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|bearer\s+[a-z0-9._~+/=-]{12,}|(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*\S{6,})/i.test(value);
}

async function ensureConversation(db: D1Like) {
  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(CONVERSATION_ID, now, now).run();
}
async function nextSequence(db: D1Like) {
  const row = await db.prepare(
    `UPDATE chat_conversations SET last_sequence = last_sequence + 1, updated_at = ? WHERE id = ? RETURNING last_sequence`,
  ).bind(Date.now(), CONVERSATION_ID).first<{ last_sequence: number }>();
  if (!row || !Number.isFinite(Number(row.last_sequence))) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");
  return Number(row.last_sequence);
}

async function persistEventBatch(
  db: D1Like,
  source: string,
  prepared: Array<{ role: string; content: string; model: string | null }>,
  requestKey: string,
) {
  const sequences: number[] = [];
  let replayedCount = 0;
  for (let i = 0; i < prepared.length; i += 1) {
    const row = prepared[i]!;
    const idem = `${requestKey}:${i}`;
    const existing = await db.prepare(
      `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
    ).bind(CONVERSATION_ID, idem).first<{ sequence_no: number }>();
    if (existing?.sequence_no) {
      replayedCount += 1;
      sequences.push(Number(existing.sequence_no));
      continue;
    }
    const sequence = await nextSequence(db);
    await db.prepare(
      `INSERT OR IGNORE INTO chat_messages(
        id, conversation_id, role, content, model, run_id, created_at,
        sequence_no, source_surface, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).bind(makeId("evt"), CONVERSATION_ID, row.role, row.content, row.model, Date.now(), sequence, source, idem).run();
    const persisted = await db.prepare(
      `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
    ).bind(CONVERSATION_ID, idem).first<{ sequence_no: number }>();
    sequences.push(Number(persisted?.sequence_no ?? sequence));
  }
  return { sequences, replayedCount };
}

async function readEventPage(db: D1Like, after: number, limit: number) {
  const result = await db.prepare(
    `SELECT id, role, content, model, created_at, sequence_no, source_surface
     FROM chat_messages
     WHERE conversation_id = ? AND sequence_no > ?
     ORDER BY sequence_no ASC, created_at ASC, rowid ASC
     LIMIT ?`,
  ).bind(CONVERSATION_ID, after, limit).all<EventRow>();

  const conversation = await db.prepare(
    `SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1`,
  ).bind(CONVERSATION_ID).first<{ last_sequence?: number }>();

  const messages = (result.results ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    text: row.content,
    model: row.model ?? null,
    created_at: row.created_at,
    sequence_no: row.sequence_no ?? null,
    source_surface: row.source_surface ?? "legacy",
  }));
  const cursor = Math.max(after, ...messages.map((row) => Number(row.sequence_no ?? 0)));
  return {
    messages,
    cursor,
    latest_sequence: Math.max(cursor, Number(conversation?.last_sequence ?? 0)),
  };
}

export function createUnifiedChatApi() {
  const api = new Hono<Env>();
  const requireOwner = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    await next();
  };
  const requireBridge = async (c: Context<Env>, next: Next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner_or_ops_bridge" }, 401);
    }
    await next();
  };
  api.use("/api/chat/ephemeral", requireOwner);
  api.use("/api/1lss/event", requireBridge);
  api.use("/api/1lss/events", requireBridge);
  api.use("/api/1lss/status", requireBridge);

  api.post("/api/chat/ephemeral", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    const body = await c.req.json<EphemeralBody>().catch(() => ({} as EphemeralBody));
    const prompt = clean(body.prompt, 7000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    const requestedModel = clean(body.model, 100);
    const model = MODELS.has(requestedModel) ? requestedModel : "gpt-5.6-sol";
    const requestedEffort = clean(body.reasoning_effort, 40);
    const effort = EFFORTS.has(requestedEffort) ? requestedEffort : "medium";
    const requestedBoost = Number(body.token_boost ?? 1);
    const boost = BOOSTS.has(requestedBoost) ? requestedBoost : 1;

    const requestBody: Record<string, unknown> = {
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: `You are Ammonite, OGENIC AI. This turn is EPHEMERAL: do not assume D1 memory or claim it was saved. Reply in the owner's language.\n\nOWNER:\n${prompt}` }] }],
      max_output_tokens: Math.min(30_000, 1_500 * boost),
      store: false,
    };
    if (model !== "gpt-4.1-mini") requestBody.reasoning = { effort };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": c.req.header("idempotency-key") ?? makeId("ephemeral") },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({})) as ResponsesBody;
    if (!response.ok) {
      return c.json({
        ok: false,
        code: result.error?.code ? `OPENAI_${clean(result.error.code, 100).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(result.error?.message ?? "OpenAI request failed", 300),
      }, 502);
    }
    const text = responseText(result);
    if (!text) return c.json({ ok: false, code: "OPENAI_EMPTY_OUTPUT" }, 502);
    return c.json({
      ok: true,
      text,
      model: result.model ?? model,
      memory: "OFF",
      session_line: null,
      billing: "OPENAI_API",
      usage_tokens: Number(result.usage?.total_tokens ?? 0),
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/1lss/status", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);

    const [messageRows, presenceRows, conversation] = await Promise.all([
      db.prepare(
        `SELECT source_surface, MAX(sequence_no) AS last_sequence, COUNT(*) AS message_count
         FROM chat_messages
         WHERE conversation_id = ? AND source_surface IN ('ogenic-web', 'ogenic-app')
         GROUP BY source_surface`,
      ).bind(CONVERSATION_ID).all<SurfaceSummaryRow>(),
      db.prepare(
        `SELECT source_surface, last_sequence, last_seen_at
         FROM chat_session_refs
         WHERE conversation_id = ? AND source_surface IN ('ogenic-web', 'ogenic-app')
         ORDER BY last_seen_at DESC`,
      ).bind(CONVERSATION_ID).all<SessionPresenceRow>(),
      db.prepare(
        `SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1`,
      ).bind(CONVERSATION_ID).first<{ last_sequence?: number }>(),
    ]);

    const now = Date.now();
    const freshnessMs = 120_000;
    const messageMap = new Map((messageRows.results ?? []).map((row) => [String(row.source_surface ?? ""), row]));
    const freshestPresence = new Map<string, SessionPresenceRow>();
    for (const row of presenceRows.results ?? []) {
      const surface = String(row.source_surface ?? "");
      if (surface && !freshestPresence.has(surface)) freshestPresence.set(surface, row);
    }

    const pairLatestSequence = Math.max(
      0,
      ...(messageRows.results ?? []).map((row) => Number(row.last_sequence ?? 0)),
    );

    const surfaces = (["ogenic-web", "ogenic-app"] as const).map((surface) => {
      const messages = messageMap.get(surface);
      const presence = freshestPresence.get(surface);
      const lastSeenAt = Number(presence?.last_seen_at ?? 0);
      const doorLastSequence = Number(presence?.last_sequence ?? 0);
      const persisted = Number(messages?.message_count ?? 0) > 0;
      const fresh = lastSeenAt > 0 && now - lastSeenAt <= freshnessMs;
      const caughtUp = pairLatestSequence > 0 && doorLastSequence >= pairLatestSequence;
      return {
        source_surface: surface,
        message_count: Number(messages?.message_count ?? 0),
        last_message_sequence: Number(messages?.last_sequence ?? 0),
        door_last_sequence: doorLastSequence,
        door_last_seen_at: lastSeenAt,
        door_seen: lastSeenAt > 0,
        fresh,
        persisted,
        caught_up_to_pair_latest: caughtUp,
      };
    });

    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      latest_sequence: Number(conversation?.last_sequence ?? 0),
      pair_latest_sequence: pairLatestSequence,
      checked_at: now,
      freshness_ms: freshnessMs,
      cross_surface_ready: surfaces.every((row) => row.fresh && row.persisted && row.caught_up_to_pair_latest),
      surfaces,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/1lss/events", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    await ensureConversation(db);

    const afterRaw = Math.floor(Number(c.req.query("after_sequence") ?? 0));
    const after = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;
    const limitRaw = Math.floor(Number(c.req.query("limit") ?? 40));
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 40;
    const page = await readEventPage(db, after, limit);

    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      after_sequence: after,
      cursor: page.cursor,
      latest_sequence: page.latest_sequence,
      messages: page.messages,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/1lss/event", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const body = await c.req.json<EventBody>().catch(() => ({} as EventBody));
    const source = clean(body.source_surface, 60).toLowerCase();
    if (!EVENT_SURFACES.has(source)) {
      return c.json({
        ok: false,
        code: "INVALID_SOURCE_SURFACE",
        allowed: [...EVENT_SURFACES],
      }, 400);
    }
    const requestKeyHeader = clean(c.req.header("idempotency-key"), 180);
    if (EXTERNAL_EVENT_SURFACES.has(source) && !requestKeyHeader) {
      return c.json({
        ok: false,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        source_surface: source,
      }, 400);
    }
    const rows = Array.isArray(body.events) ? body.events.slice(0, 6) : [];
    if (!rows.length) return c.json({ ok: false, code: "INVALID_REQUEST", message: "events are required" }, 400);
    const prepared = rows.map((row) => {
      const role = clean(row.role, 20).toLowerCase();
      const content = clean(row.content, 7000);
      const model = clean(row.model, 100) || null;
      return { role, content, model };
    });
    if (prepared.some((row) => !ROLES.has(row.role) || !row.content)) return c.json({ ok: false, code: "INVALID_EVENT" }, 400);
    if (prepared.some((row) => secretLike(row.content))) return c.json({ ok: false, code: "SECRET_LIKE_CONTENT_REJECTED" }, 400);

    await ensureConversation(db);
    const requestKey = requestKeyHeader || makeId("evt");
    const persisted = await persistEventBatch(db, source, prepared, requestKey);
    const sequences = persisted.sequences;
    const replayedCount = persisted.replayedCount;
    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      source_surface: source,
      sequences,
      replayed_count: replayedCount,
    }, replayedCount === prepared.length ? 200 : 201, { "Cache-Control": "no-store" });
  });



  api.post("/api/1lss/runtime-proof", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const expectedBuild = clean(c.env.OGENIC_BUILD_UUID, 180);
    const suppliedBuild = clean(c.req.header("x-ogenic-build-proof"), 180);
    const branchName = clean(c.env.OGENIC_GITHUB_BRANCH, 180);
    if (
      !expectedBuild ||
      expectedBuild === "unknown" ||
      suppliedBuild !== expectedBuild ||
      branchName !== "phase-vi-provider-incentive-metering"
    ) {
      return c.json({ ok: false, code: "RUNTIME_PROOF_DENIED" }, 403);
    }

    await ensureConversation(db);
    const requestKey = `runtime-proof:${expectedBuild}`;
    const proofContent = `[1LSS RUNTIME PROOF] external-harness bridge verified for build ${expectedBuild}`;
    const prepared = [{ role: "system", content: proofContent, model: null }];

    const first = await persistEventBatch(db, "external-harness", prepared, requestKey);
    const retry = await persistEventBatch(db, "external-harness", prepared, requestKey);
    const sequence = Number(first.sequences[0] ?? 0);
    const retrySequence = Number(retry.sequences[0] ?? 0);
    if (!sequence || retrySequence !== sequence || retry.replayedCount !== 1) {
      return c.json({ ok: false, code: "RUNTIME_PROOF_IDEMPOTENCY_FAILED", sequence, retry_sequence: retrySequence }, 500);
    }

    const visible = await readEventPage(db, Math.max(0, sequence - 1), 40);
    const observed = visible.messages.find((row) =>
      Number(row.sequence_no ?? 0) === sequence &&
      row.source_surface === "external-harness" &&
      row.text === proofContent
    );
    if (!observed) {
      return c.json({ ok: false, code: "RUNTIME_PROOF_CURSOR_VISIBILITY_FAILED", sequence }, 500);
    }

    let cursor = 0;
    let previous = 0;
    let drained = 0;
    let pages = 0;
    let latest = 0;
    while (pages < 100) {
      const page = await readEventPage(db, cursor, 40);
      latest = page.latest_sequence;
      pages += 1;
      for (const row of page.messages) {
        const current = Number(row.sequence_no ?? 0);
        if (current <= previous) {
          return c.json({ ok: false, code: "RUNTIME_PROOF_CURSOR_ORDER_FAILED", previous, current }, 500);
        }
        previous = current;
        drained += 1;
      }
      if (!page.messages.length || page.cursor >= page.latest_sequence) {
        cursor = page.cursor;
        break;
      }
      if (page.cursor <= cursor) {
        return c.json({ ok: false, code: "RUNTIME_PROOF_CURSOR_STALLED", cursor, next_cursor: page.cursor }, 500);
      }
      cursor = page.cursor;
    }
    if (cursor < latest) {
      return c.json({ ok: false, code: "RUNTIME_PROOF_BACKLOG_NOT_DRAINED", cursor, latest, pages }, 500);
    }

    return c.json({
      ok: true,
      proof: "1LSS_EXTERNAL_AGENT_RUNTIME_VERIFIED",
      conversation_id: CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      source_surface: "external-harness",
      sequence_no: sequence,
      retry_sequence_no: retrySequence,
      replayed_count: retry.replayedCount,
      observed_via_event_feed: true,
      backlog: { drained, pages, cursor, latest, page_size: 40, complete: true },
      build_uuid: expectedBuild,
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
