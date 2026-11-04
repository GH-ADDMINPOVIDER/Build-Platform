import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";
import {
  readConnectorRegistry,
  recentConnectorEvents,
  testConnector,
  type ConnectorBindings,
} from "./connector-runtime";
import { executeVerifiedTool, verifiedFunctionTools } from "./verified-function-tools";
import { readIncentiveSnapshot } from "./provider-incentives";
import { readCanonicalD1Context, recordChatUsage } from "./d1-context";

export type ConnectorAppBindings = AuthBindings & ConnectorBindings & {
  OPENAI_API_KEY?: string;
  OPENAI_ADMIN_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
  OGENIC_GIT_SHA?: string;
  OGENIC_GITHUB_BRANCH?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_RUNTIME?: string;
  OGENIC_PHASE?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
};
type Env = { Bindings: ConnectorAppBindings };

type ResponseItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ type?: string; text?: string; refusal?: string }>;
  [key: string]: unknown;
};
type ResponseBody = {
  id?: string;
  model?: string;
  output?: ResponseItem[];
  output_text?: string;
  usage?: { total_tokens?: number };
  error?: { code?: string; message?: string } | null;
};
type OpenAIListBody = {
  data?: Array<Record<string, unknown>>;
  error?: { code?: string; message?: string } | null;
  has_more?: boolean;
};

type OpenAIRequestResult = {
  ok: boolean;
  status: number;
  body: OpenAIListBody & Record<string, unknown>;
};

const OPENAI_API_BASE = "https://api.openai.com/v1";
const KNOWLEDGE_STORE_NAME = "OGENIC Knowledge";
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function extractText(body: ResponseBody) {
  if (body.output_text) return clean(body.output_text, 12000);
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) out.push(part.text);
      if (part.type === "refusal" && part.refusal) out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
}

