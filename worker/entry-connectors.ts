import base from "./entry";
import { createConnectorAppApi, type ConnectorAppBindings } from "./connector-app-api";
import { createProviderConnectApi } from "./provider-connect-api";
import { createPublicHookApi, type ConnectorBindings } from "./connector-runtime";
import { createLiveAssistApi, type LiveAssistBindings } from "./live-assist-api";
import { createBrowserSessionApi, type BrowserSessionBindings } from "./browser-session-api";
import { createChatModelApi } from "./chat-model-api";
import { createManusApi } from "./manus-api";
import { createUnifiedChatApi, type UnifiedChatBindings } from "./unified-chat-api";
import { createInlineToolsApi, type InlineToolBindings } from "./inline-tools-api";
import { createLiveDoorApi, type LiveDoorBindings } from "./live-door-api";
import { createSessionRecoveryApi, type SessionRecoveryBindings } from "./session-recovery-api";

type Bindings = ConnectorAppBindings & ConnectorBindings & LiveAssistBindings & BrowserSessionBindings & UnifiedChatBindings & InlineToolBindings & LiveDoorBindings & SessionRecoveryBindings & { MANUS_API_KEY?: string };

const connectorApi = createConnectorAppApi();
const providerConnectApi = createProviderConnectApi();
const liveAssistApi = createLiveAssistApi();
const browserSessionApi = createBrowserSessionApi();
const chatModelApi = createChatModelApi();
const manusApi = createManusApi();
const unifiedChatApi = createUnifiedChatApi();
const inlineToolsApi = createInlineToolsApi();
const liveDoorApi = createLiveDoorApi();
const sessionRecoveryApi = createSessionRecoveryApi();
const publicHooks = createPublicHookApi();

const ONE_LINE_ID = "owner-main";
type ChatSurface = "ogenic-web" | "chatgpt-dev" | "external-harness";
type FunctionTurnBody = { prompt?: unknown; source_surface?: unknown };
type FunctionTurnResponse = {
  ok?: boolean;
  text?: unknown;
  model?: unknown;
  function_calls?: Array<{ name?: unknown; state?: unknown; call_id?: unknown }>;
};

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

async function ensureOneLine(env: Bindings) {
  if (!env.DB) return;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(ONE_LINE_ID, now, now).run();
}

async function nextOneLineSequence(env: Bindings) {
  if (!env.DB) return null;
  await ensureOneLine(env);
  const row = await env.DB.prepare(
    `UPDATE chat_conversations
     SET last_sequence = last_sequence + 1, updated_at = ?
     WHERE id = ?
     RETURNING last_sequence`,
  ).bind(Date.now(), ONE_LINE_ID).first<{ last_sequence: number }>();
  return row && Number.isFinite(Number(row.last_sequence)) ? Number(row.last_sequence) : null;
}

async function appendOneLine(
  env: Bindings,
  role: "user" | "assistant" | "system",
  content: string,
  sourceSurface: string,
  idempotencyKey: string,
  model: string | null = null,
) {
  if (!env.DB || !content.trim()) return null;
  await ensureOneLine(env);
  const existing = await env.DB.prepare(
    `SELECT sequence_no FROM chat_messages
     WHERE conversation_id = ? AND idempotency_key = ?
     LIMIT 1`,
  ).bind(ONE_LINE_ID, idempotencyKey).first<{ sequence_no: number }>();
  if (existing?.sequence_no) return Number(existing.sequence_no);

  const sequence = await nextOneLineSequence(env);
  if (!sequence) return null;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO chat_messages(
       id, conversation_id, role, content, model, run_id, created_at,
       sequence_no, source_surface, idempotency_key
     ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).bind(
    `1lss_${crypto.randomUUID()}`,
    ONE_LINE_ID,
    role,
    clip(content, 7000),
    model,
    Date.now(),
    sequence,
    clip(sourceSurface, 60) || "plugin-harness",
    clip(idempotencyKey, 220),
  ).run();
  return sequence;
}

