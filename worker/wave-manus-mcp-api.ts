import { buildBlueDiamondRegistry, type BlueDiamondRegistryEnv } from "./blue-diamond-registry";
import { verifyMcpAccessToken, type WaveMcpOAuthBindings } from "./wave-mcp-oauth";
import { AGENT_RELAY_TOOLS, AGENT_RELAY_TOOL_NAMES, callAgentRelayTool, type AgentRelayBindings } from "./agent-relay-tools";
import { AGENT_COLLISION_TOOLS, AGENT_COLLISION_TOOL_NAMES, callAgentCollisionTool, type CollisionSimulatorBindings } from "./agent-collision-simulator";

type D1Result<T = Record<string, unknown>> = { results?: T[] };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type WaveManusMcpBindings = BlueDiamondRegistryEnv & WaveMcpOAuthBindings & {
  DB?: D1;
  OGENIC_GIT_SHA?: string;
  OGENIC_GITHUB_BRANCH?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_PHASE?: string;
  OGENIC_RUNTIME?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
};

type JsonRpc = {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: Record<string, unknown>;
};

const MCP_VERSION = "2025-06-18";
const ACCEPTED_VERSIONS = new Set([MCP_VERSION, "2025-03-26", "2024-11-05"]);
const MAX_BODY_BYTES = 64 * 1024;
const CONVERSATION_ID = "owner-main";
const SESSION_LINE = "1LSS_OWNER_MAIN";

const TOOLS = [
  ...AGENT_RELAY_TOOLS,
  ...AGENT_COLLISION_TOOLS,
  {
    name: "oge_athena_snapshot",
    title: "OGE Athena — read-only system snapshot",
    description: "Return a compact, read-only snapshot of Worker provenance, D1 table query health, Athena/Blue Diamond declared capabilities, staging integration binding state, and stored owner-main 1LSS session references. It never executes tools or returns credential values.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:read"] }],
  },
  {
    name: "oge_d1_health",
    title: "OGE D1 — table health",
    description: "Run fixed COUNT(*) read-only probes against the existing canonical D1 tables. Reports each table as READ_OK, EMPTY, QUERY_ERROR, or D1_UNBOUND. Does not read message bodies or modify schema/data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:read"] }],
  },
  {
    name: "oge_athena_permissions",
    title: "OGE Athena — declared permissions",
    description: "List Blue Diamond actor identities, declared capabilities, runtime configuration states, credential-reference presence, and the canonical Yellow Stone execution-authority boundary. Declared capability is not proof of provider-side authorization.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:read"] }],
  },
  {
    name: "oge_1lss_sessions",
    title: "OGE Green — owner-main session references",
    description: "Read session references already recorded in chat_session_refs for owner-main / 1LSS_OWNER_MAIN. These are stored references, not proof that a remote provider session is currently active. Does not return session URLs or message content.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:read","ogenic:sessions:read"] }],
  },
  {
    name: "oge_integration_bindings",
    title: "OGE Integration Hub — staging bindings",
    description: "List sanitized staging provider_bindings for MCP, including configured status and whether a server-side credential reference exists. Never returns the reference value, token, or full endpoint URL.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:read"] }],
  },
];

const TABLES = [
  "system_meta",
  "toolkits",
  "system_planes",
  "policy_rules",
  "provider_bindings",
  "canonical_sources",
  "knowledge_documents",
  "chat_conversations",
  "chat_messages",
  "chat_session_refs",
] as const;

const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);

async function safeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Authorization, MCP-Protocol-Version");
  return new Response(JSON.stringify(body), { status, headers });
}

function rpcResult(id: string | number | null, result: unknown, version?: string) {
  return json(
    { jsonrpc: "2.0", id, result },
    200,
    version && ACCEPTED_VERSIONS.has(version) ? { "MCP-Protocol-Version": version } : {},
  );
}

function rpcError(id: string | number | null, code: number, message: string, version?: string) {
  return json(
    { jsonrpc: "2.0", id, error: { code, message } },
    200,
    version && ACCEPTED_VERSIONS.has(version) ? { "MCP-Protocol-Version": version } : {},
  );
}

