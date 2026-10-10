import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";
import { readIncentiveSnapshot } from "./provider-incentives";
import { readCanonicalD1Context, recordChatUsage } from "./d1-context";
import {
  isR2AttachmentReference,
  markR2ReferenceHandedOff,
  recordR2FileHandoffEvidence,
  resolveR2ReferenceToOpenAIFile,
  type ChatAttachmentStorageEnv,
  type R2AttachmentManifest,
} from "./chat-attachment-storage";

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
  OGENIC_GIT_SHA?: string;
  OGENIC_GITHUB_BRANCH?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_RUNTIME?: string;
  OGENIC_PHASE?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
};
type Env = { Bindings: Bindings };

type Body = {
  prompt?: unknown;
  attachment_ids?: unknown;
  model?: unknown;
  reasoning_effort?: unknown;
  token_boost?: unknown;
  mode?: unknown;
  source_surface?: unknown;
  session_ref?: unknown;
  session_url?: unknown;
  session_label?: unknown;
  allow_paid_fallback?: unknown;
};
type ChatRow = {
  id?: string;
  role: string;
  content: string;
  model?: string | null;
  run_id?: string | null;
  created_at: number;
  sequence_no?: number | null;
  source_surface?: string | null;
};
type AttachmentRow = { filename: string; mime_type: string; data_base64: string };
type ResponsesBody = {
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: { total_tokens?: number } | null;
  error?: { code?: string; message?: string } | null;
};

