import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

export type XaiBindings = AuthBindings & {
  XAI_API_KEY?: string;
};

type Env = { Bindings: XaiBindings };
type XaiBody = { prompt?: unknown; model?: unknown };

type XaiResponse = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string | number | null };
};

const MODELS = new Set(["grok-4.7"]);
const DEFAULT_MODEL = "grok-4.7";
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function collectText(result: XaiResponse) {
  const direct = clean(result.output_text, 40_000);
  if (direct) return direct;
  for (const item of result.output ?? []) {
    for (const part of item.content ?? []) {
      const text = clean(part.text, 40_000);
      if (text) return text;
    }
  }
  return "";
}

export function createXaiApi() {
  const api = new Hono<Env>();

  api.get("/api/xai/status", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const keyPresent = Boolean(clean(c.env.XAI_API_KEY, 5000));
    return c.json({
      ok: true,
      provider: "xai",
      product: "grok",
      api: "RESPONSES",
      state: keyPresent ? "BOUND_NOT_LIVE_VERIFIED" : "CONFIGURATION_REQUIRED",
      key_present: keyPresent,
      key_value: keyPresent ? "REDACTED" : null,
      endpoint: "/v1/responses",
      models_endpoint: "/v1/models",
      default_model: DEFAULT_MODEL,
      permitted_models: [...MODELS],
      retry_policy: "NO_AUTO_RETRY",
      provider_fallback: "DENIED_WITHIN_ATTEMPT",
      execution_authority: "YELLOW_STONE_ONLY",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/xai/responses", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }

    const apiKey = clean(c.env.XAI_API_KEY, 5000);
    if (!apiKey) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "XAI_API_KEY" }, 503);
    }

    const body = await c.req.json<XaiBody>().catch(() => ({} as XaiBody));
    const prompt = clean(body.prompt, 12_000);
    if (!prompt) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    }

    const requestedModel = clean(body.model, 100);
    const model = MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt,
          max_output_tokens: 4096,
        }),
      });
    } catch {
      return c.json({
        ok: false,
        code: "XAI_UNREACHABLE",
        state: "DEFERRED",
        automatic_retry: false,
      }, 502);
    }

    const result = await response.json().catch(() => ({})) as XaiResponse;
    if (!response.ok) {
      const message = clean(result.error?.message || "xAI request failed", 300);
      const billingBlocked = /billing|payment|credit|balance/i.test(message);
      const code =
        response.status === 401 || response.status === 403 ? "XAI_AUTH_OR_ACCESS_FAILED" :
        response.status === 429 ? "XAI_RATE_LIMITED" :
        billingBlocked ? "XAI_BILLING_BLOCKED" :
        `XAI_HTTP_${response.status}`;
      return c.json({
        ok: false,
        code,
        http_status: response.status,
        message,
        state: billingBlocked ? "BILLING_BLOCKED" : response.status === 429 ? "DEFERRED" : "BLOCKED",
        automatic_retry: false,
      }, response.status === 429 ? 429 : 502);
    }

    const text = collectText(result);
    if (!text) {
      return c.json({ ok: false, code: "XAI_EMPTY_OUTPUT", http_status: 200 }, 502);
    }

    return c.json({
      ok: true,
      provider: "xai",
      product: "grok",
      api: "RESPONSES",
      response_id: clean(result.id, 180) || null,
      model: clean(result.model || model, 160),
      text,
      usage: {
        prompt_tokens: Number(result.usage?.input_tokens ?? 0),
        completion_tokens: Number(result.usage?.output_tokens ?? 0),
        total_tokens: Number(result.usage?.total_tokens ?? 0),
      },
      policy: {
        permission_class: "READ",
        automatic_retry: false,
        provider_fallback: "DENIED_WITHIN_ATTEMPT",
        context_budget_chars: 12_000,
        raw_secret_retention: false,
        execution_authority: "YELLOW_STONE_ONLY",
        canonical_truth: "GREEN_1LSS_ONLY_AFTER_RUBY_VERIFICATION",
      },
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
