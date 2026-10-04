import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type McpConfigBindings = AuthBindings & {
  DB?: D1;
  [key: string]: unknown;
};

type Env = { Bindings: McpConfigBindings };
type BindingRow = {
  id: string;
  provider_id: string;
  environment: string;
  binding_type: string;
  secret_ref: string | null;
  status: string;
  last_checked_at: string | null;
  metadata_json: string | null;
  updated_at: string;
};

type ToolSummary = {
  name: string;
  title: string | null;
  description: string | null;
  risk: "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";
  available: boolean;
};

const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION = "1LSS_OWNER_MAIN";
const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "mcp.linear.app",
  "mcp.notion.com",
  "mcp.figma.com",
  "mcp.canva.com",
  "github.com",
  "api.githubcopilot.com",
]);
const ALLOWED_SUFFIXES = [".openai.com", ".linear.app", ".notion.com", ".figma.com", ".canva.com", ".github.com"];
const SECRET_REF = /^(?:env:[A-Z][A-Z0-9_]{2,100}|\/providers\/[a-z0-9_-]+\/[a-z0-9_./-]{1,160})$/i;
const PROVIDER_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const SAFE_LABEL = /^[\w .:/+-]{0,120}$/;

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function safeEndpoint(value: unknown) {
  const raw = clean(value, 800);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host) && !ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseMetadata(raw: string | null) {
  try {
    const value = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    return {
      endpoint: safeEndpoint(value.endpoint),
      label: SAFE_LABEL.test(clean(value.label, 120)) ? clean(value.label, 120) : "",
      approval_mode: clean(value.approval_mode, 40) || "OGE26",
    };
  } catch {
    return { endpoint: null, label: "", approval_mode: "OGE26" };
  }
}

function bindingEnvelope(row: BindingRow) {
  const meta = parseMetadata(row.metadata_json);
  return {
    id: row.id,
    provider_id: row.provider_id,
    environment: row.environment,
    binding_type: row.binding_type,
    status: row.status,
    secret_ref_present: Boolean(row.secret_ref),
    secret_ref_kind: row.secret_ref?.startsWith("env:") ? "worker_binding" : row.secret_ref ? "server_secret_ref" : "none",
    endpoint: meta.endpoint,
    label: meta.label || row.provider_id,
    approval_mode: meta.approval_mode,
    last_checked_at: row.last_checked_at,
    updated_at: row.updated_at,
  };
}

function classifyTool(name: string): ToolSummary["risk"] {
  const lowered = name.toLowerCase();
  if (/(delete|destroy|revoke|purge|drop|terminate)/.test(lowered)) return "DANGEROUS";
  if (/(deploy|execute|run|trigger|publish)/.test(lowered)) return "EXECUTE";
  if (/(create|update|write|send|post|edit|move|archive|close|comment)/.test(lowered)) return "WRITE";
  return "READ";
}

function normalizeTools(value: unknown): ToolSummary[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const name = clean(item.name, 160) || "unnamed";
    return {
      name,
      title: clean(item.title, 200) || null,
      description: clean(item.description, 500) || null,
      risk: classifyTool(name),
      available: true,
    };
  });
}

function resolveSecret(binding: BindingRow, env: McpConfigBindings) {
  const ref = clean(binding.secret_ref, 220);
  if (!ref.startsWith("env:")) return "";
  const key = ref.slice(4);
  const value = env[key];
  return typeof value === "string" ? value : "";
}

async function jsonRpc(endpoint: string, method: string, params: Record<string, unknown>, id: number, token: string, sessionId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      const data = text.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (data) {
        try { body = JSON.parse(data) as Record<string, unknown>; } catch { body = {}; }
      }
    }
    return {
      ok: response.ok && !body.error,
      status: response.status,
      body,
      sessionId: response.headers.get("mcp-session-id") || undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function discover(binding: BindingRow, env: McpConfigBindings) {
  const meta = parseMetadata(binding.metadata_json);
  if (!meta.endpoint) {
    return { ok: false, state: "CONFIGURATION_REQUIRED", code: "MCP_ENDPOINT_REQUIRED", tools: [] as ToolSummary[] };
  }
  const token = resolveSecret(binding, env);
  if (binding.secret_ref?.startsWith("env:") && !token) {
    return { ok: false, state: "CONFIGURATION_REQUIRED", code: "MCP_AUTH_BINDING_MISSING", tools: [] as ToolSummary[] };
  }
  try {
    const initialized = await jsonRpc(meta.endpoint, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "OGENIC-WAVE", version: "1" },
    }, 1, token);
    if (!initialized.ok) {
      return { ok: false, state: "DEGRADED", code: `MCP_INITIALIZE_HTTP_${initialized.status}`, tools: [] as ToolSummary[] };
    }
    const listed = await jsonRpc(meta.endpoint, "tools/list", {}, 2, token, initialized.sessionId);
    const result = listed.body.result && typeof listed.body.result === "object" ? listed.body.result as Record<string, unknown> : {};
    const tools = normalizeTools(result.tools);
    return {
      ok: listed.ok,
      state: listed.ok ? "LIVE" : "DEGRADED",
      code: listed.ok ? "MCP_DISCOVERY_OK" : `MCP_TOOLS_LIST_HTTP_${listed.status}`,
      tools,
    };
  } catch {
    return { ok: false, state: "OFFLINE", code: "MCP_DISCOVERY_FAILED", tools: [] as ToolSummary[] };
  }
}

async function readBindings(db: D1) {
  const rows = await db.prepare(
    `SELECT id, provider_id, environment, binding_type, secret_ref, status, last_checked_at, metadata_json, updated_at
     FROM provider_bindings
     WHERE environment = 'staging' AND binding_type = 'mcp'
     ORDER BY provider_id ASC`,
  ).all<BindingRow>();
  return rows.results ?? [];
}