const CONVERSATION_ID = "owner-main";
const HISTORY_LIMIT = 60;
const HISTORY_CHAR_BUDGET = 22_000;
const MODELS = new Set(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-4.1-mini", "gpt-6-astra"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const BOOSTS = new Set([1, 10, 20]);
const SURFACES = new Set([
  "ogenic-web",
  "ogenic-app",
  "chatgpt-dev",
  "chatgpt-app",
  "live-assist",
  "manus",
  "external-harness",
  "unknown",
]);

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

function resolveSurface(body: Body, request: Request) {
  const explicit = clean(body.source_surface ?? request.headers.get("x-ogenic-surface"), 40).toLowerCase();
  if (SURFACES.has(explicit)) return explicit;
  const mode = clean(body.mode, 40).toLowerCase();
  if (mode === "mobile") return "ogenic-app";
  return "unknown";
}

function poolForModel(model: string) {
  return model === "gpt-5.6-sol" || model === "gpt-6-astra" ? "standard" : "high_volume";
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

async function rememberSessionRef(
  db: D1Like,
  sourceSurface: string,
  sessionRef: string,
  sessionUrl: string | null,
  sessionLabel: string | null,
  sequence: number,
) {
  if (!sessionRef || !sequence) return;
  const now = Date.now();
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
         ELSE MIN(chat_session_refs.first_sequence, excluded.first_sequence)
       END,
       last_sequence = CASE
         WHEN chat_session_refs.last_sequence IS NULL THEN excluded.last_sequence
         ELSE MAX(chat_session_refs.last_sequence, excluded.last_sequence)
       END,
       last_seen_at = excluded.last_seen_at`,
  ).bind(
    makeId("session"), CONVERSATION_ID, sourceSurface, sessionRef, sessionUrl, sessionLabel,
    sequence, sequence, now, now,
  ).run();
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
    `UPDATE chat_conversations
     SET last_sequence = last_sequence + 1, updated_at = ?
     WHERE id = ?
     RETURNING last_sequence`,
  ).bind(Date.now(), CONVERSATION_ID).first<{ last_sequence: number }>();
  if (!row || !Number.isFinite(Number(row.last_sequence))) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");
  return Number(row.last_sequence);
}

function canonicalSessionLine(rows: ChatRow[]) {
  const selected: string[] = [];
  let used = 0;
  for (const row of rows) {
    const timestamp = Number.isFinite(Number(row.created_at))
      ? new Date(Number(row.created_at)).toISOString()
      : "unknown-time";
    const seq = Number.isFinite(Number(row.sequence_no)) ? `#${Number(row.sequence_no)}` : "#legacy";
    const surface = clean(row.source_surface || "legacy", 40) || "legacy";
    const line = `[${seq}][${surface}][${timestamp}] ${String(row.role).toUpperCase()}: ${clean(row.content, 1600)}`;
    const next = line.length + 1;
    if (selected.length >= 12 && used + next > HISTORY_CHAR_BUDGET) break;
    selected.push(line);
    used += next;
  }
  return selected.reverse().join("\n");
}

export function createChatModelApi() {
  const api = new Hono<Env>();

  api.get("/api/chat/history", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    await ensureConversation(db);
    const result = await db.prepare(
      `SELECT id, role, content, model, run_id, created_at, sequence_no, source_surface
       FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY sequence_no DESC, created_at DESC, rowid DESC
       LIMIT ?`,
    ).bind(CONVERSATION_ID, HISTORY_LIMIT).all<ChatRow>();
    const messages = [...(result.results ?? [])].reverse().map((message) => ({
      id: message.id,
      role: message.role,
      text: message.content,
      model: message.model ?? null,
      run_id: message.run_id ?? null,
      created_at: message.created_at,
      sequence_no: message.sequence_no ?? null,
      source_surface: message.source_surface ?? "legacy",
    }));
    return c.json({
      ok: true,
      conversation_id: CONVERSATION_ID,
      session_line: "1LSS_OWNER_MAIN",
      memory: "D1_SAME_MIND",
      messages,
    }, 200, { "Cache-Control": "no-store" });
  });

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
    const sourceSurface = resolveSurface(body, c.req.raw);
    const sessionRef = clean(body.session_ref ?? c.req.header("x-ogenic-session-ref"), 220);
    const sessionUrl = safeSessionUrl(body.session_url ?? c.req.header("x-ogenic-session-url"));
    const sessionLabel = clean(body.session_label ?? c.req.header("x-ogenic-session-label"), 160) || null;
    const attachmentIds = Array.isArray(body.attachment_ids)
      ? body.attachment_ids.map((value) => clean(value, 120)).filter(Boolean).slice(0, 4)
      : [];
    if (!prompt && !attachmentIds.length) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt or attachment is required" }, 400);
    }

    await ensureConversation(db);
    const requestKey = clean(c.req.header("idempotency-key") || makeId("1lss"), 180);
    const userIdempotency = `${requestKey}:user`;
    const assistantIdempotency = `${requestKey}:assistant`;

    const replay = await db.prepare(
      `SELECT content, model, sequence_no, source_surface, created_at
       FROM chat_messages
       WHERE conversation_id = ? AND idempotency_key = ?
       LIMIT 1`,
    ).bind(CONVERSATION_ID, assistantIdempotency).first<ChatRow>();
    if (replay?.content) {
      await rememberSessionRef(db, sourceSurface, sessionRef, sessionUrl, sessionLabel, Number(replay.sequence_no ?? 0));
      return c.json({
        ok: true,
        replay: true,
        text: replay.content,
        conversation_id: CONVERSATION_ID,
        memory: "D1_SAME_MIND",
        session_line: "1LSS_OWNER_MAIN",
        sequence_no: replay.sequence_no ?? null,
        source_surface: replay.source_surface ?? sourceSurface,
        model: replay.model ?? model,
        reasoning_effort: replay.model === "gpt-4.1-mini" ? "n/a" : effort,
        token_boost: boost,
        billing: "OPENAI_API",
      }, 200, { "Cache-Control": "no-store" });
    }

    const historyResult = await db.prepare(
      `SELECT role, content, created_at, sequence_no, source_surface
       FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY sequence_no DESC, created_at DESC, rowid DESC
       LIMIT ?`,
    ).bind(CONVERSATION_ID, HISTORY_LIMIT).all<ChatRow>();
    const history = canonicalSessionLine(historyResult.results ?? []);
    const d1Context = await readCanonicalD1Context(db, {
      git_sha: c.env.OGENIC_GIT_SHA,
      git_branch: c.env.OGENIC_GITHUB_BRANCH,
      build_uuid: c.env.OGENIC_BUILD_UUID,
      runtime: c.env.OGENIC_RUNTIME,
      phase: c.env.OGENIC_PHASE,
      version: c.env.CF_VERSION_METADATA ?? null,
    });
    const allowPaidFallback = body.allow_paid_fallback === true;
    const incentive = await readIncentiveSnapshot(db);
    const poolId = poolForModel(model);
    const pool = incentive.pools.find((row) => row.id === poolId);
    const guarded = pool?.state === "CRITICAL" || pool?.state === "EXHAUSTED";
    if (guarded && !allowPaidFallback) {
      return c.json({
        ok: false,
        code: "INCENTIVE_CAP_GUARD",
        message: poolId + " pool is " + (pool?.state ?? "guarded") + "; paid fallback is disabled",
        incentive_pool: poolId,
        routing_mode: incentive.routing_mode,
        paid_fallback: false,
      }, 429);
    }

    const r2AttachmentsForThisTurn: Array<{ attachment_id: string; stored_value: string; manifest: R2AttachmentManifest }> = [];
    const content: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: `You are Ammonite, OGENIC AI, the owner's continuous copilot.\n\n1LSS SESSION INVARIANT:\n- D1 conversation id "owner-main" is ONE canonical ordered life line. Web, OGENIC App, ChatGPT Dev harness, ChatGPT App harness, Live Assist, and approved agents are doors into that same line when they persist here.\n- source_surface is metadata only. Never create a second conversational truth for another surface.\n- sequence_no is the authoritative turn order. Prefer it over timestamps when deciding what happened latest.\n- The timeline below is chronological evidence. Do not replace it with a project's latest deployment, commit, runtime, or status unless the owner explicitly asks for project/system status.\n- Temporal references such as "ล่าสุด", "เมื่อกี้", "ก่อนหน้านี้", "last time", "earlier", and "previously" refer first to the newest relevant persisted interaction in this 1LSS line.\n- Distinguish "last interaction/conversation" from "latest project state/status". If wording could mean either, prefer the conversation timeline unless the owner names a project/system/status.\n- Never claim a surface was synchronized unless that turn exists in this D1 line or verified runtime evidence says so.\n- Never expose secrets or tokens in chat. Never guess a verified state.\n- Reply in the user's language and natural tone.\n\nCANONICAL 1LSS OWNER-MAIN (oldest to newest):\n${history || "No prior persisted messages."}\n\nCANONICAL D1 READ-ONLY CONTEXT + LIVE RUNTIME EVIDENCE:\n${d1Context.text}\n\nCURRENT OWNER MESSAGE [source=${sourceSurface}]:\n${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}`,
    }];

    const attachmentRowsForTurn: Array<{ id: string; row: AttachmentRow }> = [];
    for (const id of attachmentIds) {
      const row = await db.prepare(
        `SELECT filename, mime_type, data_base64, size_bytes FROM chat_attachments WHERE id = ? AND conversation_id = ?`,
      ).bind(id, CONVERSATION_ID).first<AttachmentRow>();
      if (!row) return c.json({ ok: false, code: "ATTACHMENT_NOT_FOUND", id }, 404);
      attachmentRowsForTurn.push({ id, row });
    }
    const totalAttachmentBytes = attachmentRowsForTurn.reduce((sum, item) => sum + Math.max(0, Number(item.row.size_bytes ?? 0)), 0);
    if (totalAttachmentBytes > 48 * 1024 * 1024) {
      return c.json({
        ok: false, code: "MODEL_INPUT_TOO_LARGE",
        message: "All attached files combined must remain below 48 MiB for direct model input; this upload is stored, but a chunked extraction path is required",
      }, 413);
    }
    for (const { id, row } of attachmentRowsForTurn) {
      if (row.mime_type.startsWith("image/") && Number(row.size_bytes ?? 0) > 20 * 1024 * 1024) {
        return c.json({
          ok: false, code: "MODEL_INPUT_TOO_LARGE",
          message: "An image exceeds the conservative 20 MiB per-image limit; the original remains stored",
          attachment_id: id,
        }, 413);
      }
      try {
        const storedReference = isR2AttachmentReference(row.data_base64)
          ? await resolveR2ReferenceToOpenAIFile(c.env as unknown as ChatAttachmentStorageEnv, row.data_base64)
          : null;
        if (storedReference?.file_id) {
          r2AttachmentsForThisTurn.push({ attachment_id: id, stored_value: row.data_base64, manifest: storedReference.manifest });
          if (row.mime_type.startsWith("image/")) {
            content.push({ type: "input_image", detail: "auto", file_id: storedReference.file_id });
          } else {
            content.push({ type: "input_file", file_id: storedReference.file_id, filename: row.filename });
          }
        } else if (row.mime_type.startsWith("image/")) {
          content.push({ type: "input_image", detail: "auto", image_url: `data:${row.mime_type};base64,${row.data_base64}` });
        } else {
          content.push({ type: "input_file", filename: row.filename, file_data: row.data_base64 });
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "ATTACHMENT_HANDOFF_FAILED";
        const code = message.split(":")[0];
        const status = message.startsWith("CONFIGURATION_REQUIRED") ? 503
          : code === "ATTACHMENT_NOT_FOUND" ? 404
          : code === "MODEL_INPUT_TOO_LARGE" ? 413
          : 409;
        return c.json({
          ok: false,
          code,
          attachment_id: id,
          message: status === 503
            ? "Large-file storage or model handoff is not configured"
            : code === "MODEL_INPUT_TOO_LARGE"
              ? "The file is stored, but its size requires a chunked extraction path"
              : "Attachment handoff could not be verified",
        }, status);
      }
    }
    const visibleUserText = `${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}${attachmentIds.length ? `\n\n[${attachmentIds.length} attachment(s)]` : ""}`;
    const existingUser = await db.prepare(
      `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
    ).bind(CONVERSATION_ID, userIdempotency).first<{ sequence_no: number }>();
    let userSequence = Number(existingUser?.sequence_no ?? 0);
    if (!userSequence) {
      const candidate = await nextSequence(db);
      await db.prepare(
        `INSERT OR IGNORE INTO chat_messages(
           id, conversation_id, role, content, model, run_id, created_at,
           sequence_no, source_surface, idempotency_key
         ) VALUES (?, ?, 'user', ?, NULL, NULL, ?, ?, ?, ?)`,
      ).bind(makeId("model_u"), CONVERSATION_ID, visibleUserText, Date.now(), candidate, sourceSurface, userIdempotency).run();
      const persistedUser = await db.prepare(
        `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
      ).bind(CONVERSATION_ID, userIdempotency).first<{ sequence_no: number }>();
      userSequence = Number(persistedUser?.sequence_no ?? candidate);
    }
    await rememberSessionRef(db, sourceSurface, sessionRef, sessionUrl, sessionLabel, userSequence);

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
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({})) as ResponsesBody;
    if (!response.ok) {
      return c.json({
        ok: false,
        code: result.error?.code ? `OPENAI_${String(result.error.code).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(result.error?.message ?? "OpenAI model request failed", 300),
        conversation_id: CONVERSATION_ID,
        user_sequence_no: userSequence,
      }, 502);
    }

    const text = outputText(result);
    if (!text) return c.json({ ok: false, code: "OPENAI_EMPTY_OUTPUT", user_sequence_no: userSequence }, 502);

    let fileHandoffState = r2AttachmentsForThisTurn.length ? "EVIDENCE_PENDING" : "NOT_APPLICABLE";
    if (r2AttachmentsForThisTurn.length) {
      try {
        for (const item of r2AttachmentsForThisTurn) {
          await recordR2FileHandoffEvidence(c.env as unknown as ChatAttachmentStorageEnv, item.manifest, "FILE_HANDOFF_COMPLETED");
          const handedOff = await markR2ReferenceHandedOff(c.env as unknown as ChatAttachmentStorageEnv, item.stored_value);
          if (!handedOff || handedOff.status !== "HANDED_OFF") throw new Error("HANDOFF_STATE_NOT_PERSISTED");
        }
        fileHandoffState = "HANDED_OFF";
      } catch {
        // The model has already returned a real response. Keep that response,
        // but never claim the card/1LSS state persisted when it did not.
        fileHandoffState = "EVIDENCE_PENDING";
      }
    }

    const usageTokens = Number(result.usage?.total_tokens ?? 0);
    await recordChatUsage(db, {
      conversationId: CONVERSATION_ID,
      sourceSurface,
      model,
      poolId,
      usageTokens,
      route: allowPaidFallback && guarded ? "paid_fallback" : "incentive_guarded",
    });

    const assistantCandidate = await nextSequence(db);
    await db.prepare(
      `INSERT OR IGNORE INTO chat_messages(
         id, conversation_id, role, content, model, run_id, created_at,
         sequence_no, source_surface, idempotency_key
       ) VALUES (?, ?, 'assistant', ?, ?, NULL, ?, ?, ?, ?)`,
    ).bind(makeId("model_a"), CONVERSATION_ID, text, model, Date.now(), assistantCandidate, sourceSurface, assistantIdempotency).run();
    const persistedAssistant = await db.prepare(
      `SELECT content, model, sequence_no, source_surface
       FROM chat_messages
       WHERE conversation_id = ? AND idempotency_key = ?
       LIMIT 1`,
    ).bind(CONVERSATION_ID, assistantIdempotency).first<ChatRow>();

    return c.json({
      ok: true,
      text: persistedAssistant?.content || text,
      conversation_id: CONVERSATION_ID,
      memory: "D1_SAME_MIND",
      session_line: "1LSS_OWNER_MAIN",
      user_sequence_no: userSequence,
      sequence_no: persistedAssistant?.sequence_no ?? assistantCandidate,
      source_surface: persistedAssistant?.source_surface ?? sourceSurface,
      model: persistedAssistant?.model ?? model,
      file_handoff_state: fileHandoffState,
      verified_attachment_count: fileHandoffState === "HANDED_OFF" ? r2AttachmentsForThisTurn.length : 0,
      reasoning_effort: model === "gpt-4.1-mini" ? "n/a" : effort,
      token_boost: boost,
      max_output_tokens: requestBody.max_output_tokens,
      billing: "OPENAI_API_ACCOUNT",
      incentive_pool: poolId,
      routing_mode: incentive.routing_mode,
      paid_fallback: allowPaidFallback,
      usage_tokens: usageTokens,
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
