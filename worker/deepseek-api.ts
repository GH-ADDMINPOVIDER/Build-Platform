import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";
import { boundedReadPrompt } from "./agent-context-policy";

export type DeepSeekBindings = AuthBindings & {
  DEEPSEEK_API_KEY?: string;
  OGENIC_READINESS_DEEPSEEK_API?: string;
  OGENIC_READINESS_DEEPSEEK_QUOTA?: string;
  OGENIC_READINESS_DEEPSEEK_BILLING?: string;
};

type Env = { Bindings: DeepSeekBindings };
type DeepSeekBody = {
  prompt?: unknown;
  model?: unknown;
};

type DeepSeekResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { role?: string; content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string | number | null };
};

const MODELS = new Set(["deepseek-flash", "deepseek-v4-pro"]);
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

export function createDeepSeekApi() {
  const api = new Hono<Env>();

  api.get("/api/deepseek/status", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const keyPresent = Boolean(clean(c.env.DEEPSEEK_API_KEY, 4000));
    const verified = keyPresent &&
      c.env.OGENIC_READINESS_DEEPSEEK_API === "REACHABLE" &&
      c.env.OGENIC_READINESS_DEEPSEEK_QUOTA === "AVAILABLE" &&
      c.env.OGENIC_READINESS_DEEPSEEK_BILLING === "ACTIVE";
    return c.json({
      ok: true,
      provider: "deepseek",
      api: "CHAT_COMPLETIONS",
      state: verified ? "VERIFIED" : keyPresent ? "BOUND_NOT_SMOKE_VERIFIED" : "CONFIGURATION_REQUIRED",
      key_present: keyPresent,
      key_value: keyPresent ? "REDACTED" : null,
      endpoint: "/chat/completions",
      default_model: "deepseek-flash",
      permitted_models: [...MODELS],
      retry_policy: "NO_AUTO_RETRY",
      execution_authority: "YELLOW_STONE_ONLY",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/deepseek/chat", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }

    const apiKey = clean(c.env.DEEPSEEK_API_KEY, 4000);
    if (!apiKey) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "DEEPSEEK_API_KEY" }, 503);
    }

    const body = await c.req.json<DeepSeekBody>().catch(() => ({} as DeepSeekBody));
    const prompt = boundedReadPrompt(body.prompt);
    if (!prompt) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    }
    const requestedModel = clean(body.model, 80);
    const model = MODELS.has(requestedModel) ? requestedModel : "deepseek-flash";

    let response: Response;
    try {
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are DeepSeek inside OGENIC/Unifiend as a reasoning and code-intelligence provider. " +
                "This lane is READ/reasoning only. Do not claim side effects, do not expose secrets, " +
                "and never bypass Yellow Stone execution authority.",
            },
            { role: "user", content: prompt },
          ],
          stream: false,
          // No app-side generation cutoff. Preserve provider finish_reason for clients.
        }),
      });
    } catch {
      return c.json({
        ok: false,
        code: "DEEPSEEK_UNREACHABLE",
        state: "DEFERRED",
        automatic_retry: false,
      }, 502);
    }

    const result = await response.json().catch(() => ({})) as DeepSeekResponse;
    if (!response.ok) {
      if (response.status === 401) {
        return c.json({
          ok: false,
          code: "DEEPSEEK_AUTH_FAILED",
          http_status: 401,
          message: "DeepSeek rejected the configured server-side API key.",
        }, 401);
      }
      if (response.status === 429) {
        return c.json({
          ok: false,
          code: "DEEPSEEK_RATE_LIMITED",
          http_status: 429,
          state: "DEFERRED",
          automatic_retry: false,
        }, 429);
      }
      return c.json({
        ok: false,
        code: `DEEPSEEK_HTTP_${response.status}`,
        http_status: response.status,
        message: clean(result.error?.message || "DeepSeek request failed", 300),
      }, 502);
    }

    const choice = result.choices?.[0];
    // Return full text; do not silently cut valuable paid research at 40K chars.
    const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
    if (!text) {
      return c.json({ ok: false, code: "DEEPSEEK_EMPTY_OUTPUT", http_status: 200 }, 502);
    }

    return c.json({
      ok: true,
      provider: "deepseek",
      api: "CHAT_COMPLETIONS",
      response_id: clean(result.id, 180) || null,
      model: clean(result.model || model, 120),
      finish_reason: clean(choice?.finish_reason, 80) || null,
      output_complete: choice?.finish_reason === "stop",
      output_truncated_by_provider: choice?.finish_reason === "length",
      text,
      usage: {
        prompt_tokens: Number(result.usage?.prompt_tokens ?? 0),
        completion_tokens: Number(result.usage?.completion_tokens ?? 0),
        total_tokens: Number(result.usage?.total_tokens ?? 0),
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