function toolText(result: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError,
  };
}

function getLimit(value: unknown) {
  const parsed = Number(value ?? 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function safeActor(actor: ReturnType<typeof buildBlueDiamondRegistry>[number]) {
  return {
    actor_id: actor.actor_id,
    label: actor.label,
    provider: actor.provider,
    actor_class: actor.actor_class,
    maturity: actor.maturity,
    runtime_state: actor.state,
    declared_capabilities: actor.capabilities,
    credential_reference_present: Boolean(actor.auth_ref),
    health_reference: actor.health_ref,
    preflight: actor.preflight,
    priority: actor.priority,
    provider_side_authorization: "NOT_VERIFIED_BY_BLUE_DIAMOND_REGISTRY",
    execution_authority: "YELLOW_STONE_ONLY",
  };
}

async function d1Health(env: WaveManusMcpBindings) {
  if (!env.DB) {
    return {
      state: "D1_UNBOUND",
      overall_state: "D1_UNBOUND",
      conversation_id: CONVERSATION_ID,
      session_line: SESSION_LINE,
      tables: TABLES.map((table) => ({ table, state: "D1_UNBOUND" })),
    };
  }

  const tables = await Promise.all(TABLES.map(async (table) => {
    try {
      const row = await env.DB!.prepare(`SELECT COUNT(*) AS row_count FROM ${table}`).first<{ row_count?: number }>();
      const raw = Number(row?.row_count);
      if (!Number.isFinite(raw)) {
        return { table, state: "QUERY_ERROR", error_code: "COUNT_NOT_RETURNED" };
      }
      return { table, state: raw === 0 ? "EMPTY" : "READ_OK", row_count: raw };
    } catch {
      return { table, state: "QUERY_ERROR", error_code: "TABLE_MISSING_OR_QUERY_FAILED" };
    }
  }));

  const failed = tables.filter((row) => row.state === "QUERY_ERROR" || row.state === "D1_UNBOUND").length;
  return {
    state: failed === 0 ? "LIVE_READ_VERIFIED" : failed === tables.length ? "UNAVAILABLE" : "PARTIAL",
    overall_state: failed === 0 ? "LIVE_READ_VERIFIED" : failed === tables.length ? "UNAVAILABLE" : "PARTIAL",
    conversation_id: CONVERSATION_ID,
    session_line: SESSION_LINE,
    checked_at: new Date().toISOString(),
    tables,
    caveat: "Read-only COUNT(*) probes only; row counts do not prove that every business record is correct.",
  };
}

function permissions(env: WaveManusMcpBindings) {
  const actors = buildBlueDiamondRegistry(env);
  return {
    source: "BLUE_DIAMOND_REGISTRY",
    checked_at: new Date().toISOString(),
    actor_count: actors.length,
    execution_authority: "YELLOW_STONE_ONLY",
    direct_provider_execution_bypass: false,
    authorization_note: "Declared capabilities and Worker credential-reference presence are not proof of provider-side scopes or a successful live provider handshake.",
    actors: actors.map(safeActor),
  };
}

async function integrationBindings(env: WaveManusMcpBindings) {
  if (!env.DB) return { state: "D1_UNBOUND", bindings: [] };
  try {
    const rows = await env.DB.prepare(
      `SELECT provider_id, environment, binding_type, status, last_checked_at, updated_at, metadata_json, secret_ref
       FROM provider_bindings
       WHERE environment = 'staging'
       ORDER BY provider_id, binding_type`,
    ).all<Record<string, unknown>>();
    return {
      state: "READ_OK",
      count: (rows.results ?? []).length,
      bindings: (rows.results ?? []).map((row) => {
        let label = "";
        let endpointHost: string | null = null;
        try {
          const metadata = JSON.parse(String(row.metadata_json ?? "{}")) as Record<string, unknown>;
          label = clean(metadata.label, 100);
          const endpoint = clean(metadata.endpoint, 800);
          if (endpoint) endpointHost = new URL(endpoint).hostname.toLowerCase();
        } catch {
          // Metadata is optional; never return its raw contents.
        }
        return {
          provider_id: clean(row.provider_id, 100),
          environment: "staging",
          binding_type: clean(row.binding_type, 60),
          status: clean(row.status, 50),
          label: label || clean(row.provider_id, 100),
          endpoint_host: endpointHost,
          credential_reference_present: Boolean(row.secret_ref),
          last_checked_at: row.last_checked_at ?? null,
          updated_at: row.updated_at ?? null,
        };
      }),
    };
  } catch {
    return { state: "QUERY_ERROR", error_code: "PROVIDER_BINDINGS_QUERY_FAILED", bindings: [] };
  }
}

async function sessionReferences(env: WaveManusMcpBindings, limit: number) {
  if (!env.DB) {
    return {
      state: "D1_UNBOUND",
      conversation_id: CONVERSATION_ID,
      session_line: SESSION_LINE,
      source: "chat_session_refs",
      session_semantics: "STORED_REFERENCE_ONLY_NOT_LIVE_PROVIDER_SESSION_PROOF",
      sessions: [],
    };
  }
  try {
    const [rows, sequence] = await Promise.all([
      env.DB.prepare(
        `SELECT source_surface, session_ref, label, first_sequence, last_sequence, first_seen_at, last_seen_at
         FROM chat_session_refs
         WHERE conversation_id = ?
         ORDER BY last_seen_at DESC, last_sequence DESC
         LIMIT ?`,
      ).bind(CONVERSATION_ID, limit).all<Record<string, unknown>>(),
      env.DB.prepare(
        "SELECT COALESCE(MAX(sequence_no), 0) AS latest_sequence FROM chat_messages WHERE conversation_id = ?",
      ).bind(CONVERSATION_ID).first<{ latest_sequence?: number }>(),
    ]);
    return {
      state: "READ_OK",
      conversation_id: CONVERSATION_ID,
      session_line: SESSION_LINE,
      latest_sequence: Number(sequence?.latest_sequence ?? 0),
      source: "chat_session_refs",
      session_semantics: "STORED_REFERENCE_ONLY_NOT_LIVE_PROVIDER_SESSION_PROOF",
      count: (rows.results ?? []).length,
      sessions: (rows.results ?? []).map((row) => ({
        source_surface: clean(row.source_surface, 60),
        session_ref: clean(row.session_ref, 300),
        label: clean(row.label, 160) || null,
        first_sequence: row.first_sequence ?? null,
        last_sequence: row.last_sequence ?? null,
        first_seen_at: row.first_seen_at ?? null,
        last_seen_at: row.last_seen_at ?? null,
      })),
    };
  } catch {
    return {
      state: "QUERY_ERROR",
      error_code: "SESSION_REFERENCES_QUERY_FAILED",
      conversation_id: CONVERSATION_ID,
      session_line: SESSION_LINE,
      source: "chat_session_refs",
      sessions: [],
    };
  }
}

async function runtimeStatus(env: WaveManusMcpBindings) {
  const version = env.CF_VERSION_METADATA;
  const health = await d1Health(env);
  return {
    state: "READ_ONLY_RUNTIME_SNAPSHOT",
    checked_at: new Date().toISOString(),
    runtime: clean(env.OGENIC_RUNTIME, 60) || "cloudflare",
    phase: clean(env.OGENIC_PHASE, 30) || "VI",
    git_sha: clean(env.OGENIC_GIT_SHA, 80) || "UNPINNED",
    git_branch: clean(env.OGENIC_GITHUB_BRANCH, 160) || "UNKNOWN",
    build_uuid: clean(env.OGENIC_BUILD_UUID, 120) || null,
    worker_version: {
      id: clean(version?.id, 120) || null,
      tag: clean(version?.tag, 120) || null,
      timestamp: clean(version?.timestamp, 120) || null,
    },
    d1_binding: env.DB ? "BOUND" : "UNBOUND",
    d1_query_state: health.overall_state,
    conversation_id: CONVERSATION_ID,
    session_line: SESSION_LINE,
  };
}

async function snapshot(env: WaveManusMcpBindings) {
  const [runtime, d1, access, bindings, sessions] = await Promise.all([
    runtimeStatus(env),
    d1Health(env),
    Promise.resolve(permissions(env)),
    integrationBindings(env),
    sessionReferences(env, 20),
  ]);
  return {
    product: "OGE ATHENA MCP",
    read_only: true,
    generated_at: new Date().toISOString(),
    runtime,
    d1,
    permission_registry: access,
    integration_bindings: bindings,
    one_line_session_references: sessions,
    boundaries: {
      execution_authority: "YELLOW_STONE_ONLY",
      writes_enabled: false,
      provider_side_permissions: "NOT_VERIFIED_BY_DECLARED_CAPABILITIES",
      stored_session_refs_are_live_sessions: false,
      secrets_returned: false,
    },
  };
}

async function callTool(name: string, args: Record<string, unknown>, env: WaveManusMcpBindings, agentId?: string) {
  if (AGENT_RELAY_TOOL_NAMES.has(name)) return callAgentRelayTool(name, args, env as AgentRelayBindings, agentId);
  if (AGENT_COLLISION_TOOL_NAMES.has(name)) return callAgentCollisionTool(name, args, env as CollisionSimulatorBindings, agentId);
  switch (name) {
    case "oge_athena_snapshot":
      return snapshot(env);
    case "oge_d1_health":
      return d1Health(env);
    case "oge_athena_permissions":
      return permissions(env);
    case "oge_1lss_sessions":
      return sessionReferences(env, getLimit(args.limit));
    case "oge_integration_bindings":
      return integrationBindings(env);
    default:
      throw new Error("UNKNOWN_TOOL");
  }
}

const RESOURCE_METADATA_URL = "https://wave.ogenicchocolate.com/.well-known/oauth-protected-resource/mcp";

function authChallenge(id: string | number | null, requiredScopes: string[], protocolVersion: string, reason: string) {
  const scopeText = requiredScopes.join(" ");
  const message = reason === "d1_unavailable"
    ? "OGE Athena cannot verify the token because D1 is unavailable. Retry after runtime recovery."
    : "Sign in to your OGENIC WAVE owner account to connect OGE Athena.";
  const challenge = `Bearer resource_metadata="${RESOURCE_METADATA_URL}", error="invalid_token", error_description="${message.replace(/["\\\\]/g, "")}", scope="${scopeText}"`;
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify({ ok: false, code: reason === "d1_unavailable" ? "AUTH_STORE_UNAVAILABLE" : "OAUTH_AUTHORIZATION_REQUIRED", required_scopes: requiredScopes }) }],
    isError: true,
    _meta: { "mcp/www_authenticate": [challenge] },
  }, protocolVersion);
}

