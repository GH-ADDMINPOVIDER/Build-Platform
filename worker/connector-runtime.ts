import { Hono } from "hono";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
export type ConnectorD1 = { prepare: (query: string) => D1Prepared };

export type ConnectorBindings = {
  DB?: ConnectorD1;
  GITHUB_TOKEN?: string;
  LINEAR_API_KEY?: string;
  N8N_API_KEY?: string;
  N8N_BASE_URL?: string;
  N8N_SELFHOST_BASE_URL?: string;
  N8N_SELFHOST_API_KEY?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_SECRET_CHANNEL?: string;
  LINE_ID_USE?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  OPENAI_WEBHOOK_SECRET?: string;
  OGENIC_GENERIC_HOOK_SECRET?: string;
};

type ConnectorState = "LIVE" | "CONFIGURED" | "CONFIGURATION_REQUIRED" | "DEGRADED" | "QUOTA_BLOCKED" | "ERROR";
export type ConnectorStatus = {
  id: string;
  label: string;
  kind: string;
  state: ConnectorState;
  route_mode: "DIRECT_HTTP" | "N8N" | "MCP" | "DISABLED";
  summary: string;
  last_error?: string | null;
  checked_at: string;
};

type HookEvent = {
  provider: string;
  event_type: string;
  state: string;
  external_id?: string | null;
  detail?: Record<string, unknown>;
};

