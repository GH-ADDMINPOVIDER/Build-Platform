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

type LiveAssistBindings = AuthBindings & {
  DB?: D1Like;
  OPENAI_API_KEY?: string;
};
type LiveAssistEnv = { Bindings: LiveAssistBindings };
type LiveAssistBody = { prompt?: unknown; image_data_url?: unknown; auto?: unknown };
type ChatRow = { role: string; content: string; sequence_no?: number | null; source_surface?: string | null };
type ResponsesBody = {
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  error?: { code?: string; message?: string } | null;
  usage?: { total_tokens?: number } | null;
};

const SAME_MIND_CONVERSATION_ID = "owner-main";
const MAX_IMAGE_DATA_URL_CHARS = 2_800_000;

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function ensureConversation(db: D1Like) {
  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(SAME_MIND_CONVERSATION_ID, now, now).run();
}

async function nextSequence(db: D1Like) {
  const row = await db.prepare(
    `UPDATE chat_conversations
     SET last_sequence = last_sequence + 1, updated_at = ?
     WHERE id = ?
     RETURNING last_sequence`,
  ).bind(Date.now(), SAME_MIND_CONVERSATION_ID).first<{ last_sequence: number }>();
  if (!row || !Number.isFinite(Number(row.last_sequence))) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");
  return Number(row.last_sequence);
}

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

function parseGuide(raw: string) {
  const pause = /\[PAUSE_BEFORE_SECRET\]/i.test(raw);
  const match = raw.match(/\[TARGET\s+x=(\d{1,3})\s+y=(\d{1,3})\s+label=([^\]]+)\]/i);
  const target = match ? {
    x: Math.max(0, Math.min(100, Number(match[1]))),
    y: Math.max(0, Math.min(100, Number(match[2]))),
    label: clean(match[3], 80),
  } : null;
  const text = raw
    .replace(/\[PAUSE_BEFORE_SECRET\]/gi, "")
    .replace(/\[TARGET\s+x=\d{1,3}\s+y=\d{1,3}\s+label=[^\]]+\]/gi, "")
    .trim();
  return { pause, target, text };
}

