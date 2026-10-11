import base from "./entry";
import { hasOwnerSession } from "./app-auth";
import { createConnectorAppApi, type ConnectorAppBindings } from "./connector-app-api";
import { createProviderConnectApi } from "./provider-connect-api";
import { createPublicHookApi, type ConnectorBindings } from "./connector-runtime";
import { createLiveAssistApi, type LiveAssistBindings } from "./live-assist-api";
import { createBrowserSessionApi, type BrowserSessionBindings } from "./browser-session-api";
import { createChatModelApi } from "./chat-model-api";
import { createAthenaChatApi, type AthenaChatBindings } from "./athena-chat-api";
import { createManusApi } from "./manus-api";
import { createUnifiedChatApi, type UnifiedChatBindings } from "./unified-chat-api";
import { createInlineToolsApi, type InlineToolBindings } from "./inline-tools-api";
import { createLiveDoorApi, type LiveDoorBindings } from "./live-door-api";
import { createSessionRecoveryApi, type SessionRecoveryBindings } from "./session-recovery-api";

type Bindings = ConnectorAppBindings & ConnectorBindings & AthenaChatBindings & LiveAssistBindings & BrowserSessionBindings & UnifiedChatBindings & InlineToolBindings & LiveDoorBindings & SessionRecoveryBindings & { MANUS_API_KEY?: string };

const connectorApi = createConnectorAppApi();
const providerConnectApi = createProviderConnectApi();
const liveAssistApi = createLiveAssistApi();
const browserSessionApi = createBrowserSessionApi();
const chatModelApi = createChatModelApi();
const athenaChatApi = createAthenaChatApi();
const manusApi = createManusApi();
const unifiedChatApi = createUnifiedChatApi();
const inlineToolsApi = createInlineToolsApi();
const liveDoorApi = createLiveDoorApi();
const sessionRecoveryApi = createSessionRecoveryApi();
const publicHooks = createPublicHookApi();

