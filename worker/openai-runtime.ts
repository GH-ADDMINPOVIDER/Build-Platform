import incentives from "../config/provider-incentives.staging.json";
import { readIncentiveSnapshot } from "./provider-incentives";
import { readCanonicalD1Context } from "./d1-context";
import {
  isR2AttachmentReference,
  markR2ReferenceHandedOff,
  recordR2FileHandoffEvidence,
  resolveR2ReferenceToOpenAIFile,
  type ChatAttachmentStorageEnv,
  type R2AttachmentManifest,
} from "./chat-attachment-storage";
import type { Adapter, AdapterContext, AdapterResult, Json, WorkflowBindings } from "./workflow-engine";

type OpenAIMode = "fast" | "balanced" | "power" | "api" | "codex";
type IncentivePoolId = "standard" | "high_volume" | "api_billing";

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

type ChatAttachmentRow = {
  id: string;
  filename: string;
  mime_type: string;
  data_base64: string;
  size_bytes: number;
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
  api: {
    mode: "api",
    model: "gpt-5.6-sol",
    pool: "api_billing",
    usageKey: "openai_paid_api_tokens",
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
const SAME_MIND_CONVERSATION_ID = "owner-main";

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
  return requested === "fast" || requested === "power" || requested === "balanced" || requested === "api" ? requested : "balanced";
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

async function attachmentRows(env: WorkflowBindings, input: Json) {
  if (!env.DB || !object(input) || !Array.isArray(input.attachment_ids)) return [];
  const ids = input.attachment_ids.map((value) => String(value ?? "").trim()).filter(Boolean).slice(0, 4);
  const rows: ChatAttachmentRow[] = [];
  for (const id of ids) {
    const row = await env.DB.prepare(
      `SELECT id, filename, mime_type, data_base64, size_bytes
       FROM chat_attachments
       WHERE id = ? AND conversation_id = ?`,
    ).bind(id, SAME_MIND_CONVERSATION_ID).first<ChatAttachmentRow>();
    if (row) rows.push(row);
  }
  return rows;
}

async function responsesInputFor(
  env: WorkflowBindings,
  input: Json,
  operation: "chat" | "codex",
  r2AttachmentsForThisTurn: Array<{ attachment_id: string; stored_value: string; manifest: R2AttachmentManifest }> = [],
) {
  if (operation === "codex") return promptFor(input, operation);

  const attachments = await attachmentRows(env, input);
  const totalAttachmentBytes = attachments.reduce((sum, item) => sum + Math.max(0, Number(item.size_bytes ?? 0)), 0);
  if (totalAttachmentBytes > 48 * 1024 * 1024) {
    throw new Error("MODEL_INPUT_TOO_LARGE:all attached files combined must remain below 48 MiB for direct model input");
  }
  for (const attachment of attachments) {
    if (attachment.mime_type.startsWith("image/") && Number(attachment.size_bytes ?? 0) > 20 * 1024 * 1024) {
      throw new Error("MODEL_INPUT_TOO_LARGE:image exceeds the conservative 20 MiB per-image limit");
    }
  }

  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: promptFor(input, operation) }];
  for (const attachment of attachments) {
    const storedReference = isR2AttachmentReference(attachment.data_base64)
      ? await resolveR2ReferenceToOpenAIFile(env as unknown as ChatAttachmentStorageEnv, attachment.data_base64)
      : null;
    if (storedReference?.file_id) {
      r2AttachmentsForThisTurn.push({ attachment_id: attachment.id, stored_value: attachment.data_base64, manifest: storedReference.manifest });
      if (attachment.mime_type.startsWith("image/")) {
        content.push({ type: "input_image", detail: "auto", file_id: storedReference.file_id });
      } else {
        content.push({ type: "input_file", filename: attachment.filename, file_id: storedReference.file_id });
      }
    } else if (attachment.mime_type.startsWith("image/")) {
      content.push({
        type: "input_image",
        detail: "auto",
        image_url: `data:${attachment.mime_type};base64,${attachment.data_base64}`,
      });
    } else {
      content.push({
        type: "input_file",
        filename: attachment.filename,
        file_data: attachment.data_base64,
      });
    }
  }

  return [{ role: "user", content }];
}

