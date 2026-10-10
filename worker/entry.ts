import { Hono, type Context, type Next } from "hono";
import legacyApp from "./index";
import incentiveApi from "./incentive-api";
import {
  createWorkflowEngine,
  type CredentialResolver,
  type Json,
  type WorkflowBindings,
  type WorkflowDefinition,
  type WorkflowPolicy,
} from "./workflow-engine";
import { createCodexPatchAdapter, createOpenAIGenerateAdapter } from "./openai-runtime";
import { createAuthApi, hasOwnerSession } from "./app-auth";
import { createAppApi, type AppBindings } from "./app-api";
import {
  abortR2AttachmentUpload,
  beginR2AttachmentUpload,
  chatAttachmentStorageStatus,
  completeR2AttachmentUpload,
  loadR2AttachmentManifest,
  parseR2AttachmentReference,
  r2AttachmentReference,
  resolveR2ReferenceToOpenAIFile,
  readR2AttachmentObject,
  uploadR2AttachmentPart,
  R2_ATTACHMENT_MAX_BYTES,
  R2_ATTACHMENT_PART_SIZE,
  type ChatAttachmentStorageEnv,
  type R2BucketLike,
  type R2UploadedPartLike,
} from "./chat-attachment-storage";
import policyConfig from "../config/workflow-engine.staging.json";
import linearCodexDraftPr from "../workflows/linear-codex-draft-pr.v1.json";
import openaiChat from "../workflows/openai-chat.v1.json";
import smokeWorkflow from "../workflows/workflow-engine-smoke.v1.json";

type RootBindings = WorkflowBindings & AppBindings & { OPENAI_API_KEY?: string; CHAT_UPLOADS?: R2BucketLike };
type RootEnv = { Bindings: RootBindings };
type OpenAIRuntimeBindings = RootBindings;

type EngineRunResponse = {
  ok?: boolean;
  run?: { id?: string; status?: string };
  nodes?: Array<{ node_id?: string; output_json?: string | null; error_json?: string | null }>;
  code?: string;
  message?: string;
};

type ChatHistoryRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  run_id: string | null;
  created_at: number;
};

type ChatAttachmentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
};

type ChatAttachmentUpload = {
  filename?: unknown;
  mime_type?: unknown;
  data_url?: unknown;
};

const SAME_MIND_CONVERSATION_ID = "owner-main";
const SAME_MIND_OWNER_ID = "owner";
const MAX_CHAT_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 4_000_000;
const MAX_ATTACHMENT_DATA_URL_CHARS = 5_500_000;
const ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ATTACHMENT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
const ALLOWED_R2_ATTACHMENT_MIME = new Set([
  ...ALLOWED_ATTACHMENT_MIME,
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
]);
const SAME_MIND_CORE = `You are OGENIC AI, the continuous owner copilot for OGENIC Phase VI. Maintain continuity from the supplied recent conversation instead of behaving like a blank new assistant.
Canonical operating context: staging only; active branch is phase-vi-provider-incentive-metering; never touch main or production unless the owner explicitly approves it; OGENIC_OPS_KEY is owner-only and secrets must stay server-side; Cloudflare Worker plus D1 are the durable control plane; GitHub, Linear and n8n access must stay behind server-side adapters; the current product surfaces are Overview, AI Chat, Live Tools, Workflows and Tasks.
Interpret short follow-ups using recent context when it resolves the reference. Do not ask the owner to repeat information that is already present in the supplied conversation. If context is genuinely insufficient, state exactly what is missing. Reply in the user's language and natural tone. This model call has no tools, so never claim an external action was performed unless the supplied context says it was already completed. Never reveal credentials or secrets.`;

function scopedRuntimeCredentials(env: WorkflowBindings): CredentialResolver {
  const runtime = env as OpenAIRuntimeBindings;
  return {
    resolve: async (request) => {
      if (request.environment !== "staging") throw new Error("POLICY_DENIED:credential environment");
      if (request.provider !== "openai") throw new Error(`CONFIGURATION_REQUIRED:${request.provider} credential resolver is not bound`);
      if (request.operation !== "openai.generate@1" && request.operation !== "codex.patch@1") {
        throw new Error(`POLICY_DENIED:credential operation ${request.operation}`);
      }
      const key = String(runtime.OPENAI_API_KEY ?? "").trim();
      if (!key) throw new Error("CONFIGURATION_REQUIRED:OPENAI_API_KEY");
      return { OPENAI_API_KEY: key };
    },
  };
}