async function openAIRequest(apiKey: string, path: string, init: RequestInit = {}): Promise<OpenAIRequestResult> {
  const response = await fetch(`${OPENAI_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as OpenAIRequestResult["body"];
  return { ok: response.ok, status: response.status, body };
}

function openAIError(result: OpenAIRequestResult) {
  return clean(result.body.error?.message || result.body.error?.code || `OpenAI HTTP ${result.status}`, 300);
}

function vectorStoreIdFrom(body: OpenAIListBody, preferredId = "") {
  if (preferredId) return preferredId;
  const store = (body.data ?? []).find((item) => clean(item.name, 200) === KNOWLEDGE_STORE_NAME);
  return clean(store?.id, 200);
}

async function knowledgeStore(env: ConnectorAppBindings, apiKey: string, createIfMissing: boolean) {
  const configuredId = clean(env.OPENAI_VECTOR_STORE_ID, 200);
  if (configuredId) return { state: "LIVE", id: configuredId, created: false, source: "runtime_binding" };

  const listed = await openAIRequest(apiKey, "/vector_stores?limit=100");
  if (!listed.ok) return { state: "ERROR", id: "", created: false, source: "openai", error: openAIError(listed) };
  const existing = vectorStoreIdFrom(listed.body);
  if (existing) return { state: "LIVE", id: existing, created: false, source: "openai" };
  if (!createIfMissing) return { state: "CONFIGURATION_REQUIRED", id: "", created: false, source: "openai" };

  const created = await openAIRequest(apiKey, "/vector_stores", {
    method: "POST",
    body: JSON.stringify({
      name: KNOWLEDGE_STORE_NAME,
      metadata: { owner: "ogenic-web-dev", environment: "staging", purpose: "same-mind-knowledge" },
    }),
  });
  if (!created.ok) return { state: "ERROR", id: "", created: false, source: "openai", error: openAIError(created) };
  const id = clean(created.body.id, 200);
  return id
    ? { state: "LIVE", id, created: true, source: "openai" }
    : { state: "ERROR", id: "", created: false, source: "openai", error: "OpenAI returned no vector store id" };
}

function safeModel(item: Record<string, unknown>) {
  return { id: clean(item.id, 160), owned_by: clean(item.owned_by, 100), created: Number(item.created ?? 0) };
}
function safeFile(item: Record<string, unknown>) {
  return {
    id: clean(item.id, 160),
    filename: clean(item.filename, 240),
    bytes: Number(item.bytes ?? 0),
    purpose: clean(item.purpose, 80),
    created_at: Number(item.created_at ?? 0),
  };
}
function safeStore(item: Record<string, unknown>) {
  const fileCounts = item.file_counts && typeof item.file_counts === "object" ? item.file_counts as Record<string, unknown> : {};
  return {
    id: clean(item.id, 160),
    name: clean(item.name, 240),
    status: clean(item.status, 80),
    usage_bytes: Number(item.usage_bytes ?? 0),
    created_at: Number(item.created_at ?? 0),
    files_total: Number(fileCounts.total ?? 0),
  };
}

type AgentStreamEvent = {
  type?: string;
  session_id?: string;
  text?: string;
  delta?: string;
  usage?: { total_tokens?: number };
  error?: { code?: string; message?: string } | string | null;
  turn?: {
    subagent_id?: string | null;
    usage?: { total_tokens?: number };
    error?: { code?: string; message?: string } | string | null;
  };
  item?: {
    type?: string;
    phase?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
};

async function readAgentSessionStream(response: Response, expectedSessionId = "") {
  if (!response.body) {
    return { sessionId: "", terminal: "failed", text: "", usageTokens: 0, error: "AGENT_STREAM_UNAVAILABLE" };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sessionId = clean(expectedSessionId, 220);
  let terminal = "";
  let finalText = "";
  let streamedText = "";
  let fallbackText = "";
  let usageTokens = 0;
  let streamError = "";

  const consume = (event: AgentStreamEvent) => {
    if (typeof event.session_id === "string") sessionId = event.session_id;
    usageTokens = Math.max(
      usageTokens,
      Number(event.usage?.total_tokens ?? 0),
      Number(event.turn?.usage?.total_tokens ?? 0),
    );
    if (event.type === "agent.session.turn.output_text.delta" && typeof event.delta === "string") {
      streamedText += event.delta;
    }
    if (event.type === "agent.session.turn.output_text.done" && typeof event.text === "string") {
      finalText = event.text.trim();
    }
    if (event.type === "agent.session.turn.item.done" && event.item?.type === "message") {
      const text = (event.item.content ?? [])
        .filter((part) => part?.type === "output_text" && typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      if (text) {
        fallbackText = text;
        if (event.item.phase === "final_answer") finalText = text;
      }
    }
    const rootTurn = event.turn?.subagent_id == null;
    if (event.type === "agent.session.turn.completed" && rootTurn) terminal = "completed";
    if (event.type === "agent.session.turn.cancelled" && rootTurn) terminal = "cancelled";
    if ((event.type === "agent.session.turn.failed" && rootTurn)
      || event.type === "agent.session.failed"
      || event.type === "agent.session.environment.failed"
      || event.type === "error") {
      terminal = "failed";
      const failure = event.turn?.error || event.error;
      if (typeof failure === "string") streamError = failure;
      else if (failure && typeof failure === "object") {
        streamError = clean(failure.message || failure.code || "AGENT_SESSION_FAILED", 300);
      }
    }
  };

  const consumeBlock = (block: string) => {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { consume(JSON.parse(payload) as AgentStreamEvent); } catch { /* ignore keepalive/non-json event lines */ }
    }
  };

  let endedByTurn = false;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
    let split = buffer.indexOf("\n\n");
    while (split >= 0) {
      consumeBlock(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      if (terminal) {
        endedByTurn = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      split = buffer.indexOf("\n\n");
    }
    if (endedByTurn) break;
  }
  if (!endedByTurn) {
    buffer += decoder.decode().replace(/\r\n/g, "\n");
    if (buffer.trim()) consumeBlock(buffer);
  }

  return {
    sessionId,
    terminal: terminal || "unknown",
    text: finalText || streamedText.trim() || fallbackText,
    usageTokens,
    error: streamError,
  };
}

type StoredAgentSessionRef = {
  session_ref: string;
  label?: string | null;
  last_seen_at?: number | null;
};

type StoredAgentSessionLookup =
  | { ok: true; session: StoredAgentSessionRef | null }
  | { ok: false; code: "D1_BINDING_UNAVAILABLE" | "SESSION_REFERENCE_READ_FAILED" };

async function latestStoredAgentSession(env: ConnectorAppBindings): Promise<StoredAgentSessionLookup> {
  if (!env.DB) return { ok: false, code: "D1_BINDING_UNAVAILABLE" };
  try {
    const session = await env.DB.prepare(
      `SELECT session_ref, label, last_seen_at
       FROM chat_session_refs
       WHERE conversation_id = 'owner-main' AND source_surface = 'openai-agent'
       ORDER BY last_seen_at DESC
       LIMIT 1`,
    ).first<StoredAgentSessionRef>();
    return { ok: true, session: session ?? null };
  } catch {
    // A read failure is NOT the same as "there is no session". Never create
    // another provider session when the canonical reference cannot be read.
    return { ok: false, code: "SESSION_REFERENCE_READ_FAILED" };
  }
}

async function rememberAgentSession(env: ConnectorAppBindings, sessionId: string, label: string): Promise<boolean> {
  const safeSessionId = clean(sessionId, 220);
  const safeLabel = clean(label, 160);
  if (!env.DB || !safeSessionId || !safeLabel) return false;
  try {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO chat_conversations(id, owner_id, title, created_at, updated_at)
       VALUES ('owner-main', 'owner', 'OGENIC SAME MIND', ?, ?)`,
    ).bind(now, now).run();
    const conversation = await env.DB.prepare(
      `SELECT last_sequence FROM chat_conversations WHERE id = 'owner-main' LIMIT 1`,
    ).first<{ last_sequence?: number }>();
    const sequence = Math.max(0, Number(conversation?.last_sequence ?? 0)) || null;
    await env.DB.prepare(
      `INSERT INTO chat_session_refs(
         id, conversation_id, source_surface, session_ref, session_url, label,
         first_sequence, last_sequence, first_seen_at, last_seen_at
       ) VALUES (?, 'owner-main', 'openai-agent', ?, NULL, ?, ?, ?, ?, ?)
       ON CONFLICT(conversation_id, source_surface, session_ref) DO UPDATE SET
         label = excluded.label,
         last_sequence = CASE
           WHEN excluded.last_sequence IS NULL THEN chat_session_refs.last_sequence
           WHEN chat_session_refs.last_sequence IS NULL THEN excluded.last_sequence
           ELSE MAX(chat_session_refs.last_sequence, excluded.last_sequence)
         END,
         last_seen_at = excluded.last_seen_at`,
    ).bind(
      `agent_session_${crypto.randomUUID()}`,
      safeSessionId,
      safeLabel,
      sequence,
      sequence,
      now,
      now,
    ).run();

    const saved = await env.DB.prepare(
      `SELECT session_ref, label
       FROM chat_session_refs
       WHERE conversation_id = 'owner-main'
         AND source_surface = 'openai-agent'
         AND session_ref = ?
       LIMIT 1`,
    ).bind(safeSessionId).first<{ session_ref: string; label: string }>();
    return saved?.session_ref === safeSessionId && saved.label === safeLabel;
  } catch {
    console.warn("OGENIC_AGENT_SESSION_REFERENCE_PERSIST_FAILED", {
      failure_code: "SESSION_REFERENCE_WRITE_OR_VERIFY_FAILED",
    });
    return false;
  }
}

