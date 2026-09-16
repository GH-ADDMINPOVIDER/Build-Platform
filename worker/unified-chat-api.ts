import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";

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

export function createUnifiedChatApi() {
  const api = new Hono<Env>();
  const requireOwner = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    await next();
  };
  api.use("/api/chat/ephemeral", requireOwner);
  api.use("/api/1lss/event", requireOwner);

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

  api.post("/api/1lss/event", async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const body = await c.req.json<EventBody>().catch(() => ({} as EventBody));
    const source = clean(body.source_surface, 60) || "ogenic-ui";
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
    const requestKey = clean(c.req.header("idempotency-key") || makeId("evt"), 180);
    const sequences: number[] = [];
    for (let i = 0; i < prepared.length; i += 1) {
      const row = prepared[i]!;
      const idem = `${requestKey}:${i}`;
      const existing = await db.prepare(
        `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
      ).bind(CONVERSATION_ID, idem).first<{ sequence_no: number }>();
      if (existing?.sequence_no) { sequences.push(Number(existing.sequence_no)); continue; }
      const sequence = await nextSequence(db);
      await db.prepare(
        `INSERT OR IGNORE INTO chat_messages(
          id, conversation_id, role, content, model, run_id, created_at,
          sequence_no, source_surface, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      ).bind(makeId("evt"), CONVERSATION_ID, row.role, row.content, row.model, Date.now(), sequence, source, idem).run();
      sequences.push(sequence);
    }
    return c.json({ ok: true, conversation_id: CONVERSATION_ID, session_line: "1LSS_OWNER_MAIN", source_surface: source, sequences }, 201, { "Cache-Control": "no-store" });
  });

  return api;
}