async function stampFunctionTurn(request: Request, response: Response, env: Bindings) {
  if (!env.DB || !response.ok) return;
  const body = await request.json().catch(() => ({})) as FunctionTurnBody;
  const result = await response.clone().json().catch(() => ({})) as FunctionTurnResponse;
  if (!result.ok) return;

  const prompt = clip(body.prompt, 7000);
  const text = clip(result.text, 7000);
  const requestedSurface = clip(body.source_surface || request.headers.get("x-ogenic-surface"), 60).toLowerCase();
  const sourceSurface = requestedSurface || "plugin-harness";
  const requestKey = clip(request.headers.get("idempotency-key"), 180) || `plugin_${crypto.randomUUID()}`;

  if (prompt) await appendOneLine(env, "user", prompt, sourceSurface, `${requestKey}:user`);
  for (const call of result.function_calls ?? []) {
    const name = clip(call.name, 100) || "unknown";
    const state = clip(call.state, 100) || "RESULT";
    const callId = clip(call.call_id, 120) || crypto.randomUUID();
    await appendOneLine(env, "system", `[TOOL ${name}] ${state}`, sourceSurface, `${requestKey}:tool:${callId}`);
  }
  if (text) {
    await appendOneLine(env, "assistant", text, sourceSurface, `${requestKey}:assistant`, clip(result.model, 100) || null);
  }
}

async function canonicalChatModelRequest(request: Request, sourceSurface?: ChatSurface) {
  const url = new URL(request.url);
  url.pathname = "/api/chat/model";

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (sourceSurface && raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed.source_surface) parsed.source_surface = sourceSurface;
        body = JSON.stringify(parsed);
      } catch {
        body = raw;
      }
    } else {
      body = raw || undefined;
    }
  }

  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body,
    redirect: request.redirect,
  });
}

export default {
  async fetch(request: Request, env: Bindings, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/provider-connect" || pathname.startsWith("/api/provider-connect/")) {
      return providerConnectApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/live-assist") {
      return liveAssistApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/browser-session" || pathname.startsWith("/api/browser-session/")) {
      return browserSessionApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/live-door") {
      return liveDoorApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/1lss/history-page" || pathname === "/api/1lss/sessions" || pathname.startsWith("/api/1lss/sessions/")) {
      return sessionRecoveryApi.fetch(request, env, ctx as never);
    }
    if (
      pathname === "/api/chat/ephemeral" ||
      pathname === "/api/1lss/event" ||
      pathname === "/api/1lss/events"
    ) {
      return unifiedChatApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/inline/tool") {
      return inlineToolsApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/chat/history") {
      return chatModelApi.fetch(request, env, ctx as never);
    }
    if (
      pathname === "/api/chat/model" ||
      pathname === "/api/chat" ||
      pathname === "/api/chat/api" ||
      pathname === "/api/1lss/chat"
    ) {
      const sourceSurface: ChatSurface | undefined = pathname === "/api/chat"
        ? "ogenic-web"
        : pathname === "/api/chat/api"
          ? "chatgpt-dev"
          : pathname === "/api/1lss/chat"
            ? "external-harness"
            : undefined;
      const canonicalRequest = pathname === "/api/chat/model"
        ? request
        : await canonicalChatModelRequest(request, sourceSurface);
      return chatModelApi.fetch(canonicalRequest, env, ctx as never);
    }
    if (pathname === "/api/manus/status" || pathname === "/api/manus/task") {
      return manusApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/chat/functions") {
      const stampRequest = request.clone();
      const response = await connectorApi.fetch(request, env, ctx as never);
      await stampFunctionTurn(stampRequest, response, env).catch(() => undefined);
      return response;
    }
    if (
      pathname === "/api/connectors" ||
      pathname.startsWith("/api/connectors/") ||
      pathname.startsWith("/api/openai/")
    ) {
      return connectorApi.fetch(request, env, ctx as never);
    }
    if (pathname.startsWith("/hooks/")) {
      return publicHooks.fetch(request, env, ctx as never);
    }
    return base.fetch(request, env as never, ctx);
  },
  scheduled(controller: unknown, env: Bindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    return base.scheduled(controller, env as never, ctx);
  },
};
