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
type ChatRow = { role: string; content: string };
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
      const result = await c.env.DB.prepare(
        `SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`,
      ).bind(SAME_MIND_CONVERSATION_ID).all<ChatRow>();
      history = [...(result.results ?? [])].reverse()
        .map((row) => `${String(row.role).toUpperCase()}: ${clean(row.content, 600)}`)
        .join("\n");
    }

    const instruction = `You are OGENIC LIVE ASSIST, a screen-navigation copilot for the owner. Reply in Thai unless the owner uses another language.\n\nUse the attached CURRENT SCREEN and recent SAME MIND website chat to guide the owner one safe step at a time. Be concise and concrete, e.g. \"กด Basic settings มุมซ้าย\". You DO NOT control or click the owner's local browser; only guide and point.\n\nIMPORTANT PRIVACY RULE: Never transcribe, repeat, summarize, expose, or quote passwords, API keys, access tokens, channel secrets, recovery codes, cookies, private keys, or other secret values visible on screen. If the next step would reveal/copy/create a secret or a secret value is already visible, STOP guidance before that action and append exactly [PAUSE_BEFORE_SECRET]. Tell the owner to pause AI vision, collect/store the secret themselves, then resume.\n\nPOINTER RULE: If there is one clear safe thing to click next, append exactly [TARGET x=N y=N label=SHORT_LABEL] where x/y are integer percentages 0-100 at the visual center of that target relative to the screenshot. If unsure, omit TARGET.\n\nDo not invent buttons or claim an action succeeded unless visible.\n\nRECENT SAME MIND WEBSITE CHAT:\n${history || "No recent website chat available."}\n\nOWNER REQUEST:\n${prompt}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(c.env.OPENAI_API_KEY).trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": c.req.header("idempotency-key") ?? makeId("live"),
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

    if (!auto && c.env.DB) {
      const now = Date.now();
      await c.env.DB.prepare(
        `INSERT INTO chat_messages(id, conversation_id, role, content, model, run_id, created_at) VALUES (?, ?, 'user', ?, NULL, NULL, ?)`,
      ).bind(makeId("live_u"), SAME_MIND_CONVERSATION_ID, `[LIVE ASSIST] ${prompt}`, now).run();
      await c.env.DB.prepare(
        `INSERT INTO chat_messages(id, conversation_id, role, content, model, run_id, created_at) VALUES (?, ?, 'assistant', ?, ?, NULL, ?)`,
      ).bind(makeId("live_a"), SAME_MIND_CONVERSATION_ID, guide.text, "gpt-5.6-sol", now + 1).run();
    }

    return c.json({
      ok: true,
      text: guide.text,
      target: guide.target,
      pause_before_secret: guide.pause,
      model: "gpt-5.6-sol",
      mode: auto ? "auto_watch" : "manual",
      billing: "OPENAI_API",
      usage_tokens: Number(result.usage?.total_tokens ?? 0),
      privacy: "FRAME_NOT_PERSISTED",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}

export type { LiveAssistBindings };