const ONE_LINE_ID = "owner-main";
type ChatSurface = "ogenic-web" | "chatgpt-dev" | "external-harness";
type FunctionTurnBody = { prompt?: unknown; source_surface?: unknown; idempotency_key?: unknown; attachment_ids?: unknown };
type FunctionTurnResponse = {
  ok?: boolean;
  text?: unknown;
  model?: unknown;
  runtime?: unknown;
  agent_session_id?: unknown;
  function_calls?: Array<{ name?: unknown; state?: unknown; call_id?: unknown }>;
};

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function redactOneLineContent(value: unknown) {
  return clip(value, 7000)
    .replace(/sk-[a-z0-9_-]{10,}/gi, "[REDACTED_SECRET]")
    .replace(/gh[pousr]_[a-z0-9_]{10,}/gi, "[REDACTED_SECRET]")
    .replace(/bearer\s+[a-z0-9._~+/-]{10,}/gi, "Bearer [REDACTED_SECRET]")
    .replace(/((?:password|passwd|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*)\S+/gi, "$1[REDACTED_SECRET]");
}

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
  runId: string | null = null,
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `1lss_${crypto.randomUUID()}`,
    ONE_LINE_ID,
    role,
    redactOneLineContent(content),
    model,
    runId,
    Date.now(),
    sequence,
    clip(sourceSurface, 60) || "plugin-harness",
    clip(idempotencyKey, 220),
  ).run();
  const saved = await env.DB.prepare(
    `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
  ).bind(ONE_LINE_ID, idempotencyKey).first<{ sequence_no: number }>();
  return saved?.sequence_no ? Number(saved.sequence_no) : null;
}

type TurnStartState = "SAVED" | "UNAVAILABLE" | "FAILED" | "NOT_APPLICABLE";
type PreparedTurn = {
  request: Request;
  requestKey: string | null;
  sourceSurface: string | null;
  state: TurnStartState;
  userSequence: number | null;
  failureCode?: string;
};

const CONTINUITY_PATHS = new Set([
  "/api/chat", "/api/chat/api", "/api/1lss/chat", "/api/chat/model",
  "/api/chat/athena", "/api/chat/agent", "/api/chat/functions",
]);
const CONTINUITY_SURFACES = new Set([
  "ogenic-web", "ogenic-app", "chatgpt-dev", "chatgpt-app", "live-assist",
  "manus", "external-harness", "plugin-harness", "openai-agent", "codex",
  "claude", "deepseek", "gemini", "line", "perplexity", "unknown",
]);

function defaultContinuitySurface(pathname: string) {
  if (pathname === "/api/chat/api") return "chatgpt-dev";
  if (pathname === "/api/1lss/chat") return "external-harness";
  return "ogenic-web";
}

/**
 * Log an authenticated owner request to the existing 1LSS line BEFORE calling
 * any model/agent. If the provider then errors, the user's request still exists
 * in history. No new database/schema and no provider call are introduced here.
 */
async function prepareTurnBeforeExecution(
  request: Request,
  env: Bindings,
  pathname: string,
): Promise<PreparedTurn> {
  const passThrough = (state: TurnStartState, failureCode?: string): PreparedTurn => ({
    request,
    requestKey: null,
    sourceSurface: null,
    state,
    userSequence: null,
    failureCode,
  });
  if (request.method !== "POST" || !CONTINUITY_PATHS.has(pathname)) {
    return passThrough("NOT_APPLICABLE");
  }
  if (!(await hasOwnerSession(request, env))) {
    return passThrough("NOT_APPLICABLE", "OWNER_AUTH_REQUIRED");
  }
  const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return passThrough("NOT_APPLICABLE", "JSON_BODY_REQUIRED");
  }
  const prompt = clip(body.prompt, 7000);
  const attachmentIds = Array.isArray(body.attachment_ids)
    ? body.attachment_ids
      .map((value) => typeof value === "string" ? clip(value, 256) : "")
      .filter(Boolean)
      .slice(0, 4)
    : [];
  const attachmentCount = attachmentIds.length;
  if (!prompt && attachmentCount === 0) {
    return passThrough("NOT_APPLICABLE", "NO_USER_TURN_CONTENT");
  }

  const headers = new Headers(request.headers);
  const suppliedRequestKey = clip(headers.get("idempotency-key") || body.idempotency_key || "", 180);
  const requestKey = suppliedRequestKey || ("1lss_" + crypto.randomUUID());
  const requestedSurface = clip(body.source_surface || headers.get("x-ogenic-surface"), 60).toLowerCase();
  const sourceSurface = CONTINUITY_SURFACES.has(requestedSurface)
    ? requestedSurface
    : defaultContinuitySurface(pathname);
  // Preserve the Agent endpoint's required caller-stable idempotency key. A
  // server-generated storage key may record a rejected request, but must never
  // make a keyless Agent submission look safely replayable.
  if (suppliedRequestKey || pathname !== "/api/chat/agent") headers.set("idempotency-key", requestKey);
  else headers.delete("idempotency-key");
  headers.set("x-ogenic-surface", sourceSurface);
  headers.delete("content-length");
  const forwarded = new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ ...body, source_surface: sourceSurface }),
    redirect: request.redirect,
  });

  if (!env.DB) {
    console.warn("OGENIC_1LSS_PREWRITE_UNAVAILABLE", {
      route: pathname, source_surface: sourceSurface, failure_code: "D1_BINDING_UNAVAILABLE",
    });
    return {
      request: forwarded, requestKey, sourceSurface, state: "UNAVAILABLE",
      userSequence: null, failureCode: "D1_BINDING_UNAVAILABLE",
    };
  }

  try {
    const userText = prompt || "[attachment-only turn; count=" + attachmentCount + "]";
    const sequence = await appendOneLine(env, "user", userText, sourceSurface, requestKey + ":user", null, null);
    if (!sequence) throw new Error("USER_TURN_NOT_CONFIRMED");

    // Before model dispatch, put pasted HTTPS links and already-uploaded files
    // into the short-lived Data Stone inbox. Intake failure is logged without
    // storing source URLs or blocking the owner's main chat turn.
    const dataStone = await ingestWaveChatTurn(env, {
      prompt,
      attachment_ids: attachmentIds,
      idempotency_key: requestKey,
      source_surface: sourceSurface,
    }).catch(() => ({ ok: false, accepted: 0, failure_codes: ["INTAKE_HANDLER_FAILED"] }));
    if (!dataStone.ok) {
      console.warn("WAVE_DATA_STONE_AUTO_INTAKE_FAILED", {
        route: pathname,
        source_surface: sourceSurface,
        accepted: dataStone.accepted,
        failure_codes: dataStone.failure_codes.slice(0, 10),
      });
    }

    return {
      request: forwarded, requestKey, sourceSurface, state: "SAVED",
      userSequence: sequence,
    };
  } catch {
    console.warn("OGENIC_1LSS_PREWRITE_FAILED", {
      route: pathname, source_surface: sourceSurface, failure_code: "PERSISTENCE_WRITE_FAILED",
    });
    return {
      request: forwarded, requestKey, sourceSurface, state: "FAILED",
      userSequence: null, failureCode: "PERSISTENCE_WRITE_FAILED",
    };
  }
}

async function dispatchAndFinishTurn(
  request: Request,
  dispatch: () => Promise<Response>,
  env: Bindings,
  prepared: PreparedTurn,
) {
  let response: Response;
  try {
    response = await dispatch();
  } catch {
    // Do not persist raw exception text. The stable error code is sufficient
    // for incident correlation and keeps secrets out of 1LSS/Discord history.
    console.warn("OGENIC_1LSS_HANDLER_THROWN", {
      route: new URL(request.url).pathname,
      source_surface: prepared.sourceSurface,
      failure_code: "UNHANDLED_CHAT_HANDLER_ERROR",
    });
    response = Response.json({
      ok: false,
      code: "UNHANDLED_CHAT_HANDLER_ERROR",
      message: "The chat handler failed before returning a response. Its failure will be stamped into canonical history when available.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  return finishTurnWithReceipt(request, response, env, prepared);
}

async function finishTurnWithReceipt(
  request: Request,
  response: Response,
  env: Bindings,
  prepared: PreparedTurn,
) {
  const pathname = new URL(request.url).pathname;
  let result: Record<string, unknown> | null = null;
  if ((response.headers.get("content-type") || "").includes("application/json")) {
    result = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  }
  let resultState = "NOT_SAVED";
  let resultSequence: number | null = null;
  let failureCode: string | undefined;

  if (prepared.state === "NOT_APPLICABLE") {
    resultState = prepared.failureCode || "NOT_APPLICABLE";
  } else if (!env.DB) {
    resultState = "D1_UNAVAILABLE";
    failureCode = "D1_BINDING_UNAVAILABLE";
  } else if (!response.ok || result?.ok !== true) {
    const code = clip(result?.code || result?.error_code || "", 100)
      .replace(/[^A-Za-z0-9_.-]/g, "_") || ("HTTP_" + response.status);
    try {
      // Some errors happen after the provider completed a turn but before its
      // durable session reference was confirmed. Preserve that final text and
      // session ID in 1LSS while still recording the failed reference state.
      const failedOutput = typeof result?.text === "string" ? clip(result.text, 7000) : "";
      let outputSequence: number | null = null;
      if (failedOutput) {
        outputSequence = await appendOneLine(
          env,
          "assistant",
          failedOutput,
          prepared.sourceSurface || "unknown",
          (prepared.requestKey || "turn") + ":assistant",
          clip(result?.model, 100) || null,
          clip(result?.agent_session_id, 220) || null,
        );
        if (!outputSequence) throw new Error("FAILED_TURN_OUTPUT_NOT_CONFIRMED");
      }
      const failureSequence = await appendOneLine(
        env,
        "system",
        "[TURN_FAILURE] route=" + pathname + " http=" + response.status + " code=" + code,
        prepared.sourceSurface || "unknown",
        (prepared.requestKey || "turn") + ":failure",
        null,
        null,
      );
      resultSequence = outputSequence || failureSequence;
      resultState = failureSequence
        ? (outputSequence ? "SAVED_WITH_FAILURE" : "FAILURE_RECORDED")
        : "FAILURE_NOT_RECORDED";
      if (!failureSequence) failureCode = "FAILURE_EVENT_NOT_CONFIRMED";
    } catch {
      resultState = "FAILURE_NOT_RECORDED";
      failureCode = "PERSISTENCE_WRITE_FAILED";
    }
  } else {
    try {
      await stampFunctionTurn(request.clone(), response, env);
      const storedAssistant = await env.DB.prepare(
        "SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key IN (?, ?) LIMIT 1",
      ).bind(
        ONE_LINE_ID,
        (prepared.requestKey || "") + ":assistant",
        (prepared.requestKey || "") + ":assistant:0",
      ).first<{ sequence_no: number }>();
      resultSequence = storedAssistant?.sequence_no == null ? null : Number(storedAssistant.sequence_no);
      resultState = resultSequence ? "SAVED" : "RESULT_NOT_CONFIRMED";
      if (!resultSequence) failureCode = "ASSISTANT_TURN_NOT_CONFIRMED";

      // The provider reference is first written before the assistant message
      // is stamped. Advance its saved range to include the completed assistant
      // turn, so another agent opening this door retrieves the whole exchange.
      const agentSessionId = result?.runtime === "OPENAI_AGENT_SESSION"
        ? clip(result?.agent_session_id, 220)
        : "";
      if (resultSequence && agentSessionId) {
        let rangeConfirmed = false;
        try {
          await env.DB.prepare(
            `UPDATE chat_session_refs
             SET last_sequence = CASE
               WHEN last_sequence IS NULL THEN ?
               WHEN last_sequence < ? THEN ?
               ELSE last_sequence
             END,
             last_seen_at = ?
             WHERE conversation_id = ? AND source_surface = 'openai-agent' AND session_ref = ?`,
          ).bind(
            resultSequence,
            resultSequence,
            resultSequence,
            Date.now(),
            ONE_LINE_ID,
            agentSessionId,
          ).run();
          const range = await env.DB.prepare(
            `SELECT last_sequence FROM chat_session_refs
             WHERE conversation_id = ? AND source_surface = 'openai-agent' AND session_ref = ?
             LIMIT 1`,
          ).bind(ONE_LINE_ID, agentSessionId).first<{ last_sequence?: number }>();
          rangeConfirmed = Number(range?.last_sequence ?? 0) >= resultSequence;
        } catch {
          rangeConfirmed = false;
        }
        if (!rangeConfirmed) {
          resultState = "SAVED_WITH_FAILURE";
          failureCode = "SESSION_RANGE_NOT_CONFIRMED";
          const rangeEvent = await appendOneLine(
            env,
            "system",
            "[SESSION_RANGE_UPDATE_FAILED] assistant turn saved but Agent session door range was not confirmed",
            prepared.sourceSurface || "unknown",
            (prepared.requestKey || "turn") + ":session-range-failure",
            null,
            agentSessionId,
          ).catch(() => null);
          if (!rangeEvent) {
            console.warn("OGENIC_SESSION_RANGE_RECEIPT_FAILED", {
              route: pathname,
              failure_code: "SESSION_RANGE_NOT_CONFIRMED",
            });
          }
        }
      }
    } catch {
      resultState = "RESULT_NOT_CONFIRMED";
      failureCode = "PERSISTENCE_WRITE_FAILED";
      console.warn("OGENIC_1LSS_RESULT_WRITE_FAILED", {
        route: pathname,
        source_surface: prepared.sourceSurface,
        failure_code: failureCode,
      });
    }
  }

  let overall = "NOT_APPLICABLE";
  if (prepared.state === "SAVED" && resultState === "SAVED") overall = "SAVED";
  else if (prepared.state === "SAVED" && (resultState === "FAILURE_RECORDED" || resultState === "SAVED_WITH_FAILURE")) overall = "SAVED_WITH_FAILURE";
  else if (prepared.state === "FAILED" && resultState === "FAILURE_RECORDED") overall = "USER_TURN_NOT_CONFIRMED";
  else if (prepared.state === "SAVED" && resultState === "RESULT_NOT_CONFIRMED") overall = "USER_TURN_ONLY";
  else if (prepared.state === "SAVED") overall = "PARTIAL";
  else if (resultState === "SAVED") overall = "SAVED_LATE";
  else if (prepared.state === "UNAVAILABLE" || resultState === "D1_UNAVAILABLE") overall = "UNAVAILABLE";
  else if (prepared.state === "FAILED" || resultState === "RESULT_NOT_SAVED" || resultState === "FAILURE_NOT_RECORDED") overall = "FAILED";
  else overall = resultState;

  const receipt = {
    status: overall,
    conversation_id: ONE_LINE_ID,
    session_line: "1LSS_OWNER_MAIN",
    route: pathname,
    source_surface: prepared.sourceSurface,
    user_turn: prepared.state,
    user_sequence_no: prepared.userSequence,
    result_turn: resultState,
    result_sequence_no: resultSequence,
    http_status: response.status,
    failure_code: failureCode || prepared.failureCode,
  };

  const headers = new Headers(response.headers);
  headers.set("X-OGENIC-1LSS-PERSISTENCE", overall);
  headers.set("Cache-Control", "no-store");
  if (!((headers.get("content-type") || "").includes("application/json")) || !result || Array.isArray(result)) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ ...result, memory_persistence: receipt }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type CachedAgentRow = {
  content: string;
  model: string | null;
  run_id: string | null;
  source_surface: string;
  sequence_no: number;
};

async function requestIdempotencyKey(request: Request) {
  const fromHeader = clip(request.headers.get("idempotency-key"), 180);
  if (fromHeader) return fromHeader;
  const body = await request.clone().json().catch(() => ({})) as FunctionTurnBody;
  return clip(body.idempotency_key, 180);
}

async function cachedAgentReplay(request: Request, env: Bindings) {
  if (!env.DB || request.method !== "POST") return null;
  const requestKey = await requestIdempotencyKey(request);
  if (!requestKey) return null;

  const user = await env.DB.prepare(
    `SELECT content, model, run_id, source_surface, sequence_no
     FROM chat_messages
     WHERE conversation_id = ? AND idempotency_key = ?
     LIMIT 1`,
  ).bind(ONE_LINE_ID, `${requestKey}:user`).first<CachedAgentRow>();
  const assistant = await env.DB.prepare(
    `SELECT content, model, run_id, source_surface, sequence_no
     FROM chat_messages
     WHERE conversation_id = ? AND idempotency_key = ?
     LIMIT 1`,
  ).bind(ONE_LINE_ID, `${requestKey}:assistant`).first<CachedAgentRow>();

  if (!user || !assistant || !assistant.run_id) return null;
  return Response.json({
    ok: true,
    text: assistant.content,
    model: assistant.model,
    agent_session_id: assistant.run_id,
    agent_terminal: "completed",
    memory: "D1_CANONICAL",
    conversation_id: ONE_LINE_ID,
    session_line: "1LSS_OWNER_MAIN",
    source_surface: assistant.source_surface,
    usage_tokens: 0,
    runtime: "OPENAI_AGENT_SESSION",
    idempotent_replay: true,
    policy: "SIDE_EFFECTS_REQUIRE_SEPARATE_OWNER_APPROVAL",
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
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
  const runId = result.runtime === "OPENAI_AGENT_SESSION"
    ? clip(result.agent_session_id, 160) || null
    : null;
  const suppliedRequestKey = clip(request.headers.get("idempotency-key"), 180) || clip(body.idempotency_key, 180);
  const requestKey = suppliedRequestKey || (runId ? `agent_session:${runId}` : `plugin_${crypto.randomUUID()}`);

  if (prompt) {
    const userSequence = await appendOneLine(env, "user", prompt, sourceSurface, `${requestKey}:user`, null, runId);
    if (!userSequence) throw new Error("USER_TURN_NOT_CONFIRMED");
  }
  for (const call of result.function_calls ?? []) {
    const name = clip(call.name, 100) || "unknown";
    const state = clip(call.state, 100) || "RESULT";
    const callId = clip(call.call_id, 120) || crypto.randomUUID();
    const toolSequence = await appendOneLine(env, "system", `[TOOL ${name}] ${state}`, sourceSurface, `${requestKey}:tool:${callId}`, null, runId);
    if (!toolSequence) throw new Error("TOOL_EVENT_NOT_CONFIRMED");
  }
  if (text) {
    const assistantSequence = await appendOneLine(env, "assistant", text, sourceSurface, `${requestKey}:assistant`, clip(result.model, 100) || null, runId);
    if (!assistantSequence) throw new Error("ASSISTANT_TURN_NOT_CONFIRMED");
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

async function athenaChatRequest(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/chat/athena";
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: body || undefined,
    redirect: request.redirect,
  });
}

async function defaultWaveTextOnly(request: Request) {
  if (request.method !== "POST") return false;
  const body = await request.clone().json().catch(() => ({})) as FunctionTurnBody;
  const attachments = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(Boolean) : [];
  return attachments.length === 0 && Boolean(clip(body.prompt, 7000));
}

const FRESH_AGENT_TIME_PATTERN = /\b(?:current|currently|latest|live|now|today|status|health|up[ -]?to[ -]?date)\b|สถานะ|ล่าสุด|ปัจจุบัน|ตอนนี้|วันนี้/i;
const FRESH_AGENT_TARGET_PATTERN = /\b(?:wave|ogenic|system|repo(?:sitory)?|github|ci|workflow|linear|runtime|provider|quota|roadmap|agent|deploy(?:ment)?|build|branch|commit|1lss|d1)\b|ระบบ|รันไทม์|โควตา|โรดแมป|กิตฮับ|ลิเนียร์|ดีพลอย|บิลด์|บรাঞ্চ|คอมมิต/i;

export function isFreshAgentReadRequest(prompt: unknown) {
  const text = clip(prompt, 7000);
  return Boolean(text && FRESH_AGENT_TIME_PATTERN.test(text) && FRESH_AGENT_TARGET_PATTERN.test(text));
}

async function freshAgentReadRequest(request: Request) {
  if (request.method !== "POST") return false;
  const body = await request.clone().json().catch(() => ({})) as FunctionTurnBody;
  return isFreshAgentReadRequest(body.prompt);
}

async function withFreshAgentHandoffEvidence(response: Response) {
  const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return response;
  return Response.json({
    ...body,
    agent_freshness_handoff: true,
    agent_session_started: false,
    agent_route: "ATHENA_VERIFIED_READ",
  }, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(incomingRequest: Request, env: Bindings, ctx: unknown) {
    let request = incomingRequest;
    const pathname = new URL(request.url).pathname;
    const preparedTurn = await prepareTurnBeforeExecution(request, env, pathname);
    request = preparedTurn.request;
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
    if (pathname === "/api/1lss/history-page" || pathname === "/api/1lss/context-recall" || pathname === "/api/1lss/resolve-session" || pathname === "/api/1lss/sessions" || pathname.startsWith("/api/1lss/sessions/")) {
      return sessionRecoveryApi.fetch(request, env, ctx as never);
    }
    if (
      pathname === "/api/chat/ephemeral" ||
      pathname === "/api/1lss/event" ||
      pathname === "/api/1lss/events" ||
      pathname === "/api/1lss/status"
    ) {
      return unifiedChatApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/inline/tool") {
      return inlineToolsApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/chat/history") {
      return chatModelApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/chat/athena") {
      return await dispatchAndFinishTurn(
        request.clone(),
        async () => await athenaChatApi.fetch(request, env, ctx as never),
        env,
        preparedTurn,
      );
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

      if (pathname === "/api/chat/model" && await defaultWaveTextOnly(canonicalRequest)) {
        return await dispatchAndFinishTurn(
          canonicalRequest.clone(),
          async () => {
            const athenaRequest = await athenaChatRequest(canonicalRequest);
            return athenaChatApi.fetch(athenaRequest, env, ctx as never);
          },
          env,
          preparedTurn,
        );
      }
      return await dispatchAndFinishTurn(
        request.clone(),
        async () => await chatModelApi.fetch(canonicalRequest, env, ctx as never),
        env,
        preparedTurn,
      );
    }
    if (pathname === "/api/manus/status" || pathname === "/api/manus/task") {
      return manusApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/chat/agent") {
      return await dispatchAndFinishTurn(
        request.clone(),
        async () => {
          if (await freshAgentReadRequest(request)) {
            const athenaRequest = await athenaChatRequest(request);
            const athenaResponse = await athenaChatApi.fetch(athenaRequest, env, ctx as never);
            return withFreshAgentHandoffEvidence(athenaResponse);
          }
          const cached = await cachedAgentReplay(request, env);
          if (cached) return cached;
          return connectorApi.fetch(request, env, ctx as never);
        },
        env,
        preparedTurn,
      );
    }
    if (pathname === "/api/chat/functions") {
      return await dispatchAndFinishTurn(
        request.clone(),
        async () => await connectorApi.fetch(request, env, ctx as never),
        env,
        preparedTurn,
      );
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