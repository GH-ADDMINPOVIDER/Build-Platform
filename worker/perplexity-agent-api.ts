import Perplexity from "@perplexity-ai/perplexity_ai";
import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

export type PerplexityAgentBindings = AuthBindings & {
  PERPLEXITY_API_KEY?: string;
};

type Env = { Bindings: PerplexityAgentBindings };
type AgentBody = {
  prompt?: unknown;
  previous_response_id?: unknown;
};

type SourceItem = {
  url: string;
  title: string | null;
  date: string | null;
  last_updated: string | null;
};

type ErrorShape = {
  status?: unknown;
  message?: unknown;
  headers?: unknown;
};

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function safeHttpStatus(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const status = Number((error as ErrorShape).status ?? 0);
  return Number.isFinite(status) ? status : 0;
}

function safeRetryAfter(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const headers = (error as ErrorShape).headers;
  if (headers instanceof Headers) {
    const value = clean(headers.get("retry-after"), 80);
    return value || null;
  }
  if (headers && typeof headers === "object") {
    const record = headers as Record<string, unknown>;
    const value = clean(record["retry-after"] ?? record["Retry-After"], 80);
    return value || null;
  }
  return null;
}

function safeErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Perplexity Agent request failed";
  return clean((error as ErrorShape).message || "Perplexity Agent request failed", 300);
}

function collectSources(response: unknown): SourceItem[] {
  const root = response && typeof response === "object"
    ? response as { output?: unknown[] }
    : {};
  const seen = new Map<string, SourceItem>();

  const add = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const item = candidate as Record<string, unknown>;
    const url = clean(item.url, 1500);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.set(url, {
      url,
      title: clean(item.title, 300) || null,
      date: clean(item.date, 80) || null,
      last_updated: clean(item.last_updated, 100) || null,
    });
  };

  for (const raw of root.output ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (Array.isArray(item.results)) item.results.forEach(add);
    if (Array.isArray(item.contents)) item.contents.forEach(add);

    if (Array.isArray(item.content)) {
      for (const rawPart of item.content) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const part = rawPart as Record<string, unknown>;
        if (Array.isArray(part.annotations)) part.annotations.forEach(add);
      }
    }
  }
  return [...seen.values()].slice(0, 12);
}

export function createPerplexityAgentApi() {
  const api = new Hono<Env>();

  api.get("/api/perplexity/status", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const keyPresent = Boolean(clean(c.env.PERPLEXITY_API_KEY, 4000));
    return c.json({
      ok: true,
      provider: "perplexity",
      api: "AGENT_API",
      state: keyPresent ? "BOUND_NOT_SMOKE_VERIFIED" : "CONFIGURATION_REQUIRED",
      key_present: keyPresent,
      key_value: keyPresent ? "REDACTED" : null,
      endpoint: "/v1/agent",
      sdk: "@perplexity-ai/perplexity_ai",
      default_preset: "low",
      web_grounding: true,
      retry_policy: "NO_AUTO_RETRY",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/perplexity/agent", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }

    const apiKey = clean(c.env.PERPLEXITY_API_KEY, 4000);
    if (!apiKey) {
      return c.json({
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        missing: "PERPLEXITY_API_KEY",
      }, 503);
    }

    const body = await c.req.json<AgentBody>().catch(() => ({} as AgentBody));
    const prompt = clean(body.prompt, 12_000);
    const previousResponseId = clean(body.previous_response_id, 180);
    if (!prompt) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    }

    const client = new Perplexity({
      apiKey,
      maxRetries: 0,
      timeout: 60_000,
      logLevel: "off",
    });

    try {
      const response = await client.responses.create({
        preset: "low",
        input: prompt,
        tools: [{ type: "web_search" as const }],
        previous_response_id: previousResponseId || undefined,
        store: false,
      });

      const text = clean(response.output_text, 40_000);
      if (!text) {
        return c.json({
          ok: false,
          code: "PERPLEXITY_EMPTY_OUTPUT",
          response_id: clean(response.id, 180) || null,
          status: clean(response.status, 80) || null,
        }, 502);
      }

      return c.json({
        ok: true,
        provider: "perplexity",
        api: "AGENT_API",
        response_id: clean(response.id, 180),
        previous_response_id: previousResponseId || null,
        status: clean(response.status, 80),
        model: clean(response.model, 160),
        text,
        sources: collectSources(response),
        policy: {
          permission_class: "READ",
          web_grounded: true,
          automatic_retry: false,
          raw_secret_retention: false,
          canonical_truth: "GREEN_1LSS_ONLY_AFTER_RUBY_VERIFICATION",
        },
      }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      const status = safeHttpStatus(error);
      const retryAfter = safeRetryAfter(error);
      if (status === 401) {
        return c.json({
          ok: false,
          code: "PERPLEXITY_AUTH_FAILED",
          http_status: 401,
          message: "Perplexity rejected the configured server-side API key.",
        }, 401);
      }
      if (status === 429) {
        return c.json({
          ok: false,
          code: "PERPLEXITY_RATE_LIMITED",
          http_status: 429,
          retry_after: retryAfter,
          state: "DEFERRED",
          automatic_retry: false,
        }, 429);
      }
      return c.json({
        ok: false,
        code: status ? `PERPLEXITY_HTTP_${status}` : "PERPLEXITY_REQUEST_FAILED",
        http_status: status || null,
        message: safeErrorMessage(error),
      }, 502);
    }
  });

  return api;
}