async function resolveRoute(
  env: WorkflowBindings,
  requested: Route,
  input: Json,
  maxOutputTokens: number,
  allowVolumeFallback: boolean,
): Promise<{ route: Route; fallbackReason?: string } | { blocked: AdapterResult }> {
  if (requested.mode === "api") {
    return { route: requested, fallbackReason: "PAID_API_MODE" };
  }

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
  const r2AttachmentsForThisTurn: Array<{ attachment_id: string; stored_value: string; manifest: R2AttachmentManifest }> = [];
  const d1Context = await readCanonicalD1Context(env.DB);
  const sharedDirection = `OGENIC canonical D1 direction (read-only):\n${d1Context.text.slice(0, 6000)}\n\nPreserve 1LSS continuity. Treat D1 as shared operating context and never invent a separate source of truth.`;
  let modelInput: unknown;
  try {
    modelInput = await responsesInputFor(env, input, operation, r2AttachmentsForThisTurn);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "ATTACHMENT_INPUT_FAILED";
    const code = message.split(":")[0];
    return {
      state: "failed",
      error_code: code,
      retryable: false,
      message: code === "MODEL_INPUT_TOO_LARGE"
        ? "Attachment is stored, but direct model input needs a chunked extraction path"
        : "Attachment input could not pass the existing file handoff gate",
    };
  }
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
      input: modelInput,
      instructions: structured
        ? `${sharedDirection}\n\nReturn only a concise implementation summary and a unified diff patch. Do not call tools. Do not include credentials or secrets.`
        : `${sharedDirection}\n\nAnswer the user request directly. Use attached images/files when present. Do not call tools. Keep secrets and credentials out of the response.`,
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

  let fileHandoffState = r2AttachmentsForThisTurn.length ? "EVIDENCE_PENDING" : "NOT_APPLICABLE";
  if (operation === "chat" && r2AttachmentsForThisTurn.length) {
    try {
      for (const item of r2AttachmentsForThisTurn) {
        await recordR2FileHandoffEvidence(env as unknown as ChatAttachmentStorageEnv, item.manifest, "FILE_HANDOFF_COMPLETED");
        const handedOff = await markR2ReferenceHandedOff(env as unknown as ChatAttachmentStorageEnv, item.stored_value);
        if (!handedOff || handedOff.status !== "HANDED_OFF") throw new Error("HANDOFF_STATE_NOT_PERSISTED");
      }
      fileHandoffState = "HANDED_OFF";
    } catch {
      fileHandoffState = "EVIDENCE_PENDING";
    }
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
      file_handoff_state: fileHandoffState,
      verified_attachment_count: fileHandoffState === "HANDED_OFF" ? r2AttachmentsForThisTurn.length : 0,
    },
    usage,
  };
}

export function createOpenAIGenerateAdapter(env: WorkflowBindings): Adapter {
  return {
    uses: "openai.generate@1",
    kind: "agent",
    sideEffect: "read",
    // Responses API idempotent-replay/reconciliation is not assumed here. Ambiguous network failures must not auto-retry and risk duplicate token spend.
    retrySafety: "unsafe",
    reconciliationSupport: false,
    execute: (input, context) => invokeOpenAI(env, context, input, "chat"),
  };
}

export function createCodexPatchAdapter(env: WorkflowBindings): Adapter {
  return {
    uses: "codex.patch@1",
    kind: "agent",
    sideEffect: "read",
    // Same conservative rule for Codex until a provider-supported reconciliation contract is explicit.
    retrySafety: "unsafe",
    reconciliationSupport: false,
    execute: (input, context) => invokeOpenAI(env, context, input, "codex", "codex"),
  };
}
