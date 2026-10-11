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
import { observeDiscordResponse, type DiscordAlertBindings } from "./discord-alerts";
import { createAppApi, type AppBindings } from "./app-api";
import policyConfig from "../config/workflow-engine.staging.json";
import linearCodexDraftPr from "../workflows/linear-codex-draft-pr.v1.json";
import openaiChat from "../workflows/openai-chat.v1.json";
import smokeWorkflow from "../workflows/workflow-engine-smoke.v1.json";

type RootBindings = WorkflowBindings & AppBindings & DiscordAlertBindings & { OPENAI_API_KEY?: string };
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
  async fetch(request: Request, env: RootBindings, ctx: unknown) {
    const response = await root.fetch(request, env, ctx as never);
    observeDiscordResponse(env, request, response, ctx as { waitUntil?: (promise: Promise<unknown>) => void });
    return response;
  },
  scheduled(_controller: unknown, env: WorkflowBindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(engine.tick(env).then(() => undefined));
  },
};