export async function handleWaveManusMcp(request: Request, env: WaveManusMcpBindings): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp") return json({ ok: false, code: "NOT_FOUND" }, 404);
  if (request.method === "GET") {
    return json({ ok: false, code: "STREAMABLE_HTTP_POST_REQUIRED" }, 405, { Allow: "POST, OPTIONS" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
        "Access-Control-Max-Age": "600",
      },
    });
  }
  if (request.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, { Allow: "POST, OPTIONS" });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413);

  let body: JsonRpc;
  try {
    body = JSON.parse(raw) as JsonRpc;
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32600, message: "Invalid Request" } }, 400);
  }

  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params : {};
  const id = (typeof body.id === "string" || typeof body.id === "number" || body.id === null) ? body.id : null;
  const headerVersion = request.headers.get("MCP-Protocol-Version") ?? undefined;
  const requestedVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : headerVersion;
  const protocolVersion = requestedVersion && ACCEPTED_VERSIONS.has(requestedVersion) ? requestedVersion : MCP_VERSION;

  if (body.method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  if (body.method === "initialize") {
    if (typeof body.id !== "string" && typeof body.id !== "number") {
      return rpcError(null, -32600, "initialize requires a request id", MCP_VERSION);
    }
    if (typeof params.protocolVersion === "string" && !ACCEPTED_VERSIONS.has(params.protocolVersion)) {
      return rpcError(id, -32602, "Unsupported MCP protocol version", MCP_VERSION);
    }
    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "oge-athena", version: "0.1.0" },
      instructions: "OGE Athena is a read-only observability bridge. Use oge_athena_snapshot first. It reports declared capabilities separately from verified provider authorization. Stored 1LSS session references are not proof of live provider sessions. All consequential execution remains with Yellow Stone and Owner approval.",
    }, protocolVersion);
  }

  if (body.method === "ping") return rpcResult(id, {}, protocolVersion);
  if (body.method === "tools/list") return rpcResult(id, { tools: TOOLS }, protocolVersion);

  if (body.method === "tools/call") {
    if (typeof params.name !== "string") return rpcError(id, -32602, "Tool name is required", protocolVersion);
    const name = params.name;
    const requiredScopes = name === "oge_1lss_sessions"
      ? ["ogenic:read", "ogenic:sessions:read"]
      : AGENT_RELAY_TOOL_NAMES.has(name)
        ? ["ogenic:relay"]
        : AGENT_COLLISION_TOOL_NAMES.has(name)
          ? ["ogenic:simulate"]
          : ["ogenic:read"];
    const auth = await verifyMcpAccessToken(request, env);
    if (!auth.ok) return authChallenge(id, requiredScopes, protocolVersion, auth.reason);
    if (!requiredScopes.every((scope) => auth.scopes.includes(scope))) {
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify({ ok: false, code: "INSUFFICIENT_SCOPE", required_scopes: requiredScopes }) }],
        isError: true,
        _meta: {
          "mcp/www_authenticate": [
            `Bearer resource_metadata="${RESOURCE_METADATA_URL}", error="insufficient_scope", error_description="Reconnect OGE Athena and grant the requested read scope.", scope="${requiredScopes.join(" ")}"`,
          ],
        },
      }, protocolVersion);
    }
    const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? params.arguments as Record<string, unknown>
      : {};
    try {
      const value = await callTool(name, args, env, auth.agentId);
      return rpcResult(id, toolText(value), protocolVersion);
    } catch (error) {
      const knownErrors = new Set(["UNKNOWN_TOOL", "D1_UNBOUND", "AGENT_IDENTITY_NOT_BOUND", "RECIPIENT_AGENT_INVALID", "SELF_MESSAGE_NOT_ALLOWED", "MESSAGE_CONTENT_REQUIRED", "MESSAGE_TOO_LARGE", "SECRET_LIKE_CONTENT_REJECTED", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_CONFLICT", "THREAD_ID_INVALID", "CORRELATION_ID_INVALID", "THREAD_NOT_FOUND_OR_FORBIDDEN", "THREAD_PARTICIPANT_MISMATCH", "CORRELATION_ID_MISMATCH", "CORRELATION_ID_REQUIRES_EXISTING_THREAD", "MESSAGE_ID_INVALID", "MESSAGE_NOT_FOUND", "MESSAGE_ACK_FORBIDDEN", "MESSAGE_ACK_STATE_CONFLICT", "SCENARIO_TYPE_INVALID", "PEER_AGENT_INVALID", "BASE_REVISION_REQUIRED", "SECRET_LIKE_SEED_REJECTED", "SIMULATION_ID_INVALID", "SIMULATION_NOT_FOUND", "SIMULATION_PARTICIPANT_FORBIDDEN", "SIMULATION_ALREADY_TERMINAL_USE_REPLAY", "REPORT_SUMMARY_REQUIRED", "DETECTED_FAULT_BOOLEAN_REQUIRED", "PROPOSED_RESOLUTION_REQUIRED", "SIMULATION_FIELD_TOO_LARGE", "EVIDENCE_REFERENCE_INVALID", "AGENT_REPORT_ALREADY_SUBMITTED_START_NEW_RUN_TO_REVISE", "SIMULATION_NOT_COMPLETE"]);
      const code = error instanceof Error && knownErrors.has(error.message) ? error.message : error instanceof Error && error.message === "UNKNOWN_TOOL" ? "UNKNOWN_TOOL" : "TOOL_EXECUTION_FAILED";
      return rpcResult(id, toolText({ ok: false, code }, true), protocolVersion);
    }
  }

  return rpcError(id, -32601, "Method not found", protocolVersion);
}