const enc = new TextEncoder();
const clean = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function safeBaseUrl(value?: string) {
  const raw = clean(value, 500).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function redactError(value: unknown) {
  return clean(value instanceof Error ? value.message : value, 180).replace(/(bearer|token|secret|key)\s+[A-Za-z0-9._~+\/=:-]+/gi, "$1 [REDACTED]");
}

function timingSafeString(a: string, b: string) {
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function hmacBytes(secret: string | Uint8Array, body: string) {
  const keyData = typeof secret === "string" ? enc.encode(secret) : secret;
  const keyBuffer = keyData.slice().buffer as ArrayBuffer;
  const bodyBuffer = enc.encode(body).slice().buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, bodyBuffer));
}
function hex(bytes: Uint8Array) { return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function b64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromB64(value: string) {
  try {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return new Uint8Array(); }
}
async function sha256Hex(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}

async function logEvent(env: ConnectorBindings, event: HookEvent) {
  if (!env.DB) return;
  const id = `cev_${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO connector_events(id, provider, event_type, state, external_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    clean(event.provider, 60),
    clean(event.event_type, 100),
    clean(event.state, 60),
    clean(event.external_id, 180) || null,
    JSON.stringify(event.detail ?? {}).slice(0, 6000),
    Date.now(),
  ).run().catch(() => undefined);
}

async function markDedup(env: ConnectorBindings, provider: string, id: string) {
  if (!env.DB) return false;
  const existing = await env.DB.prepare("SELECT event_key FROM connector_hook_dedup WHERE event_key = ?")
    .bind(`${provider}:${id}`).first<{ event_key: string }>();
  if (existing) return true;
  await env.DB.prepare("INSERT INTO connector_hook_dedup(event_key, provider, created_at) VALUES (?, ?, ?)")
    .bind(`${provider}:${id}`, provider, Date.now()).run();
  return false;
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 1200); }
    return { response, body, text };
  } finally { clearTimeout(timer); }
}

export async function inspectN8n(env: ConnectorBindings): Promise<ConnectorStatus> {
  // The legacy n8n Cloud tenant is preserved as an archive and may 404.
  // Prefer the existing Railway self-host ONLY with its own Infisical-bound
  // credential; never send legacy cloud credentials to a different host.
  const selfhostBase = safeBaseUrl(env.N8N_SELFHOST_BASE_URL);
  const usingSelfhost = Boolean(selfhostBase);
  const base = selfhostBase || safeBaseUrl(env.N8N_BASE_URL);
  const key = clean(usingSelfhost ? env.N8N_SELFHOST_API_KEY : env.N8N_API_KEY, 4000);
  const source = usingSelfhost ? "SELFHOST_STAGING" : "LEGACY_CLOUD";
  if (!base || !key) return {
    id: "n8n", label: "n8n", kind: "automation", state: "CONFIGURATION_REQUIRED", route_mode: "DISABLED",
    summary: !base ? "n8n staging URL missing" : usingSelfhost ? "Staging self-host credential not bound" : "Legacy cloud credential not bound",
    last_error: !base ? "N8N_URL_UNBOUND" : usingSelfhost ? "N8N_SELFHOST_API_KEY_UNBOUND" : "N8N_API_KEY_UNBOUND",
    checked_at: nowIso(),
  };
  const headers = { Accept: "application/json", "X-N8N-API-KEY": key };
  try {
    const workflows = await fetchJson(`${base}/api/v1/workflows?limit=1`, { headers });
    if (!workflows.response.ok) return {
      id: "n8n", label: "n8n", kind: "automation",
      state: workflows.response.status === 401 || workflows.response.status === 403 ? "CONFIGURATION_REQUIRED" : "ERROR",
      route_mode: "DISABLED",
      summary: source + " workflows API HTTP " + workflows.response.status,
      last_error: source + "_WORKFLOWS_HTTP_" + workflows.response.status,
      checked_at: nowIso(),
    };
    const executions = await fetchJson(`${base}/api/v1/executions?limit=10`, { headers });
    const quotaText = String(executions.text).toLowerCase();
    if (quotaText.includes("execution limit reached") || quotaText.includes("execution quota") || quotaText.includes("monthly execution limit")) return {
      id: "n8n", label: "n8n", kind: "automation", state: "QUOTA_BLOCKED", route_mode: "DISABLED",
      summary: source + " API reachable; execution quota blocked", last_error: "EXECUTION_LIMIT_REACHED", checked_at: nowIso(),
    };
    return {
      id: "n8n", label: "n8n", kind: "automation",
      state: executions.response.ok ? "LIVE" : "DEGRADED",
      route_mode: "N8N",
      summary: executions.response.ok ? source + " API workflows and executions readable" : source + " workflows readable; executions HTTP " + executions.response.status,
      last_error: executions.response.ok ? null : source + "_EXECUTIONS_HTTP_" + executions.response.status,
      checked_at: nowIso(),
    };
  } catch (error) {
    return { id: "n8n", label: "n8n", kind: "automation", state: "ERROR", route_mode: "DISABLED",
      summary: source + " API unavailable", last_error: redactError(error), checked_at: nowIso() };
  }
}

export async function readConnectorRegistry(env: ConnectorBindings): Promise<ConnectorStatus[]> {
  const lineReady = Boolean(clean(env.LINE_CHANNEL_ACCESS_TOKEN, 4000) && clean(env.LINE_SECRET_CHANNEL, 4000));
  const metaReady = Boolean(clean(env.META_PAGE_ACCESS_TOKEN, 4000) && clean(env.META_APP_SECRET, 4000) && clean(env.META_VERIFY_TOKEN, 4000));
  const genericReady = Boolean(clean(env.OGENIC_GENERIC_HOOK_SECRET, 4000));
  const openaiHookReady = Boolean(clean(env.OPENAI_WEBHOOK_SECRET, 4000));
  const n8n = await inspectN8n(env);
  return [
    { id: "line", label: "LINE OA", kind: "messaging", state: lineReady ? "CONFIGURED" : "CONFIGURATION_REQUIRED", route_mode: lineReady ? "DIRECT_HTTP" : "DISABLED", summary: lineReady ? "Direct Messaging API + verified webhook ready" : "LINE token/channel secret not bound to Worker", checked_at: nowIso() },
    { id: "meta", label: "Meta", kind: "messaging", state: metaReady ? "CONFIGURED" : "CONFIGURATION_REQUIRED", route_mode: metaReady ? "DIRECT_HTTP" : "DISABLED", summary: metaReady ? "Graph API + webhook verification ready" : "Meta page token/app secret/verify token required", checked_at: nowIso() },
    n8n,
    { id: "http", label: "HTTP Hooks", kind: "generic", state: genericReady ? "CONFIGURED" : "CONFIGURATION_REQUIRED", route_mode: genericReady ? "DIRECT_HTTP" : "DISABLED", summary: genericReady ? "Signed generic inbound hook ready" : "Generic hook secret not configured", checked_at: nowIso() },
    { id: "openai_hooks", label: "OpenAI Webhooks", kind: "openai", state: openaiHookReady ? "CONFIGURED" : "CONFIGURATION_REQUIRED", route_mode: openaiHookReady ? "DIRECT_HTTP" : "DISABLED", summary: openaiHookReady ? "Standard Webhooks signature verification ready" : "OPENAI_WEBHOOK_SECRET required", checked_at: nowIso() },
    { id: "github", label: "GitHub", kind: "developer", state: clean(env.GITHUB_TOKEN, 4000) ? "CONFIGURED" : "CONFIGURATION_REQUIRED", route_mode: clean(env.GITHUB_TOKEN, 4000) ? "DIRECT_HTTP" : "DISABLED", summary: "Existing server adapter", checked_at: nowIso() },
    { id: "linear", label: "Linear", kind: "developer", state: clean(env.LINEAR_API_KEY, 4000) ? "CONFIGURED" : "CONFIGURATION_REQUIRED", route_mode: clean(env.LINEAR_API_KEY, 4000) ? "DIRECT_HTTP" : "DISABLED", summary: "Existing server adapter", checked_at: nowIso() },
  ];
}

export async function recentConnectorEvents(env: ConnectorBindings, limit = 30) {
  if (!env.DB) return [];
  const rows = await env.DB.prepare(
    "SELECT id, provider, event_type, state, external_id, detail_json, created_at FROM connector_events ORDER BY created_at DESC LIMIT ?",
  ).bind(Math.max(1, Math.min(100, limit))).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({ ...row, detail_json: row.detail_json ? "REDACTED_METADATA_AVAILABLE" : null }));
}

export async function testConnector(env: ConnectorBindings, connectorId: string) {
  if (connectorId === "n8n") return inspectN8n(env);
  if (connectorId === "line") {
    const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN, 4000);
    if (!token) return { ok: false, code: "CONFIGURATION_REQUIRED", missing: "LINE_CHANNEL_ACCESS_TOKEN" };
    try {
      const { response, body } = await fetchJson("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      await logEvent(env, { provider: "line", event_type: "SAFE_TEST", state: response.ok ? "OK" : "ERROR", detail: { http_status: response.status } });
      return { ok: response.ok, connector: "line", http_status: response.status, result: response.ok ? body : undefined };
    } catch (error) { return { ok: false, connector: "line", code: "LINE_TEST_FAILED", message: redactError(error) }; }
  }
  const registry = await readConnectorRegistry(env);
  const item = registry.find((candidate) => candidate.id === connectorId);
  return item ? { ok: item.state === "LIVE" || item.state === "CONFIGURED", connector: item } : { ok: false, code: "UNKNOWN_CONNECTOR" };
}

export async function executeConnectorFunction(env: ConnectorBindings, name: string, args: Record<string, unknown>) {
  await logEvent(env, { provider: clean(args.connector, 60) || "ogenic", event_type: `FUNCTION_CALL:${clean(name, 80)}`, state: "REQUESTED", detail: { safe: true } });
  if (name === "connector_status") {
    const registry = await readConnectorRegistry(env);
    const connector = clean(args.connector, 60);
    return { ok: true, connectors: connector ? registry.filter((item) => item.id === connector) : registry };
  }
  if (name === "list_recent_hook_events") {
    return { ok: true, events: await recentConnectorEvents(env, Number(args.limit ?? 20)) };
  }
  if (name === "http_action" || name === "trigger_n8n_workflow") {
    return {
      ok: false,
      code: "HUMAN_APPROVAL_REQUIRED",
      message: "This function can cause an external side effect. The staging AI bridge may propose it, but it cannot execute it without a separate owner approval action.",
      requested: { name, connector: clean(args.connector, 60), action: clean(args.action ?? args.workflow_id, 120) },
    };
  }
  return { ok: false, code: "UNKNOWN_FUNCTION", name: clean(name, 100) };
}

async function acceptHook(env: ConnectorBindings, provider: string, raw: string, externalId: string, eventType: string) {
  const id = externalId || await sha256Hex(raw);
  if (await markDedup(env, provider, id)) {
    await logEvent(env, { provider, event_type: eventType, state: "DUPLICATE", external_id: id });
    return { duplicate: true, id };
  }
  await logEvent(env, { provider, event_type: eventType, state: "VERIFIED", external_id: id, detail: { bytes: enc.encode(raw).byteLength } });
  return { duplicate: false, id };
}

export function createPublicHookApi() {
  const hooks = new Hono<{ Bindings: ConnectorBindings }>();

  hooks.post("/hooks/line", async (c) => {
    const secret = clean(c.env.LINE_SECRET_CHANNEL, 4000);
    if (!secret) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", provider: "line" }, 503);
    const raw = await c.req.text();
    const signature = clean(c.req.header("x-line-signature"), 4000);
    const expected = b64(await hmacBytes(secret, raw));
    if (!signature || !timingSafeString(signature, expected)) {
      await logEvent(c.env, { provider: "line", event_type: "WEBHOOK", state: "REJECTED_SIGNATURE" });
      return c.json({ ok: false, code: "INVALID_SIGNATURE" }, 401);
    }
    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { return c.json({ ok: false, code: "INVALID_JSON" }, 400); }
    const first = Array.isArray(payload?.events) ? payload.events[0] : null;
    const externalId = clean(first?.webhookEventId || first?.message?.id || "", 180);
    const eventType = clean(first?.type || "line.event", 100);
    const accepted = await acceptHook(c.env, "line", raw, externalId, eventType);
    return c.json({ ok: true, provider: "line", ...accepted });
  });

  hooks.get("/hooks/meta", async (c) => {
    const token = clean(c.env.META_VERIFY_TOKEN, 4000);
    if (!token) return c.text("CONFIGURATION_REQUIRED", 503);
    const mode = c.req.query("hub.mode") ?? "";
    const verify = c.req.query("hub.verify_token") ?? "";
    const challenge = c.req.query("hub.challenge") ?? "";
    if (mode === "subscribe" && timingSafeString(verify, token)) return c.text(challenge, 200);
    return c.text("INVALID_VERIFY_TOKEN", 403);
  });

  hooks.post("/hooks/meta", async (c) => {
    const secret = clean(c.env.META_APP_SECRET, 4000);
    if (!secret) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", provider: "meta" }, 503);
    const raw = await c.req.text();
    const signature = clean(c.req.header("x-hub-signature-256"), 500);
    const expected = `sha256=${hex(await hmacBytes(secret, raw))}`;
    if (!signature || !timingSafeString(signature, expected)) {
      await logEvent(c.env, { provider: "meta", event_type: "WEBHOOK", state: "REJECTED_SIGNATURE" });
      return c.json({ ok: false, code: "INVALID_SIGNATURE" }, 401);
    }
    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { return c.json({ ok: false, code: "INVALID_JSON" }, 400); }
    const externalId = clean(payload?.entry?.[0]?.messaging?.[0]?.message?.mid || payload?.entry?.[0]?.id || "", 180);
    const accepted = await acceptHook(c.env, "meta", raw, externalId, "meta.event");
    return c.json({ ok: true, provider: "meta", ...accepted });
  });

  hooks.post("/hooks/generic", async (c) => {
    const secret = clean(c.env.OGENIC_GENERIC_HOOK_SECRET, 4000);
    if (!secret) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", provider: "generic" }, 503);
    const raw = await c.req.text();
    const signature = clean(c.req.header("x-ogenic-signature"), 500);
    const expected = `sha256=${hex(await hmacBytes(secret, raw))}`;
    if (!signature || !timingSafeString(signature, expected)) return c.json({ ok: false, code: "INVALID_SIGNATURE" }, 401);
    const externalId = clean(c.req.header("idempotency-key"), 180);
    const accepted = await acceptHook(c.env, "generic", raw, externalId, "generic.event");
    return c.json({ ok: true, provider: "generic", ...accepted });
  });

  hooks.post("/hooks/openai", async (c) => {
    const secretRaw = clean(c.env.OPENAI_WEBHOOK_SECRET, 4000);
    if (!secretRaw) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", provider: "openai" }, 503);
    const raw = await c.req.text();
    const id = clean(c.req.header("webhook-id"), 300);
    const timestamp = clean(c.req.header("webhook-timestamp"), 80);
    const signatureHeader = clean(c.req.header("webhook-signature"), 4000);
    const timestampNumber = Number(timestamp);
    if (!id || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return c.json({ ok: false, code: "INVALID_WEBHOOK_TIMESTAMP" }, 401);
    const secret = secretRaw.startsWith("whsec_") ? fromB64(secretRaw.slice(6)) : enc.encode(secretRaw);
    const expected = b64(await hmacBytes(secret, `${id}.${timestamp}.${raw}`));
    const candidates = signatureHeader.split(/\s+/).map((part) => part.trim()).filter(Boolean).map((part) => part.startsWith("v1,") ? part.slice(3) : part);
    if (!candidates.some((candidate) => timingSafeString(candidate, expected))) return c.json({ ok: false, code: "INVALID_SIGNATURE" }, 401);
    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { return c.json({ ok: false, code: "INVALID_JSON" }, 400); }
    const accepted = await acceptHook(c.env, "openai", raw, id, clean(payload?.type || "openai.event", 100));
    return c.json({ ok: true, provider: "openai", ...accepted });
  });

  return hooks;
}