const engine = createWorkflowEngine({
  policy: policyConfig as unknown as WorkflowPolicy,
  bundledWorkflows: [
    linearCodexDraftPr as unknown as WorkflowDefinition,
    openaiChat as unknown as WorkflowDefinition,
    smokeWorkflow as unknown as WorkflowDefinition,
  ],
  runtimeAdapters: {
    "openai.generate@1": (env) => createOpenAIGenerateAdapter(env),
    "codex.patch@1": (env) => createCodexPatchAdapter(env),
  },
  credentialResolver: scopedRuntimeCredentials,
});

const root = new Hono<RootEnv>();
root.route("/", createAuthApi());

const ownerOnly = async (c: Context<RootEnv>, next: Next) => {
  if (!(await hasOwnerSession(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
  }
  await next();
};

function requireDb(env: RootBindings) {
  const db = env.DB;
  if (!db) throw new Error("CONFIGURATION_REQUIRED:D1");
  return db;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function clipUtf8(value: string, maxBytes: number) {
  if (utf8Bytes(value) <= maxBytes) return value;
  let clipped = value;
  while (clipped.length > 16 && utf8Bytes(clipped) > Math.max(16, maxBytes - 4)) {
    clipped = clipped.slice(0, Math.max(16, Math.floor(clipped.length * 0.84)));
  }
  return `${clipped.trimEnd()}…`;
}

function cleanAttachmentName(value: unknown) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
}

function normalizeAttachmentMime(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 120);
}

function parseBase64DataUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ATTACHMENT_DATA_URL_CHARS) return null;
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const data = match[2].replace(/[\r\n]/g, "");
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, Math.floor(data.length * 3 / 4) - padding);
  return { mime, data, bytes };
}

async function ensureSameMindConversation(env: RootBindings) {
  const db = requireDb(env);
  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(SAME_MIND_CONVERSATION_ID, SAME_MIND_OWNER_ID, "OGENIC SAME MIND", now, now).run();
}

async function readSameMindHistory(env: RootBindings, limit = 24) {
  const db = requireDb(env);
  await ensureSameMindConversation(env);
  const result = await db.prepare(
    `SELECT id, role, content, model, run_id, created_at
     FROM chat_messages
     WHERE conversation_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).bind(SAME_MIND_CONVERSATION_ID, limit).all();
  const rows = (result.results ?? []) as unknown as ChatHistoryRow[];
  return rows.reverse();
}

async function readAttachmentRows(env: RootBindings, ids: string[]) {
  const db = requireDb(env);
  const rows: ChatAttachmentRow[] = [];
  for (const id of ids) {
    const row = await db.prepare(
      `SELECT id, filename, mime_type, size_bytes, created_at
       FROM chat_attachments
       WHERE id = ? AND conversation_id = ?`,
    ).bind(id, SAME_MIND_CONVERSATION_ID).first<ChatAttachmentRow>();
    if (row) rows.push(row);
  }
  return rows;
}

async function saveSameMindMessage(
  env: RootBindings,
  message: { id: string; role: ChatHistoryRow["role"]; content: string; model?: string | null; runId?: string | null },
) {
  const db = requireDb(env);
  const now = Date.now();
  await ensureSameMindConversation(env);
  await db.prepare(
    `INSERT OR IGNORE INTO chat_messages (id, conversation_id, role, content, model, run_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    message.id,
    SAME_MIND_CONVERSATION_ID,
    message.role,
    message.content,
    message.model ?? null,
    message.runId ?? null,
    now,
  ).run();
  await db.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ?")
    .bind(now, SAME_MIND_CONVERSATION_ID)
    .run();
}

function sameMindPrompt(history: ChatHistoryRow[], currentPrompt: string) {
  const transcript: string[] = [];
  let transcriptBytes = 0;
  for (const message of [...history].reverse()) {
    const line = `${message.role.toUpperCase()}: ${clipUtf8(message.content, 900)}`;
    const lineBytes = utf8Bytes(line) + 1;
    if (transcriptBytes + lineBytes > 2700) break;
    transcript.unshift(line);
    transcriptBytes += lineBytes;
  }
  const recent = transcript.length ? transcript.join("\n") : "No prior persisted messages yet. Use the canonical operating context above.";
  const current = clipUtf8(currentPrompt, 7000);
  return `${SAME_MIND_CORE}\n\nRECENT PERSISTED CONVERSATION (oldest to newest):\n${recent}\n\nCURRENT OWNER MESSAGE:\n${current}\n\nAnswer the CURRENT OWNER MESSAGE while preserving continuity with the context above.`;
}

// Register owner guards on the root router before mounting the v0.2 app API.
// This keeps flattened routes protected even if sub-router path semantics change.
root.use("/api/dashboard", ownerOnly);
root.use("/api/tools", ownerOnly);
root.use("/api/tasks", ownerOnly);
root.route("/", createAppApi());

root.use("/api/chat", ownerOnly);
root.use("/api/chat/*", ownerOnly);

root.get("/api/chat/history", async (c) => {
  const messages = await readSameMindHistory(c.env, 60);
  return c.json({
    ok: true,
    conversation_id: SAME_MIND_CONVERSATION_ID,
    memory: "D1_SAME_MIND",
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.content,
      model: message.model,
      run_id: message.run_id,
      created_at: message.created_at,
    })),
  });
});

