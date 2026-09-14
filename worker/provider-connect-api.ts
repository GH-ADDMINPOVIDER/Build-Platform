import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";
import { inspectN8n, testConnector, type ConnectorBindings } from "./connector-runtime";

type Bindings = AuthBindings & ConnectorBindings;
type Env = { Bindings: Bindings };
type JsonRecord = Record<string, unknown>;

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const now = () => new Date().toISOString();

function has(value: unknown) { return Boolean(clean(value, 4000)); }
function numericChannelId(value: unknown) { return /^[0-9]{5,20}$/.test(clean(value, 80)); }

async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { response, body };
  } finally { clearTimeout(timer); }
}

async function audit(env: Bindings, provider: string, action: string, state: string, detail: JsonRecord = {}) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO connector_events(id, provider, event_type, state, external_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `cev_${crypto.randomUUID()}`,
    provider.slice(0, 60),
    `CONNECT:${action}`.slice(0, 100),
    state.slice(0, 60),
    null,
    JSON.stringify(detail).slice(0, 4000),
    Date.now(),
  ).run().catch(() => undefined);
}

function credential(name: string, present: boolean, source: string, kind: "provider" | "owner" | "runtime" = "provider") {
  return { name, present, source, kind, value: present ? "REDACTED" : null };
}

function deliveryMatrix() {
  return [
    {
      id: "grabfood", label: "GrabFood", state: "PARTNER_ACCESS_REQUIRED", route_mode: "DIRECT_HTTP",
      requirement: "Grab partner onboarding + merchant/client credentials before Merchant API can be connected.",
      openai_builtin_connector: false,
    },
    {
      id: "shopeefood", label: "ShopeeFood", state: "PARTNER_ACCESS_REQUIRED", route_mode: "DIRECT_HTTP",
      requirement: "ShopeeFood/Open Platform partner credentials issued to the merchant/partner account.",
      openai_builtin_connector: false,
    },
    {
      id: "lineman", label: "LINE MAN", state: "PARTNER_ACCESS_REQUIRED", route_mode: "DIRECT_HTTP",
      requirement: "Merchant/partner API access must be granted by LINE MAN/Wongnai. No OpenAI built-in delivery connector is assumed.",
      openai_builtin_connector: false,
    },
  ];
}

async function lineState(env: Bindings) {
  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN, 4000);
  const secret = clean(env.LINE_SECRET_CHANNEL, 4000);
  const channelId = clean((env as Bindings & { LINE_CHANNEL_ID?: string }).LINE_CHANNEL_ID || env.LINE_ID_USE, 100);
  let api = { ok: false, http_status: 0, bot: null as null | { displayName?: unknown; basicId?: unknown } };
  if (token) {
    try {
      const result = await requestJson("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      api = { ok: result.response.ok, http_status: result.response.status, bot: result.response.ok && result.body && typeof result.body === "object" ? result.body as any : null };
    } catch { api = { ok: false, http_status: 0, bot: null }; }
  }
  const exactState = api.ok
    ? "LIVE"
    : token
      ? (numericChannelId(channelId) && secret ? "CREDENTIAL_ROTATION_REQUIRED" : "LINE_CHANNEL_ID_REQUIRED")
      : (numericChannelId(channelId) && secret ? "TOKEN_REQUIRED" : "LINE_CHANNEL_ID_REQUIRED");
  return {
    id: "line", label: "LINE OA", state: exactState,
    route_mode: api.ok ? "DIRECT_HTTP" : "DISABLED",
    summary: api.ok ? "Messaging API token verified. Webhook can be connected directly to OGENIC." : exactState === "LINE_CHANNEL_ID_REQUIRED" ? "Stored token is invalid/expired and the canonical Messaging API Channel ID is missing." : "Stored token needs rotation before direct Messaging API use.",
    api: { ok: api.ok, http_status: api.http_status, bot_name: api.bot ? clean(api.bot.displayName, 120) : null, basic_id: api.bot ? clean(api.bot.basicId, 120) : null },
    credentials: [
      credential("LINE_CHANNEL_ACCESS_TOKEN", has(token), "Infisical → Cloudflare Worker", "provider"),
      credential("LINE_CHANNEL_SECRET", has(secret), "Infisical → Cloudflare Worker", "provider"),
      credential("LINE_CHANNEL_ID", numericChannelId(channelId), "Infisical identity mapping", "provider"),
    ],
    checked_at: now(),
  };
}

