import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

export type MetaModelBindings = AuthBindings & {
  META_MODEL_API_KEY?: string;
};

type Env = { Bindings: MetaModelBindings };
type MetaBody = { prompt?: unknown; model?: unknown };

type MetaResponse = {
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

const MODELS = new Set(["muse-spark-1.3"]);
const DEFAULT_MODEL = "muse-spark-1.3";
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function collectText(result: MetaResponse) {
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

export function createMetaModelApi() {
  const api = new Hono<Env>();

  api.get("/api/meta-model/status", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const keyPresent = Boolean(clean(c.env.META_MODEL_API_KEY, 5000));
    return c.json({
      ok: true,
      provider: "meta_model",
      api: "RESPONSES",
      state: keyPresent ? "BOUND_BILLING_UNVERIFIED" : "CONFIGURATION_REQUIRED",
      key_present: keyPresent,
      key_value: keyPresent ? "REDACTED" : null,
      base_url: "https://api.meta.ai/v1",
      endpoint: "/v1/responses",
      default_model: DEFAULT_MODEL,
      permitted_models: [...MODELS],
      retry_policy: "NO_AUTO_RETRY",
      provider_fallback: "DENIED_WITHIN_ATTEMPT",
      execution_authority: "YELLOW_STONE_ONLY",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/meta-model/responses", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }

    const apiKey = clean(c.env.META_MODEL_API_KEY, 5000);
    if (!apiKey) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "META_MODEL_API_KEY" }, 503);
    }

    const body = await c.req.json<MetaBody>().catch(() => ({} as MetaBody));
    const prompt = clean(body.prompt, 12_000);
    if (!prompt) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    }

    const requestedModel = clean(body.model, 100);
    const model = MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch("https://api.meta.ai/v1/responses", {
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
        code: "META_MODEL_UNREACHABLE",
        state: "DEFERRED",
        automatic_retry: false,
      }, 502);
    }

    const result = await response.json().catch(() => ({})) as MetaResponse;
    if (!response.ok) {
      const message = clean(result.error?.message || "Meta Model API request failed", 300);
      const billingBlocked = /billing|payment|credit|balance/i.test(message);
      const code =
        response.status === 401 || response.status === 403 ? "META_MODEL_AUTH_OR_ACCESS_FAILED" :
        response.status === 429 ? "META_MODEL_RATE_LIMITED" :
        billingBlocked ? "META_MODEL_BILLING_BLOCKED" :
        `META_MODEL_HTTP_${response.status}`;
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
      return c.json({ ok: false, code: "META_MODEL_EMPTY_OUTPUT", http_status: 200 }, 502);
    }

    return c.json({
      ok: true,
      provider: "meta_model",
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
