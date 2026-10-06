import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

export type GeminiBindings = AuthBindings & {
  GEMINI_API_KEY?: string;
};

type Env = { Bindings: GeminiBindings };
type GeminiBody = { prompt?: unknown; model?: unknown };

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
  error?: { code?: number; message?: string; status?: string };
};

const MODELS = new Set(["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]);
const DEFAULT_MODEL = "gemini-3.7-flash";
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function collectText(result: GeminiResponse) {
  return clean(
    result.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .filter(Boolean)
      .join("\n"),
    40_000,
  );
}

export function createGeminiApi() {
  const api = new Hono<Env>();

  api.get("/api/gemini/status", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const keyPresent = Boolean(clean(c.env.GEMINI_API_KEY, 4000));
    return c.json({
      ok: true,
      provider: "gemini",
      api: "GENERATE_CONTENT",
      state: keyPresent ? "BOUND_NOT_SMOKE_VERIFIED" : "CONFIGURATION_REQUIRED",
      key_present: keyPresent,
      key_value: keyPresent ? "REDACTED" : null,
      endpoint: "/v1beta/models/{model}:generateContent",
      default_model: DEFAULT_MODEL,
      permitted_models: [...MODELS],
      tier_intent: "FREE_TIER_PILOT",
      retry_policy: "NO_AUTO_RETRY",
      execution_authority: "YELLOW_STONE_ONLY",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/gemini/chat", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }

    const apiKey = clean(c.env.GEMINI_API_KEY, 4000);
    if (!apiKey) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "GEMINI_API_KEY" }, 503);
    }

    const body = await c.req.json<GeminiBody>().catch(() => ({} as GeminiBody));
    const prompt = clean(body.prompt, 12_000);
    if (!prompt) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    }

    const requestedModel = clean(body.model, 100);
    const model = MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096 },
        }),
      });
    } catch {
      return c.json({
        ok: false,
        code: "GEMINI_UNREACHABLE",
        state: "DEFERRED",
        automatic_retry: false,
      }, 502);
    }

    const result = await response.json().catch(() => ({})) as GeminiResponse;
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403 ? "GEMINI_AUTH_OR_ACCESS_FAILED" :
        response.status === 429 ? "GEMINI_RATE_LIMITED" :
        `GEMINI_HTTP_${response.status}`;
      return c.json({
        ok: false,
        code,
        http_status: response.status,
        provider_status: clean(result.error?.status, 100) || null,
        message: clean(result.error?.message || "Gemini request failed", 300),
        state: response.status === 429 ? "DEFERRED" : "BLOCKED",
        automatic_retry: false,
      }, response.status === 429 ? 429 : 502);
    }

    const text = collectText(result);
    if (!text) {
      return c.json({
        ok: false,
        code: "GEMINI_EMPTY_OUTPUT",
        http_status: 200,
        finish_reason: clean(result.candidates?.[0]?.finishReason, 80) || null,
      }, 502);
    }

    return c.json({
      ok: true,
      provider: "gemini",
      api: "GENERATE_CONTENT",
      model: clean(result.modelVersion || model, 160),
      finish_reason: clean(result.candidates?.[0]?.finishReason, 80) || null,
      text,
      usage: {
        prompt_tokens: Number(result.usageMetadata?.promptTokenCount ?? 0),
        completion_tokens: Number(result.usageMetadata?.candidatesTokenCount ?? 0),
        total_tokens: Number(result.usageMetadata?.totalTokenCount ?? 0),
      },
      policy: {
        permission_class: "READ",
        automatic_retry: false,
        provider_fallback: "DENIED_WITHIN_ATTEMPT",
        execution_authority: "YELLOW_STONE_ONLY",
        raw_secret_retention: false,
        canonical_truth: "GREEN_1LSS_ONLY_AFTER_RUBY_VERIFICATION",
      },
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
