import incentives from "../config/provider-incentives.staging.json";
import { readIncentiveSnapshot } from "./provider-incentives";
import type { Adapter, AdapterContext, AdapterResult, Json, WorkflowBindings } from "./workflow-engine";

type OpenAIMode = "fast" | "balanced" | "power" | "codex";
type IncentivePoolId = "standard" | "high_volume";

type Route = {
  mode: OpenAIMode;
  model: string;
  pool: IncentivePoolId;
  usageKey: string;
};

type OpenAIResponse = {
  id?: string;
  status?: string;
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
};

const ROUTES: Record<OpenAIMode, Route> = {
  fast: {
    mode: "fast",
    model: "gpt-5.6-luna",
    pool: "high_volume",
    usageKey: "openai_complimentary_high_volume_tokens",
  },
  balanced: {
    mode: "balanced",
    model: "gpt-5.6-terra",
    pool: "high_volume",
    usageKey: "openai_complimentary_high_volume_tokens",
  },
  power: {
    mode: "power",
    model: "gpt-5.6-sol",
    pool: "standard",
    usageKey: "openai_complimentary_standard_tokens",
  },
  codex: {
    mode: "codex",
    model: "gpt-5.1-codex",
    pool: "standard",
    usageKey: "openai_complimentary_standard_tokens",
  },
};

const MAX_OUTPUT_TOKENS = 4000;
const RESPONSE_OVERHEAD_RESERVE = 4096;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function inputBytes(input: Json) {
  return new TextEncoder().encode(JSON.stringify(input)).byteLength;
}

function extractText(response: OpenAIResponse) {
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      if (content.type === "refusal" && typeof content.refusal === "string") parts.push(content.refusal);
    }
  }
  return parts.join("\n").trim();
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function errorCode(status: number, body: OpenAIResponse) {
  if (status === 401 || status === 403) return "REAUTH_REQUIRED";
  if (status === 429) return "OPENAI_RATE_OR_QUOTA_LIMIT";
  return body.error?.code ? `OPENAI_${String(body.error.code).toUpperCase()}` : `OPENAI_HTTP_${status}`;
}

function selectMode(input: Json, forced?: OpenAIMode): OpenAIMode {
  if (forced) return forced;
  if (!object(input)) return "balanced";
  const requested = String(input.mode ?? "balanced").toLowerCase();
  return requested === "fast" || requested === "power" || requested === "balanced" ? requested : "balanced";
}

function promptFor(input: Json, operation: "chat" | "codex") {
  if (operation === "codex") {
    const task = object(input) ? input.task ?? null : null;
    const context = object(input) ? input.context ?? null : null;
    return JSON.stringify({ task, context });
  }
  if (typeof input === "string") return input;
  if (object(input) && typeof input.prompt === "string") return input.prompt;
  return JSON.stringify(input);
}

async function resolveRoute(
  env: WorkflowBindings,
  requested: Route,
  input: Json,
  maxOutputTokens: number,
  allowVolumeFallback: boolean,
): Promise<{ route: Route; fallbackReason?: string } | { blocked: AdapterResult }> {
  const snapshot = await readIncentiveSnapshot(env.DB);
  const reserve = inputBytes(input) + maxOutputTokens + RESPONSE_OVERHEAD_RESERVE;

  const pool = snapshot.pools.find((candidate) => candidate.id === requested.pool);
  const remaining = pool?.remaining ?? null;
  const state = pool?.state ?? "NORMAL";
  const unsafe = remaining !== null && remaining < reserve;
  const shouldFallback = requested.pool === "standard" && allowVolumeFallback && (unsafe || state === "THROTTLE" || state === "CRITICAL" || state === "EXHAUSTED");

  if (shouldFallback) {
    const fallback = ROUTES.balanced;
    const fallbackPool = snapshot.pools.find((candidate) => candidate.id === fallback.pool);
    const fallbackUnsafe = fallbackPool?.remaining !== null && fallbackPool?.remaining !== undefined && fallbackPool.remaining < reserve;
    if (!fallbackUnsafe && fallbackPool?.state !== "CRITICAL" && fallbackPool?.state !== "EXHAUSTED") {
      return {
        route: fallback,
        fallbackReason: unsafe ? "STANDARD_POOL_RESERVE_GUARD" : `STANDARD_POOL_${state}`,
      };
    }
  }

  if (!incentives.paid_fallback && (unsafe || state === "CRITICAL" || state === "EXHAUSTED")) {
    return {
      blocked: {
        state: "failed",
        error_code: "INCENTIVE_CAP_GUARD",
        retryable: false,
        message: `${requested.pool} pool protected before paid overage; remaining=${remaining ?? "unknown"}, reserve=${reserve}`,
      },
    };
  }

  return { route: requested };
}