root.get("/api/chat/attachments/status", async (c) => {
  const state = chatAttachmentStorageStatus(c.env as unknown as ChatAttachmentStorageEnv);
  let attachments: Array<Record<string, unknown>> = [];
  try {
    const rows = await requireDb(c.env).prepare(
      `SELECT id, filename, mime_type, data_base64, size_bytes, created_at
       FROM chat_attachments
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 8`,
    ).bind(SAME_MIND_CONVERSATION_ID).all<{
      id: string; filename: string; mime_type: string; data_base64: string; size_bytes: number; created_at: number;
    }>();
    attachments = await Promise.all((rows.results ?? []).map(async (row) => {
      const handle = parseR2AttachmentReference(row.data_base64);
      if (!handle) {
        return { id: row.id, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes, status: "LEGACY_SMALL_FILE", can_handoff: true, created_at: row.created_at };
      }
      try {
        const manifest = await loadR2AttachmentManifest(c.env as unknown as ChatAttachmentStorageEnv, handle);
        const status = !manifest ? "BLOCKED" : manifest.status === "HANDED_OFF" ? "HANDED_OFF" : manifest.status;
        return { id: row.id, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes, status, can_handoff: Boolean(manifest && (manifest.status === "UPLOADED" || manifest.status === "HANDED_OFF")), created_at: row.created_at };
      } catch {
        return { id: row.id, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes, status: "CONFIGURATION_REQUIRED", can_handoff: false, created_at: row.created_at };
      }
    }));
  } catch {
    // Status remains useful when D1 is missing; never infer that files exist.
  }
  return c.json({ ...state, latest_attachments: attachments }, 200, { "Cache-Control": "no-store" });
});