export function createLiveAssistApi() {
  const api = new Hono<LiveAssistEnv>();

  const requireLiveAssist = async (c: Context<LiveAssistEnv>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    if (!c.env.OPENAI_API_KEY) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    await next();
  };

  api.use("/api/live-assist", requireLiveAssist);

  api.post("/api/live-assist", async (c) => {
    const body = await c.req.json<LiveAssistBody>().catch(() => ({} as LiveAssistBody));
    const prompt = clean(body.prompt, 3000) || "ดูหน้าจอนี้แล้วบอกขั้นตอนถัดไปแบบสั้นที่สุด";
    const imageDataUrl = String(body.image_data_url ?? "");
    const auto = body.auto === true;

    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageDataUrl)) {
      return c.json({ ok: false, code: "INVALID_IMAGE", message: "screen frame must be jpeg/png/webp data URL" }, 400);
    }
    if (imageDataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      return c.json({ ok: false, code: "IMAGE_TOO_LARGE", max_chars: MAX_IMAGE_DATA_URL_CHARS }, 413);
    }

    let history = "";
    if (c.env.DB) {
      await ensureConversation(c.env.DB);
      const result = await c.env.DB.prepare(
        `SELECT role, content, sequence_no, source_surface
         FROM chat_messages
         WHERE conversation_id = ?
         ORDER BY sequence_no DESC, created_at DESC, rowid DESC
         LIMIT 12`,
      ).bind(SAME_MIND_CONVERSATION_ID).all<ChatRow>();
      history = [...(result.results ?? [])].reverse()
        .map((row) => `[#${row.sequence_no ?? "legacy"}][${row.source_surface ?? "legacy"}] ${String(row.role).toUpperCase()}: ${clean(row.content, 600)}`)
        .join("\n");
    }

    const instruction = `You are Ammonite, OGENIC LIVE ASSIST, a screen-navigation copilot for the owner. Reply in Thai unless the owner uses another language.\n\nUse the attached CURRENT SCREEN and recent canonical 1LSS owner-main line to guide the owner one safe step at a time. Be concise and concrete, e.g. \"กด Basic settings มุมซ้าย\". You DO NOT control or click the owner's local browser; only guide and point.\n\nIMPORTANT PRIVACY RULE: Never transcribe, repeat, summarize, expose, or quote passwords, API keys, access tokens, channel secrets, recovery codes, cookies, private keys, or other secret values visible on screen. If the next step would reveal/copy/create a secret or a secret value is already visible, STOP guidance before that action and append exactly [PAUSE_BEFORE_SECRET]. Tell the owner to pause AI vision, collect/store the secret themselves, then resume.\n\nPOINTER RULE: If there is one clear safe thing to click next, append exactly [TARGET x=N y=N label=SHORT_LABEL] where x/y are integer percentages 0-100 at the visual center of that target relative to the screenshot. If unsure, omit TARGET.\n\nDo not invent buttons or claim an action succeeded unless visible.\n\nRECENT CANONICAL 1LSS:\n${history || "No recent persisted 1LSS turns available."}\n\nOWNER REQUEST:\n${prompt}`;

    const requestKey = clean(c.req.header("idempotency-key") || makeId("live"), 180);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(c.env.OPENAI_API_KEY).trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify({
        model: "gpt-5.6-sol",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            { type: "input_image", detail: "low", image_url: imageDataUrl },
          ],
        }],
        max_output_tokens: 500,
        store: false,
      }),
    });

    const result = await response.json().catch(() => ({})) as ResponsesBody;
    if (!response.ok) {
      return c.json({
        ok: false,
        code: result.error?.code ? `OPENAI_${String(result.error.code).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(result.error?.message ?? "Live Assist request failed", 300),
      }, 502);
    }

    const raw = responseText(result);
    if (!raw) return c.json({ ok: false, code: "OPENAI_EMPTY_OUTPUT" }, 502);
    const guide = parseGuide(raw);

    let userSequence: number | null = null;
    let assistantSequence: number | null = null;
    if (!auto && c.env.DB) {
      await ensureConversation(c.env.DB);
      const userIdempotency = `${requestKey}:user`;
      const assistantIdempotency = `${requestKey}:assistant`;

      const existingUser = await c.env.DB.prepare(
        `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
      ).bind(SAME_MIND_CONVERSATION_ID, userIdempotency).first<{ sequence_no: number }>();
      if (existingUser?.sequence_no) {
        userSequence = Number(existingUser.sequence_no);
      } else {
        userSequence = await nextSequence(c.env.DB);
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO chat_messages(
             id, conversation_id, role, content, model, run_id, created_at,
             sequence_no, source_surface, idempotency_key
           ) VALUES (?, ?, 'user', ?, NULL, NULL, ?, ?, 'live-assist', ?)`,
        ).bind(makeId("live_u"), SAME_MIND_CONVERSATION_ID, `[LIVE ASSIST] ${prompt}`, Date.now(), userSequence, userIdempotency).run();
      }

      const existingAssistant = await c.env.DB.prepare(
        `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
      ).bind(SAME_MIND_CONVERSATION_ID, assistantIdempotency).first<{ sequence_no: number }>();
      if (existingAssistant?.sequence_no) {
        assistantSequence = Number(existingAssistant.sequence_no);
      } else {
        assistantSequence = await nextSequence(c.env.DB);
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO chat_messages(
             id, conversation_id, role, content, model, run_id, created_at,
             sequence_no, source_surface, idempotency_key
           ) VALUES (?, ?, 'assistant', ?, ?, NULL, ?, ?, 'live-assist', ?)`,
        ).bind(makeId("live_a"), SAME_MIND_CONVERSATION_ID, guide.text, "gpt-5.6-sol", Date.now(), assistantSequence, assistantIdempotency).run();
      }
    }

    return c.json({
      ok: true,
      text: guide.text,
      target: guide.target,
      pause_before_secret: guide.pause,
      model: "gpt-5.6-sol",
      mode: auto ? "auto_watch" : "manual",
      conversation_id: SAME_MIND_CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      source_surface: "live-assist",
      user_sequence_no: userSequence,
      sequence_no: assistantSequence,
      billing: "OPENAI_API",
      usage_tokens: Number(result.usage?.total_tokens ?? 0),
      privacy: "FRAME_NOT_PERSISTED",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}

export type { LiveAssistBindings };