async function invokeOpenAI(
  env: WorkflowBindings,
  context: AdapterContext,
  input: Json,
  operation: "chat" | "codex",
  forcedMode?: OpenAIMode,
): Promise<AdapterResult> {
  const mode = selectMode(input, forcedMode);
  const requested = ROUTES[mode];
  const maxOutputTokens = boundedInt(object(input) ? input.max_output_tokens : undefined, operation === "codex" ? 2000 : 1200, 64, MAX_OUTPUT_TOKENS);
  const routed = await resolveRoute(env, requested, input, maxOutputTokens, operation === "chat");
  if ("blocked" in routed) return routed.blocked;

  const credentials = await context.credentials.resolve({
    provider: "openai",
    environment: "staging",
    operation: operation === "codex" ? "codex.patch@1" : "openai.generate@1",
    runId: context.runId,
    nodeId: context.nodeId,
  });
  const apiKey = String(credentials.OPENAI_API_KEY ?? "");
  if (!apiKey) {
    return { state: "failed", error_code: "CONFIGURATION_REQUIRED", retryable: false, message: "OPENAI_API_KEY is not bound" };
  }

  const structured = operation === "codex";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: context.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": context.idempotencyKey,
    },
    body: JSON.stringify({
      model: routed.route.model,
      input: promptFor(input, operation),
      instructions: structured
        ? "Return only a concise implementation summary and a unified diff patch. Do not call tools. Do not include credentials or secrets."
        : "Answer the user request directly. Do not call tools. Keep secrets and credentials out of the response.",
      max_output_tokens: maxOutputTokens,
      store: false,
      ...(structured
        ? {
            text: {
              format: {
                type: "json_schema",
                name: "ogenic_codex_patch",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    patch: { type: "string" },
                  },
                  required: ["summary", "patch"],
                  additionalProperties: false,
                },
              },
            },
          }
        : {}),
    }),
  });

  const body = await response.json().catch(() => ({})) as OpenAIResponse;
  if (!response.ok) {
    return {
      state: "failed",
      error_code: errorCode(response.status, body),
      retryable: retryableStatus(response.status),
      message: body.error?.message ?? `OpenAI HTTP ${response.status}`,
    };
  }

  const text = extractText(body);
  if (!text) {
    return {
      state: "failed",
      error_code: body.incomplete_details?.reason ? "OPENAI_INCOMPLETE" : "OPENAI_EMPTY_OUTPUT",
      retryable: false,
      message: body.incomplete_details?.reason ?? "Response contained no output text",
    };
  }

  const totalTokens = Math.max(0, Math.floor(Number(body.usage?.total_tokens ?? 0)));
  const usage: Record<string, number> = {
    openai_input_tokens: Math.max(0, Math.floor(Number(body.usage?.input_tokens ?? 0))),
    openai_output_tokens: Math.max(0, Math.floor(Number(body.usage?.output_tokens ?? 0))),
    openai_total_tokens: totalTokens,
    [routed.route.usageKey]: totalTokens,
  };

  if (structured) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!object(parsed) || typeof parsed.summary !== "string" || typeof parsed.patch !== "string") throw new Error("shape");
      return { state: "succeeded", output: { summary: parsed.summary, patch: parsed.patch }, usage };
    } catch {
      return { state: "failed", error_code: "OPENAI_INVALID_STRUCTURED_OUTPUT", retryable: false, message: "Codex response did not match the required patch schema", usage };
    }
  }

  return {
    state: "succeeded",
    output: {
      text,
      model: routed.route.model,
      mode: routed.route.mode,
      incentive_pool: routed.route.pool,
      fallback_reason: routed.fallbackReason ?? null,
    },
    usage,
  };
}

export function createOpenAIGenerateAdapter(env: WorkflowBindings): Adapter {
  return {
    uses: "openai.generate@1",
    kind: "agent",
    sideEffect: "read",
    retrySafety: "safe",
    reconciliationSupport: true,
    execute: (input, context) => invokeOpenAI(env, context, input, "chat"),
  };
}

export function createCodexPatchAdapter(env: WorkflowBindings): Adapter {
  return {
    uses: "codex.patch@1",
    kind: "agent",
    sideEffect: "read",
    retrySafety: "safe",
    reconciliationSupport: true,
    execute: (input, context) => invokeOpenAI(env, context, input, "codex", "codex"),
  };
}