async function metaState(env: Bindings) {
  const token = clean(env.META_PAGE_ACCESS_TOKEN, 4000);
  const appSecret = clean(env.META_APP_SECRET, 4000);
  const verify = clean(env.META_VERIFY_TOKEN, 4000);
  let apiOk = false;
  let httpStatus = 0;
  if (token) {
    try {
      const result = await requestJson("https://graph.facebook.com/me?fields=id,name", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      apiOk = result.response.ok;
      httpStatus = result.response.status;
    } catch { apiOk = false; }
  }
  const state = !token ? "TOKEN_REQUIRED" : !apiOk ? "TOKEN_INVALID" : !appSecret ? "META_APP_SECRET_REQUIRED" : !verify ? "META_VERIFY_TOKEN_REQUIRED" : "LIVE";
  return {
    id: "meta", label: "Meta / Facebook / Instagram", state,
    route_mode: apiOk ? "DIRECT_HTTP" : "DISABLED",
    summary: state === "LIVE" ? "Graph API token + webhook signing inputs are ready." : state === "META_APP_SECRET_REQUIRED" ? "Page token works; only Meta App Secret is still required for signed webhook verification." : state === "META_VERIFY_TOKEN_REQUIRED" ? "Page token and App Secret are present; create/store an owner-defined webhook verify token." : state === "TOKEN_INVALID" ? "Stored Meta access token failed Graph API verification." : "Meta Page Access Token is missing.",
    api: { ok: apiOk, http_status: httpStatus },
    credentials: [
      credential("META_PAGE_ACCESS_TOKEN", has(token), "Infisical → Cloudflare Worker", "provider"),
      credential("META_APP_SECRET", has(appSecret), "Infisical → Cloudflare Worker", "provider"),
      credential("META_VERIFY_TOKEN", has(verify), "Owner-defined secret stored server-side", "owner"),
    ],
    checked_at: now(),
  };
}

export function createProviderConnectApi() {
  const api = new Hono<Env>();
  const ownerOnly = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    await next();
  };
  api.use("/api/provider-connect", ownerOnly);
  api.use("/api/provider-connect/*", ownerOnly);

  api.get("/api/provider-connect/state", async (c) => {
    const [line, meta, n8n] = await Promise.all([lineState(c.env), metaState(c.env), inspectN8n(c.env)]);
    return c.json({
      ok: true,
      providers: [line, meta, { ...n8n, credentials: [credential("N8N_API_KEY", has(c.env.N8N_API_KEY), "Infisical → Cloudflare Worker", "provider"), credential("N8N_BASE_URL", has(c.env.N8N_BASE_URL), "Runtime configuration", "runtime")] }],
      delivery: deliveryMatrix(),
      policy: "NO_RAW_SECRETS · READ_FIRST · OUTBOUND_SIDE_EFFECTS_REQUIRE_APPROVAL",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/provider-connect/capabilities", (c) => c.json({ ok: true, delivery: deliveryMatrix(), openai: { function_calling: true, remote_mcp: true, provider_specific_line_connector: false, provider_specific_delivery_connector: false } }, 200, { "Cache-Control": "no-store" }));

  api.post("/api/provider-connect/action", async (c) => {
    const body: { provider?: unknown; action?: unknown } = await c.req.json<{ provider?: unknown; action?: unknown }>().catch(() => ({}));
    const provider = clean(body.provider, 60).toLowerCase();
    const action = clean(body.action, 60).toLowerCase();
    if (!provider || !action) return c.json({ ok: false, code: "INVALID_REQUEST", message: "provider and action are required" }, 400);

    if (action === "disconnect") {
      await audit(c.env, provider, action, "HUMAN_APPROVAL_REQUIRED");
      return c.json({ ok: false, code: "HUMAN_APPROVAL_REQUIRED", message: "Disconnect removes credentials or provider routing and requires a separate owner approval." }, 409);
    }

    if (provider === "line") {
      const line = await lineState(c.env);
      if (action === "test") {
        await audit(c.env, provider, action, line.api.ok ? "OK" : line.state, { http_status: line.api.http_status });
        return c.json({ ok: line.api.ok, provider: line }, line.api.ok ? 200 : 409, { "Cache-Control": "no-store" });
      }
      if (action === "connect" || action === "reconnect") {
        if (!line.api.ok) {
          await audit(c.env, provider, action, line.state, { http_status: line.api.http_status });
          return c.json({ ok: false, code: line.state, message: line.summary, required: line.state === "LINE_CHANNEL_ID_REQUIRED" ? ["LINE_CHANNEL_ID"] : ["LINE_CHANNEL_ACCESS_TOKEN"] }, 409);
        }
        const token = clean(c.env.LINE_CHANNEL_ACCESS_TOKEN, 4000);
        const endpoint = `${new URL(c.req.url).origin}/hooks/line`;
        const put = await requestJson("https://api.line.me/v2/bot/channel/webhook/endpoint", {
          method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }),
        });
        if (!put.response.ok) {
          await audit(c.env, provider, action, "ERROR", { stage: "webhook_put", http_status: put.response.status });
          return c.json({ ok: false, code: "LINE_WEBHOOK_CONFIG_FAILED", http_status: put.response.status }, 502);
        }
        const read = await requestJson("https://api.line.me/v2/bot/channel/webhook/endpoint", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
        const readBody = read.body && typeof read.body === "object" ? read.body as Record<string, unknown> : {};
        if (!read.response.ok || clean(readBody.endpoint, 1000) !== endpoint) {
          await audit(c.env, provider, action, "ERROR", { stage: "webhook_readback", http_status: read.response.status });
          return c.json({ ok: false, code: "LINE_WEBHOOK_READBACK_FAILED" }, 502);
        }
        const test = await requestJson("https://api.line.me/v2/bot/channel/webhook/test", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
        const testBody = test.body && typeof test.body === "object" ? test.body as Record<string, unknown> : {};
        const success = test.response.ok && testBody.success === true;
        await audit(c.env, provider, action, success ? "CONNECTED" : "ERROR", { stage: "webhook_test", http_status: test.response.status, endpoint: "/hooks/line" });
        return c.json({ ok: success, provider: "line", state: success ? "LIVE" : "DEGRADED", webhook: { endpoint: "/hooks/line", official_test: success }, customer_message_sent: false }, success ? 200 : 502, { "Cache-Control": "no-store" });
      }
    }

    if (provider === "n8n") {
      const state = await inspectN8n(c.env);
      await audit(c.env, provider, action, state.state, { route_mode: state.route_mode });
      return c.json({ ok: state.state === "LIVE" || state.state === "CONFIGURED", provider: state, failover: state.state === "QUOTA_BLOCKED" ? "DIRECT_HTTP" : null }, 200, { "Cache-Control": "no-store" });
    }

    if (provider === "meta") {
      const meta = await metaState(c.env);
      await audit(c.env, provider, action, meta.state, { http_status: meta.api.http_status });
      return c.json({ ok: meta.state === "LIVE", provider: meta, note: "Meta outbound actions remain approval-gated. App Secret cannot be fabricated by OGENIC." }, meta.state === "LIVE" ? 200 : 409, { "Cache-Control": "no-store" });
    }

    if (["grabfood", "shopeefood", "lineman"].includes(provider)) {
      const item = deliveryMatrix().find((candidate) => candidate.id === provider)!;
      await audit(c.env, provider, action, item.state);
      return c.json({ ok: false, provider: item, code: item.state }, 409, { "Cache-Control": "no-store" });
    }

    if (action === "test") {
      const result = await testConnector(c.env, provider);
      return c.json({ ok: true, result }, 200, { "Cache-Control": "no-store" });
    }

    return c.json({ ok: false, code: "UNSUPPORTED_PROVIDER_ACTION", provider, action }, 400);
  });

  return api;
}