export function createMcpConfigApi() {
  const api = new Hono<Env>();

  api.use("/api/mcp-config/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/mcp-config/state", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const bindings = await readBindings(c.env.DB);
    return c.json({
      ok: true,
      runtime: "WAVE_MCP_CONFIG_V1",
      bindings: bindings.map(bindingEnvelope),
      states: ["LIVE", "DEGRADED", "SIMULATED", "OFFLINE", "CONFIGURATION_REQUIRED"],
      policy: "OGE26_APPROVAL_REQUIRED_FOR_CONSEQUENTIAL_TOOLS",
      canonical: { conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION },
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/mcp-config/discover", async (c) => {
    const provider = clean(c.req.query("provider"), 80).toLowerCase();
    if (!provider) return c.json({ ok: false, code: "PROVIDER_REQUIRED" }, 400);
    if (provider === "simulated") {
      return c.json({
        ok: true,
        state: "SIMULATED",
        real_available: false,
        provider: "simulated",
        tools: [
          { name: "read_status", title: "Read status", description: "Fixture-only read path for WAVE MCP control verification.", risk: "READ", available: true },
          { name: "list_capabilities", title: "List capabilities", description: "Fixture-only capability discovery.", risk: "READ", available: true },
        ],
        policy: "NO_EXTERNAL_SIDE_EFFECTS",
      }, 200, { "Cache-Control": "no-store" });
    }
    if (!PROVIDER_ID.test(provider) || !c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED" }, 503);
    const binding = await c.env.DB.prepare(
      `SELECT id, provider_id, environment, binding_type, secret_ref, status, last_checked_at, metadata_json, updated_at
       FROM provider_bindings WHERE provider_id = ? AND environment = 'staging' AND binding_type = 'mcp' LIMIT 1`,
    ).bind(provider).first<BindingRow>();
    if (!binding || binding.status === "disabled") {
      return c.json({ ok: false, state: "CONFIGURATION_REQUIRED", code: "MCP_BINDING_NOT_ENABLED", provider }, 503);
    }
    const result = await discover(binding, c.env);
    return c.json({ ...result, provider, binding: bindingEnvelope(binding), real_available: result.state === "LIVE" }, result.ok ? 200 : 503, { "Cache-Control": "no-store" });
  });

  api.post("/api/mcp-config/action", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const provider = clean(body.provider, 80).toLowerCase();
    const action = clean(body.action, 30).toLowerCase();
    if (!PROVIDER_ID.test(provider)) return c.json({ ok: false, code: "INVALID_PROVIDER" }, 400);
    const known = await c.env.DB.prepare("SELECT id FROM providers WHERE id = ? LIMIT 1").bind(provider).first<{ id: string }>();
    if (!known) return c.json({ ok: false, code: "UNKNOWN_PROVIDER" }, 404);

    if (action === "test") {
      const binding = await c.env.DB.prepare(
        `SELECT id, provider_id, environment, binding_type, secret_ref, status, last_checked_at, metadata_json, updated_at
         FROM provider_bindings WHERE provider_id = ? AND environment = 'staging' AND binding_type = 'mcp' LIMIT 1`,
      ).bind(provider).first<BindingRow>();
      if (!binding) return c.json({ ok: false, state: "CONFIGURATION_REQUIRED", code: "MCP_BINDING_NOT_FOUND" }, 404);
      const result = await discover(binding, c.env);
      return c.json({ ...result, provider, binding: bindingEnvelope(binding), side_effects: false }, result.ok ? 200 : 503, { "Cache-Control": "no-store" });
    }

    if (!["register", "enable", "disable"].includes(action)) return c.json({ ok: false, code: "UNSUPPORTED_ACTION" }, 400);
    if (body.approved !== true) {
      return c.json({ ok: false, code: "HUMAN_APPROVAL_REQUIRED", policy: "OGE26", requested_action: action }, 409);
    }

    if (action === "register") {
      const endpoint = safeEndpoint(body.endpoint);
      const secretRef = clean(body.secret_ref, 220);
      const label = clean(body.label, 120);
      if (!endpoint) return c.json({ ok: false, code: "MCP_ENDPOINT_NOT_ALLOWLISTED" }, 400);
      if (secretRef && !SECRET_REF.test(secretRef)) return c.json({ ok: false, code: "SECRET_REF_REQUIRED_NO_RAW_CREDENTIALS" }, 400);
      if (label && !SAFE_LABEL.test(label)) return c.json({ ok: false, code: "INVALID_LABEL" }, 400);
      const id = `mcp:${provider}:staging`;
      const metadata = JSON.stringify({ endpoint, label: label || provider, approval_mode: "OGE26" });
      await c.env.DB.prepare(
        `INSERT INTO provider_bindings(id, provider_id, environment, binding_type, secret_ref, status, metadata_json, updated_at)
         VALUES (?, ?, 'staging', 'mcp', ?, 'configured', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(provider_id, environment, binding_type) DO UPDATE SET
           secret_ref = excluded.secret_ref,
           status = 'configured',
           metadata_json = excluded.metadata_json,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(id, provider, secretRef || null, metadata).run();
      return c.json({ ok: true, provider, state: "CONFIGURED", secret_ref_present: Boolean(secretRef), endpoint, approval_mode: "OGE26" }, 200, { "Cache-Control": "no-store" });
    }

    await c.env.DB.prepare(
      `UPDATE provider_bindings SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE provider_id = ? AND environment = 'staging' AND binding_type = 'mcp'`,
    ).bind(action === "enable" ? "configured" : "disabled", provider).run();
    return c.json({ ok: true, provider, state: action === "enable" ? "CONFIGURED" : "OFFLINE", approval_mode: "OGE26" }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
