import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";
import {
  executeConnectorFunction,
  readConnectorRegistry,
  recentConnectorEvents,
  testConnector,
  type ConnectorBindings,
} from "./connector-runtime";
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

const functionTools = [
  {
    type: "function",
    name: "connector_status",
    description: "Read current OGENIC connector health/configuration for LINE, Meta, n8n, HTTP hooks, OpenAI webhooks, GitHub and Linear. Read-only.",
    parameters: {
      type: "object",
      properties: { connector: { type: "string", description: "Optional connector id, for example line, meta, n8n, http, openai_hooks." } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_recent_hook_events",
    description: "Read recent verified/rejected webhook audit events from OGENIC D1. Read-only and metadata-redacted.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "http_action",
    description: "Propose an outbound action against a preconfigured OGENIC connector. Staging requires separate Human Approval before side effects execute.",
    parameters: {
      type: "object",
      properties: {
        connector: { type: "string" },
        action: { type: "string" },
        summary: { type: "string" },
      },
      required: ["connector", "action"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "trigger_n8n_workflow",
    description: "Propose running a configured n8n workflow. It must not execute if n8n is quota-blocked or without separate owner approval.",
    parameters: {
      type: "object",
      properties: { workflow_id: { type: "string" }, summary: { type: "string" } },
      required: ["workflow_id"],
      additionalProperties: false,
    },
  },
];

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
  usage?: { total_tokens?: number };
  error?: { code?: string; message?: string } | string | null;
  item?: {
    type?: string;
    phase?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
};

async function readAgentSessionStream(response: Response) {
  if (!response.body) {
    return { sessionId: "", terminal: "failed", text: "", usageTokens: 0, error: "AGENT_STREAM_UNAVAILABLE" };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sessionId = "";
  let terminal = "";
  let finalText = "";
  let fallbackText = "";
  let usageTokens = 0;
  let streamError = "";

  const consume = (event: AgentStreamEvent) => {
    if (typeof event.session_id === "string") sessionId = event.session_id;
    usageTokens = Math.max(usageTokens, Number(event.usage?.total_tokens ?? 0));
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
    if (event.type === "agent.session.turn.completed") terminal = "completed";
    if (event.type === "agent.session.turn.cancelled") terminal = "cancelled";
    if (event.type === "agent.session.turn.failed" || event.type === "agent.session.failed") {
      terminal = "failed";
      if (typeof event.error === "string") streamError = event.error;
      else if (event.error && typeof event.error === "object") {
        streamError = clean(event.error.message || event.error.code || "AGENT_SESSION_FAILED", 300);
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

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let split = buffer.indexOf("\n\n");
    while (split >= 0) {
      consumeBlock(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeBlock(buffer);

  return {
    sessionId,
    terminal: terminal || "unknown",
    text: finalText || fallbackText,
    usageTokens,
    error: streamError,
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

    const body: {
      prompt?: unknown;
      model?: unknown;
      reasoning_effort?: unknown;
      allow_paid_fallback?: unknown;
      source_surface?: unknown;
    } = await c.req.json<{
      prompt?: unknown;
      model?: unknown;
      reasoning_effort?: unknown;
      allow_paid_fallback?: unknown;
      source_surface?: unknown;
    }>().catch(() => ({}));

    const prompt = clean(body.prompt, 7000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);

    const requestedModel = clean(body.model, 80);
    const supportedModels = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra"]);
    const model = supportedModels.has(requestedModel) ? requestedModel : "gpt-5.6-sol";
    const requestedEffort = clean(body.reasoning_effort, 20);
    const effort = ["low", "medium", "high", "xhigh", "max"].includes(requestedEffort) ? requestedEffort : "medium";
    const allowPaidFallback = body.allow_paid_fallback === true;
    const sourceSurface = clean(body.source_surface, 60) || "ogenic-ui";

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

    const d1Context = await readCanonicalD1Context(c.env.DB, {
      git_sha: c.env.OGENIC_GIT_SHA,
      git_branch: c.env.OGENIC_GITHUB_BRANCH,
      build_uuid: c.env.OGENIC_BUILD_UUID,
      runtime: c.env.OGENIC_RUNTIME,
      phase: c.env.OGENIC_PHASE,
      version: c.env.CF_VERSION_METADATA ?? null,
    });

    const agentResponse = await fetch("https://api.openai.com/v1/agents/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "agents=v1",
        "Content-Type": "application/json",
        "Idempotency-Key": c.req.header("idempotency-key") ?? `agent_${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        agent: {
          name: "OGENIC Agent AI",
          model,
          instructions:
            "You are OGENIC Agent AI on staging. Preserve SAME MIND continuity using the supplied canonical D1 context. " +
            "Never claim an external side effect occurred unless verified. Production-affecting, destructive, credential, billing, " +
            "or permission changes require separate owner approval. Reply in the user's language.\n\n" +
            "CANONICAL D1 + LIVE RUNTIME EVIDENCE:\n" + d1Context.text,
          reasoning: { effort, summary: "concise" },
          multi_agent: { enabled: false, max_concurrent_subagents: 1 },
          service_tier: "auto",
        },
        environment: { type: "none" },
        input: prompt,
        metadata: {
          project: "ogenic-phase-vi",
          environment: "staging",
          branch: c.env.OGENIC_GITHUB_BRANCH || "phase-vi-provider-incentive-metering",
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

    const agent = await readAgentSessionStream(agentResponse);
    if (agent.terminal !== "completed") {
      return c.json({
        ok: false,
        code: `AGENT_${agent.terminal.toUpperCase()}`,
        message: agent.error || "Agent session did not complete",
        agent_session_id: agent.sessionId || null,
      }, 502);
    }
    if (!agent.text) {
      return c.json({
        ok: false,
        code: "AGENT_EMPTY_OUTPUT",
        agent_session_id: agent.sessionId || null,
      }, 502);
    }

    await recordChatUsage(c.env.DB, {
      conversationId: "owner-main",
      sourceSurface,
      model,
      poolId,
      usageTokens: agent.usageTokens,
      route: allowPaidFallback && guarded ? "paid_fallback" : "agent_session",
    });

    return c.json({
      ok: true,
      text: agent.text,
      model,
      agent_session_id: agent.sessionId || null,
      agent_terminal: agent.terminal,
      memory: "D1_CANONICAL",
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      d1_canonical: d1Context.state,
      incentive_pool: poolId,
      routing_mode: incentive.routing_mode,
      paid_fallback: allowPaidFallback,
      usage_tokens: agent.usageTokens,
      runtime: "OPENAI_AGENT_SESSION",
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
    const requestTools: Array<Record<string, unknown>> = toolMode === "auto" ? [...functionTools, ...hostedTools] : hostedTools;

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
          instructions: "You are the OGENIC connector supervisor. The context block combines verified read-only D1 canonical state with live runtime evidence from the currently executing Worker version. Use it directly for OGENIC toolkit, policy, provider binding, canonical source and knowledge questions. Use only the selected hosted tool mode for web/RAG requests. Never claim an external action was executed when a function returns HUMAN_APPROVAL_REQUIRED. LINE/Meta/n8n credentials remain server-side. Prefer verified tool facts over guesses. Reply in the user's language.\n\nCANONICAL D1 + LIVE RUNTIME EVIDENCE:\n" + d1Context.text,
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
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.arguments || "{}") as Record<string, unknown>; } catch { args = {}; }
        const result = await executeConnectorFunction(c.env, call.name!, args);
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
