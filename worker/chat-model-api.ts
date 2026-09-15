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

type Bindings = AuthBindings & {
  DB?: D1Like;
  OPENAI_API_KEY?: string;
};
type Env = { Bindings: Bindings };

type Body = {
  prompt?: unknown;
  attachment_ids?: unknown;
  model?: unknown;
  reasoning_effort?: unknown;
  token_boost?: unknown;
  mode?: unknown;
};
type ChatRow = { role: string; content: string };
type AttachmentRow = { filename: string; mime_type: string; data_base64: string };
type ResponsesBody = {
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: { total_tokens?: number } | null;
  error?: { code?: string; message?: string } | null;
};

const CONVERSATION_ID = "owner-main";
const MODELS = new Set(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-4.1-mini", "gpt-6-astra"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const BOOSTS = new Set([1, 10, 20]);

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}
function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
function outputText(body: ResponsesBody) {
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") out.push(part.text);
      if (part.type === "refusal" && typeof part.refusal === "string") out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
}

export function createChatModelApi() {
  const api = new Hono<Env>();

  api.post("/api/chat/model", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const apiKey = String(c.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);

    const body = await c.req.json<Body>().catch(() => ({} as Body));
    const prompt = clean(body.prompt, 7000);
    const model = MODELS.has(String(body.model)) ? String(body.model) : "gpt-5.6-sol";
    const effort = EFFORTS.has(String(body.reasoning_effort)) ? String(body.reasoning_effort) : "medium";
    const requestedBoost = Number(body.token_boost ?? 1);
    const boost = BOOSTS.has(requestedBoost) ? requestedBoost : 1;
    const attachmentIds = Array.isArray(body.attachment_ids)
      ? body.attachment_ids.map((value) => clean(value, 120)).filter(Boolean).slice(0, 4)
      : [];
    if (!prompt && !attachmentIds.length) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt or attachment is required" }, 400);
    }

    await db.prepare(
      `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
       VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?, ?)`,
    ).bind(CONVERSATION_ID, Date.now(), Date.now(), Date.now()).run().catch(async () => {
      // Older schema uses five columns; keep compatibility with the current staging table.
      await db.prepare(
        `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
         VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
      ).bind(CONVERSATION_ID, Date.now(), Date.now()).run();
    });

    const historyResult = await db.prepare(
      `SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 18`,
    ).bind(CONVERSATION_ID).all<ChatRow>();
    const history = [...(historyResult.results ?? [])].reverse()
      .map((row) => `${String(row.role).toUpperCase()}: ${clean(row.content, 900)}`)
      .join("\n");

    const content: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: `You are OGENIC AI, the owner's continuous copilot. Preserve continuity from the recent website conversation. Never claim access to a separate ChatGPT App conversation unless it was explicitly imported. Reply in the user's language and natural tone.\n\nRECENT WEBSITE CHAT:\n${history || "No prior website messages."}\n\nCURRENT OWNER MESSAGE:\n${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}`,
    }];

    for (const id of attachmentIds) {
      const row = await db.prepare(
        `SELECT filename, mime_type, data_base64 FROM chat_attachments WHERE id = ? AND conversation_id = ?`,
      ).bind(id, CONVERSATION_ID).first<AttachmentRow>();
      if (!row) return c.json({ ok: false, code: "ATTACHMENT_NOT_FOUND", id }, 404);
      if (row.mime_type.startsWith("image/")) {
        content.push({ type: "input_image", detail: "auto", image_url: `data:${row.mime_type};base64,${row.data_base64}` });
      } else {
        content.push({ type: "input_file", filename: row.filename, file_data: row.data_base64 });
      }
    }

    const now = Date.now();
    const visibleUserText = `${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}${attachmentIds.length ? `\n\n[${attachmentIds.length} attachment(s)]` : ""}`;
    await db.prepare(
      `INSERT INTO chat_messages(id, conversation_id, role, content, model, run_id, created_at)
       VALUES (?, ?, 'user', ?, NULL, NULL, ?)`,
    ).bind(makeId("model_u"), CONVERSATION_ID, visibleUserText, now).run();
    await db.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ?").bind(now, CONVERSATION_ID).run();

    const requestBody: Record<string, unknown> = {
      model,
      input: [{ role: "user", content }],
      max_output_tokens: Math.min(30_000, 1_500 * boost),
      store: false,
    };
    if (model !== "gpt-4.1-mini") requestBody.reasoning = { effort };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": c.req.header("idempotency-key") ?? makeId("model"),
      },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({})) as ResponsesBody;
    if (!response.ok) {
      return c.json({
        ok: false,
        code: result.error?.code ? `OPENAI_${String(result.error.code).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(result.error?.message ?? "OpenAI model request failed", 300),
      }, 502);
    }

    const text = outputText(result);
    if (!text) return c.json({ ok: false, code: "OPENAI_EMPTY_OUTPUT" }, 502);
    await db.prepare(
      `INSERT INTO chat_messages(id, conversation_id, role, content, model, run_id, created_at)
       VALUES (?, ?, 'assistant', ?, ?, NULL, ?)`,
    ).bind(makeId("model_a"), CONVERSATION_ID, text, model, Date.now()).run();
    await db.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ?").bind(Date.now(), CONVERSATION_ID).run();

    return c.json({
      ok: true,
      text,
      model,
      reasoning_effort: model === "gpt-4.1-mini" ? "n/a" : effort,
      token_boost: boost,
      max_output_tokens: requestBody.max_output_tokens,
      billing: "OPENAI_API",
      incentive_pool: "api_billing",
      usage_tokens: Number(result.usage?.total_tokens ?? 0),
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
