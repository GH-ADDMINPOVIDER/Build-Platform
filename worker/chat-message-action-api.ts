import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type ChatMessageActionBindings = AuthBindings & {
  DB?: D1Like;
};

type Env = { Bindings: ChatMessageActionBindings };
type ActionName = "REACTION" | "FEEDBACK" | "RETRY_REQUESTED" | "EVIDENCE_OPENED";
type ActionBody = {
  action?: unknown;
  value?: unknown;
  message_id?: unknown;
  sequence_no?: unknown;
  source_surface?: unknown;
};

const ACTIONS = new Set<ActionName>(["REACTION", "FEEDBACK", "RETRY_REQUESTED", "EVIDENCE_OPENED"]);
const REACTIONS = new Set(["👍", "👎", "❤️", "🔥"]);
const FEEDBACK = new Set(["HELPFUL", "NEEDS_WORK"]);
const SAME_MIND = "owner-main";

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function secretLike(value: unknown) {
  return /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i.test(String(value ?? ""));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validValue(action: ActionName, value: string) {
  if (action === "REACTION") return REACTIONS.has(value);
  if (action === "FEEDBACK") return FEEDBACK.has(value);
  return value === "" || value === "OPENED" || value === "QUEUED";
}

export function createChatMessageActionApi() {
  const api = new Hono<Env>();

  api.post("/api/chat/message-action", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    if (!c.env.DB) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    }

    const idempotencyKey = clean(c.req.header("Idempotency-Key"), 500);
    if (!idempotencyKey) return c.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);

    const body = await c.req.json<ActionBody>().catch(() => ({} as ActionBody));
    const action = clean(body.action, 40).toUpperCase() as ActionName;
    const value = clean(body.value, 40).toUpperCase() === "HELPFUL" || clean(body.value, 40).toUpperCase() === "NEEDS_WORK"
      ? clean(body.value, 40).toUpperCase()
      : clean(body.value, 20);
    const messageId = clean(body.message_id, 180);
    const sourceSurface = clean(body.source_surface, 80);
    const sequenceNo = Math.max(0, Math.floor(Number(body.sequence_no ?? 0)));

    if (!ACTIONS.has(action)) return c.json({ ok: false, code: "INVALID_ACTION" }, 400);
    if (!messageId && !sequenceNo) {
      return c.json({ ok: false, code: "MESSAGE_REFERENCE_REQUIRED" }, 400);
    }
    if (!validValue(action, value)) return c.json({ ok: false, code: "INVALID_ACTION_VALUE" }, 400);
    if (secretLike(messageId) || secretLike(sourceSurface) || secretLike(value)) {
      return c.json({ ok: false, code: "SECRET_LIKE_INPUT_REJECTED" }, 400);
    }

    const digest = await sha256Hex(`${SAME_MIND}:message-action:${idempotencyKey}`);
    const eventId = `event-msg-action-${digest}`;
    const correlationId = sequenceNo
      ? `1lss-message-${sequenceNo}`
      : `message-${(await sha256Hex(messageId)).slice(0, 32)}`;
    const reference = JSON.stringify({
      conversation_id: SAME_MIND,
      message_id: messageId || null,
      sequence_no: sequenceNo || null,
      source_surface: sourceSurface || null,
      action,
      value: value || null,
    });

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO agent_events(
         id, task_id, event_type, actor, correlation_id, external_ref, created_at
       ) VALUES (?, NULL, ?, 'owner', ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      eventId,
      `CHAT_MESSAGE_${action}`,
      correlationId,
      reference,
    ).run();

    return c.json({
      ok: true,
      event_id: eventId,
      action,
      message_ref: {
        id: messageId || null,
        sequence_no: sequenceNo || null,
        source_surface: sourceSurface || null,
      },
      persisted: "agent_events_reference_only",
      raw_message_stored: false,
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