root.post("/api/chat/attachments/multipart", async (c) => {
  const body = await c.req.json<{ filename?: unknown; mime_type?: unknown; size_bytes?: unknown }>().catch(() => ({}));
  const filename = cleanAttachmentName(body.filename);
  const mime = normalizeAttachmentMime(body.mime_type);
  const size = Number(body.size_bytes);
  const idempotencyKey = String(c.req.header("Idempotency-Key") ?? "").trim();
  if (!filename || !mime || !Number.isSafeInteger(size)) return c.json({ ok: false, code: "INVALID_ATTACHMENT_METADATA" }, 400);
  if (!ALLOWED_R2_ATTACHMENT_MIME.has(mime)) return c.json({ ok: false, code: "UNSUPPORTED_ATTACHMENT_TYPE", mime_type: mime }, 415);
  if (size <= MAX_ATTACHMENT_BYTES || size > R2_ATTACHMENT_MAX_BYTES) return c.json({ ok: false, code: "ATTACHMENT_SIZE_OUT_OF_RANGE", min_bytes_exclusive: MAX_ATTACHMENT_BYTES, max_bytes: R2_ATTACHMENT_MAX_BYTES }, 413);
  if (!idempotencyKey || idempotencyKey.length > 240) return c.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
  try {
    const manifest = await beginR2AttachmentUpload(c.env as unknown as ChatAttachmentStorageEnv, {
      filename, mime_type: mime, size_bytes: size, idempotency_key: idempotencyKey,
    });
    if (manifest.status === "UPLOADED" || manifest.status === "HANDED_OFF") {
      await ensureSameMindConversation(c.env);
      await requireDb(c.env).prepare(
        `INSERT OR IGNORE INTO chat_attachments(id, conversation_id, filename, mime_type, data_base64, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(manifest.attachment_id, SAME_MIND_CONVERSATION_ID, manifest.filename, manifest.mime_type, r2AttachmentReference(manifest.handle), manifest.size_bytes, manifest.created_at).run();
      return c.json({ ok: true, attachment: { id: manifest.attachment_id, filename: manifest.filename, mime_type: manifest.mime_type, size_bytes: manifest.size_bytes, storage: "R2", status: manifest.status, handoff_state: manifest.openai_file_id ? "HANDED_OFF" : "PENDING" } }, 200);
    }
    return c.json({ ok: true, upload: { handle: manifest.handle, part_size_bytes: manifest.part_size_bytes, total_parts: manifest.total_parts, size_bytes: manifest.size_bytes, expires_at: manifest.expires_at, status: manifest.status } }, 201);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.split(":")[0] : "UPLOAD_START_FAILED";
    const configurationRequired = String(cause instanceof Error ? cause.message : "").startsWith("CONFIGURATION_REQUIRED");
    return c.json({ ok: false, code: configurationRequired ? String(cause instanceof Error ? cause.message : code) : code }, configurationRequired ? 503 : code === "ATTACHMENT_SIZE_OUT_OF_RANGE" ? 413 : 400);
  }
});

root.put("/api/chat/attachments/multipart/:handle/parts/:partNumber", async (c) => {
  const handle = c.req.param("handle");
  const partNumber = Number(c.req.param("partNumber"));
  const storageEnv = c.env as unknown as ChatAttachmentStorageEnv;
  try {
    const manifest = await loadR2AttachmentManifest(storageEnv, handle);
    if (!manifest) return c.json({ ok: false, code: "UPLOAD_SESSION_NOT_FOUND" }, 404);
    if (manifest.status !== "UPLOADING") return c.json({ ok: false, code: "UPLOAD_SESSION_NOT_OPEN", status: manifest.status }, 409);
    if (!c.req.raw.body) return c.json({ ok: false, code: "UPLOAD_PART_BODY_REQUIRED" }, 400);
    // Buffer only one bounded 8 MiB part, never the entire large file.
    const bytes = await c.req.arrayBuffer();
    const part = await uploadR2AttachmentPart(storageEnv, manifest, partNumber, bytes);
    return c.json({ ok: true, part: { part_number: part.partNumber, etag: part.etag }, part_size_bytes: bytes.byteLength }, 200, { "Cache-Control": "no-store" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "UPLOAD_PART_FAILED";
    const code = message.split(":")[0];
    const status = message.startsWith("CONFIGURATION_REQUIRED") ? 503 : message === "UPLOAD_SESSION_EXPIRED" ? 410 : 400;
    return c.json({ ok: false, code }, status);
  }
});

root.post("/api/chat/attachments/multipart/:handle/complete", async (c) => {
  const handle = c.req.param("handle");
  const body = await c.req.json<{ parts?: unknown }>().catch(() => ({}));
  const parts: R2UploadedPartLike[] = Array.isArray(body.parts) ? body.parts.map((item) => {
    const part = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { partNumber: Number(part.part_number ?? part.partNumber), etag: String(part.etag ?? "") };
  }) : [];
  const storageEnv = c.env as unknown as ChatAttachmentStorageEnv;
  try {
    const manifest = await loadR2AttachmentManifest(storageEnv, handle);
    if (!manifest) return c.json({ ok: false, code: "UPLOAD_SESSION_NOT_FOUND" }, 404);
    const completed = await completeR2AttachmentUpload(storageEnv, manifest, parts);
    await ensureSameMindConversation(c.env);
    const db = requireDb(c.env);
    const now = Date.now();
    await db.prepare("DELETE FROM chat_attachments WHERE created_at < ?").bind(now - ATTACHMENT_TTL_MS).run();
    await db.prepare(
      `INSERT OR IGNORE INTO chat_attachments(id, conversation_id, filename, mime_type, data_base64, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(completed.attachment_id, SAME_MIND_CONVERSATION_ID, completed.filename, completed.mime_type, r2AttachmentReference(completed.handle), completed.size_bytes, completed.created_at).run();
    return c.json({
      ok: true,
      attachment: { id: completed.attachment_id, filename: completed.filename, mime_type: completed.mime_type, size_bytes: completed.size_bytes, storage: "R2", status: completed.status, handoff_state: completed.openai_file_id ? "HANDED_OFF" : "PENDING", reference: completed.attachment_id },
      gate: { protocol: "CCS/1.0", state: "UPLOADED", direct_execution_bypass: false },
    }, 201, { "Cache-Control": "no-store" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "UPLOAD_COMPLETE_FAILED";
    const code = message.split(":")[0];
    const status = message.startsWith("CONFIGURATION_REQUIRED") ? 503 : message === "UPLOAD_SESSION_EXPIRED" ? 410 : 400;
    return c.json({ ok: false, code }, status);
  }
});

root.delete("/api/chat/attachments/multipart/:handle", async (c) => {
  const handle = c.req.param("handle");
  const storageEnv = c.env as unknown as ChatAttachmentStorageEnv;
  try {
    const manifest = await loadR2AttachmentManifest(storageEnv, handle);
    if (!manifest) return c.json({ ok: false, code: "UPLOAD_SESSION_NOT_FOUND" }, 404);
    const result = await abortR2AttachmentUpload(storageEnv, manifest);
    return c.json({ ok: true, handle: result.handle, status: result.status }, 200, { "Cache-Control": "no-store" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "UPLOAD_ABORT_FAILED";
    return c.json({ ok: false, code: message.split(":")[0] }, message.startsWith("CONFIGURATION_REQUIRED") ? 503 : 400);
  }
});

root.post("/api/chat/attachments/:id/handoff", async (c) => {
  const id = c.req.param("id");
  try {
    const row = await requireDb(c.env).prepare(
      `SELECT id, filename, mime_type, data_base64, size_bytes FROM chat_attachments WHERE id = ? AND conversation_id = ? LIMIT 1`,
    ).bind(id, SAME_MIND_CONVERSATION_ID).first<{ id: string; filename: string; mime_type: string; data_base64: string; size_bytes: number }>();
    if (!row) return c.json({ ok: false, code: "ATTACHMENT_NOT_FOUND" }, 404);
    if (!parseR2AttachmentReference(row.data_base64)) {
      return c.json({ ok: true, attachment: { id: row.id, filename: row.filename, size_bytes: row.size_bytes }, handoff: { state: "LEGACY_SMALL_FILE", path: "existing_chat_model_path" } }, 200, { "Cache-Control": "no-store" });
    }
    const resolved = await resolveR2ReferenceToOpenAIFile(c.env as unknown as ChatAttachmentStorageEnv, row.data_base64);
    return c.json({ ok: true, attachment: { id: row.id, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes }, handoff: { state: "HANDED_OFF", reference: row.id, storage: "R2", direct_execution_bypass: false, provider_file_ready: Boolean(resolved?.file_id) } }, 200, { "Cache-Control": "no-store" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "ATTACHMENT_HANDOFF_FAILED";
    const code = message.split(":")[0];
    const status = message.startsWith("CONFIGURATION_REQUIRED") ? 503 : code === "ATTACHMENT_NOT_FOUND" ? 404 : 409;
    return c.json({ ok: false, code }, status);
  }
});

root.get("/api/chat/attachments/:id/content", async (c) => {
  const id = c.req.param("id");
  try {
    const row = await requireDb(c.env).prepare(
      `SELECT id, filename, mime_type, data_base64, size_bytes FROM chat_attachments WHERE id = ? AND conversation_id = ? LIMIT 1`,
    ).bind(id, SAME_MIND_CONVERSATION_ID).first<{ id: string; filename: string; mime_type: string; data_base64: string; size_bytes: number }>();
    if (!row) return c.json({ ok: false, code: "ATTACHMENT_NOT_FOUND" }, 404);
    let stream: ReadableStream<Uint8Array>;
    if (parseR2AttachmentReference(row.data_base64)) {
      const resolved = await readR2AttachmentObject(c.env as unknown as ChatAttachmentStorageEnv, row.data_base64);
      if (!resolved?.object.body) return c.json({ ok: false, code: "R2_OBJECT_NOT_FOUND" }, 404);
      stream = resolved.object.body;
    } else {
      const bytes = Uint8Array.from(atob(row.data_base64), (character) => character.charCodeAt(0));
      stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    }
    const safeName = row.filename.replace(/[\r\n"]/g, "_");
    return new Response(stream, { status: 200, headers: {
      "Content-Type": row.mime_type, "Content-Length": String(row.size_bytes),
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "ATTACHMENT_READ_FAILED";
    const code = message.split(":")[0];
    return c.json({ ok: false, code }, message.startsWith("CONFIGURATION_REQUIRED") ? 503 : code === "ATTACHMENT_NOT_FOUND" ? 404 : 409);
  }
});

root.post("/api/chat/attachments", async (c) => {
  const body = await c.req.json<ChatAttachmentUpload>().catch(() => ({} as ChatAttachmentUpload));
  const filename = cleanAttachmentName(body.filename);
  const requestedMime = normalizeAttachmentMime(body.mime_type);
  const parsed = parseBase64DataUrl(body.data_url);

  if (!filename || !parsed) {
    return c.json({ ok: false, code: "INVALID_ATTACHMENT", message: "filename and base64 data_url are required" }, 400);
  }
  if (!ALLOWED_ATTACHMENT_MIME.has(parsed.mime) || (requestedMime && requestedMime !== parsed.mime)) {
    return c.json({ ok: false, code: "UNSUPPORTED_ATTACHMENT_TYPE", mime_type: parsed.mime }, 415);
  }
  if (parsed.bytes > MAX_ATTACHMENT_BYTES) {
    return c.json({ ok: false, code: "ATTACHMENT_TOO_LARGE", max_bytes: MAX_ATTACHMENT_BYTES }, 413);
  }

  await ensureSameMindConversation(c.env);
  const db = requireDb(c.env);
  const now = Date.now();
  await db.prepare("DELETE FROM chat_attachments WHERE created_at < ?")
    .bind(now - ATTACHMENT_TTL_MS)
    .run();

  const id = `att_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO chat_attachments(id, conversation_id, filename, mime_type, data_base64, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, SAME_MIND_CONVERSATION_ID, filename, parsed.mime, parsed.data, parsed.bytes, now).run();

  return c.json({ ok: true, attachment: { id, filename, mime_type: parsed.mime, size_bytes: parsed.bytes } }, 201);
});

// Thin UI facade over the durable workflow engine. Auth, D1 metering, GM cap guard,
// immutable workflow pinning and runtime credentials all stay inside the existing engine path.
root.post("/api/chat", async (c) => {
  const body = await c.req.json<{ prompt?: unknown; mode?: unknown; attachment_ids?: unknown }>()
    .catch(() => ({ prompt: undefined, mode: undefined, attachment_ids: undefined }));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const requestedMode = typeof body.mode === "string" ? body.mode.toLowerCase() : "balanced";
  const mode = requestedMode === "fast" || requestedMode === "power" || requestedMode === "balanced" ? requestedMode : "balanced";
  const attachmentIds = Array.isArray(body.attachment_ids)
    ? body.attachment_ids.map((value) => String(value ?? "").trim()).filter(Boolean).slice(0, MAX_CHAT_ATTACHMENTS)
    : [];

  if (!prompt && attachmentIds.length === 0) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt or attachment is required" }, 400);
  if (utf8Bytes(prompt) > 7_000) {
    return c.json({ ok: false, code: "INPUT_TOO_LARGE", message: "chat prompt exceeds SAME MIND staging limit" }, 413);
  }

  const attachmentRows = attachmentIds.length ? await readAttachmentRows(c.env, attachmentIds) : [];
  if (attachmentRows.length !== attachmentIds.length) {
    return c.json({ ok: false, code: "ATTACHMENT_NOT_FOUND", message: "one or more attachments expired or are unavailable" }, 404);
  }

  const attachmentNote = attachmentRows.length
    ? `\n\n[Attached: ${attachmentRows.map((row) => `${row.filename} (${row.mime_type})`).join(", ")}]`
    : "";
  const ownerPrompt = `${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}${attachmentNote}`;

  const opsKey = String(c.env.OGENIC_OPS_KEY ?? "").trim();
  if (!opsKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_OPS_KEY" }, 503);
  const authorization = `Bearer ${opsKey}`;
  const triggerKey = (c.req.header("idempotency-key") ?? `ui_${crypto.randomUUID()}`).slice(0, 240);
  const safeTriggerKey = triggerKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);

  const history = await readSameMindHistory(c.env, 24);
  await saveSameMindMessage(c.env, {
    id: `u_${safeTriggerKey}`,
    role: "user",
    content: ownerPrompt,
  });
  const compiledPrompt = sameMindPrompt(history, ownerPrompt);

  const startResponse = await engine.api.request(
    "/workflows/openai-chat/runs",
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "Idempotency-Key": triggerKey,
      },
      body: JSON.stringify({ input: { prompt: compiledPrompt, mode, attachment_ids: attachmentIds } satisfies Json }),
    },
    c.env,
  );
  const started = await startResponse.json().catch(() => ({})) as EngineRunResponse;
  if (!startResponse.ok) {
    return new Response(JSON.stringify(started), {
      status: startResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const runId = started.run?.id;
  if (!runId) return c.json({ ok: false, code: "RUN_START_FAILED" }, 500);

  await engine.tick(c.env, `ui_${runId}`);

  const runResponse = await engine.api.request(
    `/runs/${encodeURIComponent(runId)}`,
    { headers: { Authorization: authorization } },
    c.env,
  );
  const runState = await runResponse.json().catch(() => ({})) as EngineRunResponse;
  if (!runResponse.ok) {
    return new Response(JSON.stringify(runState), {
      status: runResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const node = (runState.nodes ?? []).find((candidate) => candidate.node_id === "respond");
  if (runState.run?.status === "succeeded" && node?.output_json) {
    try {
      const output = JSON.parse(node.output_json) as Record<string, unknown>;
      const text = typeof output.text === "string" ? output.text : "";
      const model = typeof output.model === "string" ? output.model : null;
      if (text) {
        await saveSameMindMessage(c.env, {
          id: `a_${runId}`,
          role: "assistant",
          content: text,
          model,
          runId,
        });
      }
      return c.json({
        ok: true,
        run_id: runId,
        conversation_id: SAME_MIND_CONVERSATION_ID,
        memory: "D1_SAME_MIND",
        text,
        model,
        mode: typeof output.mode === "string" ? output.mode : mode,
        incentive_pool: typeof output.incentive_pool === "string" ? output.incentive_pool : null,
        fallback_reason: typeof output.fallback_reason === "string" ? output.fallback_reason : null,
      });
    } catch {
      return c.json({ ok: false, code: "INVALID_RUNTIME_OUTPUT", run_id: runId }, 502);
    }
  }

  if (runState.run?.status === "failed" || runState.run?.status === "blocked") {
    return c.json({ ok: false, code: "CHAT_RUN_FAILED", run_id: runId, message: node?.error_json ?? "runtime failed" }, 502);
  }

  return c.json({ ok: false, code: "CHAT_RUN_PENDING", run_id: runId, status: runState.run?.status ?? "queued" }, 202);
});

root.route("/", engine.api);
root.route("/", incentiveApi);
root.route("/", legacyApp);

export default {
  fetch(request: Request, env: RootBindings, ctx: unknown) {
    return root.fetch(request, env, ctx as never);
  },
  scheduled(_controller: unknown, env: WorkflowBindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(engine.tick(env).then(() => undefined));
  },
};