async function touchAgentSession(env: ConnectorAppBindings, sessionId: string, label: string) {
  if (!env.DB || !sessionId) return;
  await env.DB.prepare(
    `UPDATE chat_session_refs
     SET label = ?, last_seen_at = ?
     WHERE conversation_id = 'owner-main' AND source_surface = 'openai-agent' AND session_ref = ?`,
  ).bind(clean(label, 160), Date.now(), clean(sessionId, 220)).run().catch(() => undefined);
}

function requestedAgentSessionLabel(model: string, effort: string) {
  return `OpenAI Agent Session · ${clean(model, 80)} · ${clean(effort, 20)}`;
}

function safeAgentSessionStatus(body: Record<string, unknown>) {
  return clean(body.status, 40).toLowerCase();
}

function agentSessionSettings(body: Record<string, unknown>) {
  const agent = body.agent && typeof body.agent === "object" ? body.agent as Record<string, unknown> : {};
  const reasoning = agent.reasoning && typeof agent.reasoning === "object" ? agent.reasoning as Record<string, unknown> : {};
  return {
    model: clean(agent.model, 80),
    effort: clean(reasoning.effort, 20),
  };
}

async function continueAgentSession(input: {
  apiKey: string;
  sessionId: string;
  prompt: string;
  idempotencyKey: string;
  model: string;
  effort: string;
}) {
  const session = await openAIRequest(input.apiKey, `/agents/sessions/${encodeURIComponent(input.sessionId)}`, {
    headers: { "OpenAI-Beta": "agents=v1" },
  });
  if (!session.ok) {
    return {
      ok: false as const,
      code: session.status === 404 ? "AGENT_SESSION_RESET_REQUIRED" : `OPENAI_AGENT_SESSION_HTTP_${session.status}`,
      message: session.status === 404 ? "Saved Agent Session no longer exists. Start a new Agent session explicitly." : openAIError(session),
    };
  }

  const status = safeAgentSessionStatus(session.body);
  if (status !== "idle") {
    return {
      ok: false as const,
      code: status === "failed" ? "AGENT_SESSION_RESET_REQUIRED" : "AGENT_SESSION_NOT_IDLE",
      message: status === "failed"
        ? "Saved Agent Session failed. Start a new Agent session explicitly."
        : `Agent Session is ${status || "not idle"}; one-pass policy will not steer or retry it automatically.`,
    };
  }

  const settings = agentSessionSettings(session.body);
  if ((settings.model && settings.model !== input.model) || (settings.effort && settings.effort !== input.effort)) {
    return {
      ok: false as const,
      code: "AGENT_SESSION_SETTINGS_CHANGE_REQUIRES_NEW_SESSION",
      message: "Model or reasoning effort changed. Start a new Agent session explicitly.",
    };
  }

  const streamResponse = await fetch(
    `${OPENAI_API_BASE}/agents/sessions/${encodeURIComponent(input.sessionId)}/events`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "OpenAI-Beta": "agents=v1",
        Accept: "text/event-stream",
      },
    },
  );
  if (!streamResponse.ok || !streamResponse.body) {
    return {
      ok: false as const,
      code: `OPENAI_AGENT_STREAM_HTTP_${streamResponse.status}`,
      message: "Could not subscribe to the saved Agent Session event stream.",
    };
  }

  const submitted = await openAIRequest(
    input.apiKey,
    `/agents/sessions/${encodeURIComponent(input.sessionId)}/events`,
    {
      method: "POST",
      headers: {
        "OpenAI-Beta": "agents=v1",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        events: [{
          type: "agent.session.input.message",
          input: [{
            role: "user",
            content: [{ type: "input_text", text: input.prompt }],
          }],
        }],
      }),
    },
  );
  if (!submitted.ok) {
    await streamResponse.body.cancel().catch(() => undefined);
    return {
      ok: false as const,
      code: `OPENAI_AGENT_EVENT_HTTP_${submitted.status}`,
      message: openAIError(submitted),
    };
  }

  return {
    ok: true as const,
    agent: await readAgentSessionStream(streamResponse, input.sessionId),
  };
}

export function createConnectorAppApi() {
  const api = new Hono<Env>();
  const ownerOnly = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    await next();
  };

  api.use("/api/connectors", ownerOnly);
  api.use("/api/connectors/*", ownerOnly);
  api.use("/api/chat/functions", ownerOnly);
  api.use("/api/chat/agent", ownerOnly);
  api.use("/api/openai/*", ownerOnly);

  api.get("/api/connectors", async (c) => {
    const connectors = await readConnectorRegistry(c.env);
    return c.json({ ok: true, connectors }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/connectors/events", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const limit = Number(c.req.query("limit") ?? 30);
    return c.json({ ok: true, events: await recentConnectorEvents(c.env, limit) }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/connectors/test", async (c) => {
    const body: { connector?: unknown } = await c.req.json<{ connector?: unknown }>().catch(() => ({ connector: undefined }));
    const connector = clean(body.connector, 60);
    if (!connector) return c.json({ ok: false, code: "INVALID_REQUEST", message: "connector is required" }, 400);
    const result = await testConnector(c.env, connector);
    return c.json({ ok: true, test: result }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/openai/platform", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);

    const [modelsResult, filesResult, storesResult] = await Promise.all([
      openAIRequest(apiKey, "/models"),
      openAIRequest(apiKey, "/files?limit=50"),
      openAIRequest(apiKey, "/vector_stores?limit=50"),
    ]);
    const storeId = storesResult.ok ? vectorStoreIdFrom(storesResult.body, clean(c.env.OPENAI_VECTOR_STORE_ID, 200)) : clean(c.env.OPENAI_VECTOR_STORE_ID, 200);
    const models = (modelsResult.body.data ?? []).map(safeModel).filter((item) => item.id).sort((a, b) => a.id.localeCompare(b.id));
    const files = (filesResult.body.data ?? []).map(safeFile).filter((item) => item.id).sort((a, b) => b.created_at - a.created_at);
    const stores = (storesResult.body.data ?? []).map(safeStore).filter((item) => item.id).sort((a, b) => b.created_at - a.created_at);

    const tools = [
      { id: "web_search", label: "Web Search", state: "LIVE", risk: "READ_ONLY", note: "OpenAI-hosted web search; metered per API usage." },
      { id: "file_search", label: "File Search", state: storeId ? "LIVE" : "CONFIGURATION_REQUIRED", risk: "READ_ONLY", note: storeId ? "Connected to OGENIC Knowledge vector store." : "Create the OGENIC Knowledge store to enable." },
      { id: "d1_canonical", label: "D1 Canonical Context", state: c.env.DB ? "LIVE" : "CONFIGURATION_REQUIRED", risk: "READ_ONLY", note: c.env.DB ? "Reads canonical toolkit, policies, provider bindings, sources and knowledge from D1." : "Bind D1 DB to enable canonical context." },
      { id: "functions", label: "Function Calling", state: "LIVE", risk: "APPROVAL_GATED", note: "OGENIC connector functions; side effects stop at Human Approval." },
      { id: "mcp", label: "Remote MCP", state: "REGISTERED", risk: "APPROVAL_GATED", note: "OGENIC Registry MCP is registered; execution remains explicitly approval-gated." },
      { id: "computer_use", label: "Computer Use", state: "AVAILABLE", risk: "HIGH_RISK", note: "Not auto-enabled in web dev; requires explicit owner action policy." },
      { id: "code_interpreter", label: "Code Interpreter / Hosted Shell", state: "AVAILABLE", risk: "METERED", note: "Available through supported models; not auto-enabled for routine chat." },
    ];

    return c.json({
      ok: true,
      api_key_state: "BOUND",
      checked_at: new Date().toISOString(),
      models: { state: modelsResult.ok ? "LIVE" : "ERROR", count: models.length, data: models.slice(0, 80), error: modelsResult.ok ? null : openAIError(modelsResult) },
      files: { state: filesResult.ok ? "LIVE" : "ERROR", count: files.length, data: files.slice(0, 50), error: filesResult.ok ? null : openAIError(filesResult) },
      vector_stores: { state: storesResult.ok ? "LIVE" : "ERROR", count: stores.length, data: stores.slice(0, 50), knowledge_store_id: storeId || null, error: storesResult.ok ? null : openAIError(storesResult) },
      admin: {
        state: c.env.OPENAI_ADMIN_API_KEY ? "BOUND" : "CONFIGURATION_REQUIRED",
        note: c.env.OPENAI_ADMIN_API_KEY ? "Admin credential is bound; organization usage/cost wiring can be enabled." : "Organization-wide usage/cost endpoints require an OpenAI Admin API key, not the project API key.",
      },
      tools,
      mcp: { state: "REGISTERED", endpoint: "https://ogenic-registry-mcp.vercel.app/mcp", auto_execute: false },
      policy: "OWNER_ONLY · SERVER_SIDE_SECRETS · SIDE_EFFECTS_REQUIRE_APPROVAL",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/openai/vector-stores/ensure", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    const store = await knowledgeStore(c.env, apiKey, true);
    if (store.state !== "LIVE") return c.json({ ok: false, code: store.state, message: store.error ?? "Vector store unavailable" }, 502);
    return c.json({ ok: true, store: { id: store.id, name: KNOWLEDGE_STORE_NAME, created: store.created, state: store.state } }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/chat/agent", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);

    const body: {
      prompt?: unknown;
      model?: unknown;
      reasoning_effort?: unknown;
      allow_paid_fallback?: unknown;
      source_surface?: unknown;
      new_session?: unknown;
    } = await c.req.json<{
      prompt?: unknown;
      model?: unknown;
      reasoning_effort?: unknown;
      allow_paid_fallback?: unknown;
      source_surface?: unknown;
      new_session?: unknown;
    }>().catch(() => ({}));

    const prompt = clean(body.prompt, 7000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);

    const requestKey = clean(c.req.header("idempotency-key"), 256);
    if (!requestKey) {
      return c.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED", message: "Agent messages require one stable submission key." }, 400);
    }

    const requestedModel = clean(body.model, 80);
    const supportedModels = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra"]);
    const model = supportedModels.has(requestedModel) ? requestedModel : "gpt-5.6-sol";
    const requestedEffort = clean(body.reasoning_effort, 20);
    const effort = ["low", "medium", "high", "xhigh", "max"].includes(requestedEffort) ? requestedEffort : "medium";
    const allowPaidFallback = body.allow_paid_fallback === true;
    const sourceSurface = clean(body.source_surface, 60) || "ogenic-ui";
    const newSessionRequested = body.new_session === true;

    const incentive = await readIncentiveSnapshot(c.env.DB);
    const poolId = "standard";
    const pool = incentive.pools.find((row) => row.id === poolId);
    const guarded = pool?.state === "CRITICAL" || pool?.state === "EXHAUSTED";
    if (guarded && !allowPaidFallback) {
      return c.json({
        ok: false,
        code: "INCENTIVE_CAP_GUARD",
        message: "standard pool is guarded; paid fallback is disabled",
        incentive_pool: poolId,
        routing_mode: incentive.routing_mode,
        paid_fallback: false,
      }, 429);
    }

    const sessionLookup = await latestStoredAgentSession(c.env);
    if (!sessionLookup.ok) {
      return c.json({
        ok: false,
        code: "AGENT_SESSION_REFERENCE_READ_FAILED",
        reference_state: sessionLookup.code,
        message: "Could not verify the canonical Agent Session reference. No new provider session was created.",
        retry_policy: "NO_AUTO_RETRY",
        new_session_required: false,
      }, 503);
    }
    const storedSession = sessionLookup.session;
    let agent: Awaited<ReturnType<typeof readAgentSessionStream>>;
    let sessionContinuation = false;
    let d1CanonicalState: string = "SESSION_CONTINUATION";

    if (storedSession?.session_ref && !newSessionRequested) {
      const continued = await continueAgentSession({
        apiKey,
        sessionId: storedSession.session_ref,
        prompt,
        idempotencyKey: requestKey,
        model,
        effort,
      });
      if (!continued.ok) {
        const resetRequired = continued.code.includes("RESET_REQUIRED") || continued.code.includes("SETTINGS_CHANGE");
        return c.json({
          ok: false,
          code: continued.code,
          message: continued.message,
          agent_session_id: storedSession.session_ref,
          retry_policy: "NO_AUTO_RETRY",
          new_session_required: resetRequired,
        }, resetRequired ? 409 : 502);
      }
      agent = continued.agent;
      sessionContinuation = true;
      await touchAgentSession(c.env, storedSession.session_ref, requestedAgentSessionLabel(model, effort));
    } else {
      const d1Context = await readCanonicalD1Context(c.env.DB, {
        git_sha: c.env.OGENIC_GIT_SHA,
        git_branch: c.env.OGENIC_GITHUB_BRANCH,
        build_uuid: c.env.OGENIC_BUILD_UUID,
        runtime: c.env.OGENIC_RUNTIME,
        phase: c.env.OGENIC_PHASE,
        version: c.env.CF_VERSION_METADATA ?? null,
      });
      if (d1Context.state !== "LIVE") {
        return c.json({
          ok: false, code: "CANONICAL_CONTEXT_UNAVAILABLE",
          state: d1Context.state, message: "Verified D1 context unavailable; no new provider Agent session created.",
        }, 503);
      }
      d1CanonicalState = d1Context.state;

      const agentResponse = await fetch(`${OPENAI_API_BASE}/agents/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "agents=v1",
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({
          agent: {
            model,
            instructions:
              "You are OGENIC Agent AI on staging. Preserve SAME MIND continuity using the supplied canonical D1 context. " +
              "The provider session is continuation state only; Green/1LSS remains canonical truth. " +
              "Never claim an external side effect occurred unless verified. Production-affecting, destructive, credential, billing, " +
              "or permission changes require separate owner approval. Reply in the user's language.\n\n" +
              "CANONICAL D1 + LIVE RUNTIME EVIDENCE:\n" + d1Context.text,
            reasoning: { effort, summary: "concise" },
            multi_agent: { enabled: false },
            service_tier: "auto",
          },
          environment: { type: "none" },
          input: prompt,
          metadata: {
            project: "ogenic-phase-vi",
            environment: "staging",
            branch: c.env.OGENIC_GITHUB_BRANCH || "Unified-on-Progress",
            conversation: "owner-main",
            session_line: "1LSS_OWNER_MAIN",
            source_surface: sourceSurface,
          },
          stream: true,
        }),
      });

      if (!agentResponse.ok) {
        const raw = await agentResponse.text().catch(() => "");
        return c.json({
          ok: false,
          code: `OPENAI_AGENT_HTTP_${agentResponse.status}`,
          message: clean(raw || "OpenAI Agent Session request failed", 300),
        }, 502);
      }
      agent = await readAgentSessionStream(agentResponse);
    }

    if (agent.terminal !== "completed") {
      return c.json({
        ok: false,
        code: `AGENT_${agent.terminal.toUpperCase()}`,
        message: agent.error || "Agent session did not complete",
        agent_session_id: agent.sessionId || storedSession?.session_ref || null,
        retry_policy: "NO_AUTO_RETRY",
      }, 502);
    }
    if (!agent.text) {
      return c.json({
        ok: false,
        code: "AGENT_EMPTY_OUTPUT",
        agent_session_id: agent.sessionId || storedSession?.session_ref || null,
        retry_policy: "NO_AUTO_RETRY",
      }, 502);
    }

    const sessionId = clean(agent.sessionId || storedSession?.session_ref, 220);
    if (!sessionId) {
      return c.json({
        ok: false,
        code: "AGENT_SESSION_ID_MISSING",
        message: "Agent completed but no durable provider session id was returned.",
        retry_policy: "NO_AUTO_RETRY",
      }, 502);
    }

    if (!sessionContinuation) {
      const referenceSaved = await rememberAgentSession(c.env, sessionId, requestedAgentSessionLabel(model, effort));
      if (!referenceSaved) {
        return c.json({
          ok: false,
          code: "AGENT_SESSION_REFERENCE_NOT_CONFIRMED",
          message: "The provider finished the turn, but its durable session reference could not be confirmed in 1LSS. Do not automatically retry or create another session.",
          text: agent.text,
          model,
          agent_session_id: sessionId,
          agent_terminal: agent.terminal,
          runtime: "OPENAI_AGENT_SESSION",
          session_reference_state: "NOT_CONFIRMED",
          retry_policy: "NO_AUTO_RETRY",
        }, 503, { "Cache-Control": "no-store" });
      }
    }

    await recordChatUsage(c.env.DB, {
      conversationId: "owner-main",
      sourceSurface,
      model,
      poolId,
      usageTokens: agent.usageTokens,
      route: allowPaidFallback && guarded
        ? "paid_fallback"
        : sessionContinuation ? "agent_session_continuation" : "agent_session_new",
    });

    return c.json({
      ok: true,
      text: agent.text,
      model,
      agent_session_id: sessionId,
      agent_terminal: agent.terminal,
      memory: "D1_CANONICAL+PROVIDER_SESSION",
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      d1_canonical: d1CanonicalState,
      session_continuation: sessionContinuation,
      context_replayed: !sessionContinuation,
      provider_session_ref: "chat_session_refs",
      incentive_pool: poolId,
      routing_mode: incentive.routing_mode,
      paid_fallback: allowPaidFallback,
      usage_tokens: agent.usageTokens,
      runtime: "OPENAI_AGENT_SESSION",
      retry_policy: "NO_AUTO_RETRY",
      policy: "SIDE_EFFECTS_REQUIRE_SEPARATE_OWNER_APPROVAL",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/chat/functions", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    const body: { prompt?: unknown; model?: unknown; tool_mode?: unknown; reasoning_effort?: unknown; allow_paid_fallback?: unknown; source_surface?: unknown } = await c.req.json<{ prompt?: unknown; model?: unknown; tool_mode?: unknown; reasoning_effort?: unknown; allow_paid_fallback?: unknown; source_surface?: unknown }>().catch(() => ({}));
    const prompt = clean(body.prompt, 7000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    const requestedModel = clean(body.model, 80);
    const model = requestedModel === "gpt-6-astra" ? requestedModel : "gpt-5.6-sol";
    const toolMode = ["web", "rag", "auto"].includes(clean(body.tool_mode, 20).toLowerCase()) ? clean(body.tool_mode, 20).toLowerCase() : "auto";
    const effort = ["low", "medium", "high", "xhigh", "max"].includes(clean(body.reasoning_effort, 20)) ? clean(body.reasoning_effort, 20) : "low";
    const allowPaidFallback = body.allow_paid_fallback === true;
    const sourceSurface = clean(body.source_surface, 60) || "ogenic-ui";
    const incentive = await readIncentiveSnapshot(c.env.DB);
    const poolId = "standard";
    const pool = incentive.pools.find((row) => row.id === poolId);
    const guarded = pool?.state === "CRITICAL" || pool?.state === "EXHAUSTED";
    if (guarded && !allowPaidFallback) {
      return c.json({ ok: false, code: "INCENTIVE_CAP_GUARD", message: "standard pool is guarded; paid fallback is disabled", incentive_pool: poolId, routing_mode: incentive.routing_mode, paid_fallback: false }, 429);
    }
    const d1Context = await readCanonicalD1Context(c.env.DB, {
      git_sha: c.env.OGENIC_GIT_SHA,
      git_branch: c.env.OGENIC_GITHUB_BRANCH,
      build_uuid: c.env.OGENIC_BUILD_UUID,
      runtime: c.env.OGENIC_RUNTIME,
      phase: c.env.OGENIC_PHASE,
      version: c.env.CF_VERSION_METADATA ?? null,
    });
    const store = await knowledgeStore(c.env, apiKey, false);
    const webTool: Record<string, unknown> = { type: "web_search" };
    const fileTool: Record<string, unknown> | null = store.state === "LIVE" && store.id ? { type: "file_search", vector_store_ids: [store.id], max_num_results: 8 } : null;
    const hostedTools: Array<Record<string, unknown>> = toolMode === "web" ? [webTool] : toolMode === "rag" ? (fileTool ? [fileTool] : []) : [webTool, ...(fileTool ? [fileTool] : [])];
    const requestTools: Array<Record<string, unknown>> = toolMode === "auto" ? [...verifiedFunctionTools, ...hostedTools] : hostedTools;

    let input: Array<Record<string, unknown>> = [{
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }];
    const calls: Array<{ name: string; state: string; call_id: string }> = [];
    let final: ResponseBody = {};
    let usageTotal = 0;

    for (let round = 0; round < 4; round += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": c.req.header("idempotency-key") ?? `fn_${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          model,
          reasoning: { effort },
          instructions: "You are the OGENIC connector supervisor. Use verified read-only function results as authoritative evidence. The GitHub repository/branch and 1LSS conversation/session are server-locked. Never request, reveal, or infer credentials. Never claim an external action occurred; writes and unknown functions return HUMAN_APPROVAL_REQUIRED. Browser MCP is an independent inspection lane, not part of these private tools. Reply in the user's language.\n\nCANONICAL D1 + LIVE RUNTIME EVIDENCE:\n" + d1Context.text,
          input,
          ...(requestTools.length ? { tools: requestTools, tool_choice: "auto", parallel_tool_calls: true, max_tool_calls: 6 } : {}),
          ...(toolMode === "web" ? { include: ["web_search_call.action.sources"] } : toolMode === "rag" && store.state === "LIVE" ? { include: ["file_search_call.results"] } : toolMode === "auto" && store.state === "LIVE" ? { include: ["web_search_call.action.sources", "file_search_call.results"] } : toolMode === "auto" ? { include: ["web_search_call.action.sources"] } : {}),
          max_output_tokens: 1800,
          store: false,
        }),
      });
      final = await response.json().catch(() => ({})) as ResponseBody;
      usageTotal += Number(final.usage?.total_tokens ?? 0);
      if (!response.ok) {
        return c.json({
          ok: false,
          code: final.error?.code ? `OPENAI_${clean(final.error.code, 100).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
          message: clean(final.error?.message ?? "OpenAI function request failed", 300),
        }, 502);
      }

      const functionCalls = (final.output ?? []).filter((item) => item.type === "function_call" && item.name && item.call_id);
      if (!functionCalls.length) break;
      const toolOutputs: Array<Record<string, unknown>> = [];
      for (const call of functionCalls) {
        let args: unknown = {};
        try { args = JSON.parse(call.arguments || "{}") as unknown; } catch { args = null; }
        const result = await executeVerifiedTool(call.name!, args, c.env);
        calls.push({ name: call.name!, state: String((result as any).code ?? ((result as any).ok ? "OK" : "RESULT")), call_id: call.call_id! });
        toolOutputs.push({ type: "function_call_output", call_id: call.call_id!, output: JSON.stringify(result) });
      }
      input = [...input, ...(final.output ?? []).map((item) => item as Record<string, unknown>), ...toolOutputs];
    }

    const text = extractText(final);
    await recordChatUsage(c.env.DB, {
      conversationId: "owner-main",
      sourceSurface,
      model,
      poolId,
      usageTokens: usageTotal,
      route: allowPaidFallback && guarded ? "paid_fallback" : "incentive_guarded",
    });
    return c.json({
      ok: true,
      text: text || "Function inspection completed.",
      model: final.model ?? model,
      function_calls: calls,
      hosted_tools: {
        web_search: toolMode === "rag" ? "DISABLED_FOR_RAG_MODE" : "LIVE",
        file_search: toolMode === "web" ? "DISABLED_FOR_WEB_MODE" : store.state === "LIVE" ? "LIVE" : store.state,
        d1_canonical: d1Context.state,
      },
      tool_mode: toolMode,
      incentive_pool: poolId,
      routing_mode: incentive.routing_mode,
      paid_fallback: allowPaidFallback,
      usage_tokens: usageTotal,
      policy: "SIDE_EFFECTS_REQUIRE_SEPARATE_OWNER_APPROVAL",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
