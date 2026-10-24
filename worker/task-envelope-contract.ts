export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export type WaveTaskEnvelopeVersion = "wave.task.envelope.v1";
export type WaveTaskEnvironment = "staging" | "test";
export type WaveTaskPermission = "READ" | "WRITE" | "EXECUTE";
export type WaveTaskTargetZone = "WAVE" | "TMN" | "EXTERNAL_SPECIALIST";
export type WaveTaskExecutionState =
  | "TASK_IN"
  | "AUTHORIZED"
  | "ROUTED"
  | "EXECUTING"
  | "RESULT_OUT"
  | "RESULT_VERIFIED"
  | "BLOCKED"
  | "FAILED";
export type WaveTaskFallbackMode =
  | "HOLD_FOR_OWNER"
  | "TMN_RETRY"
  | "LINEAR_SPECIALIST"
  | "MANUS_SPECIALIST"
  | "NO_FALLBACK";

export interface WaveTaskContextRef {
  readonly context_ref: string;
  readonly context_revision: number;
  readonly a2a_context_id?: string;
  readonly capsule_ref?: string;
  readonly context_sha256?: string;
}

export interface WaveTaskScope {
  readonly environment: WaveTaskEnvironment;
  readonly target_zone: WaveTaskTargetZone;
  readonly capability: string;
  readonly permission: WaveTaskPermission;
  readonly workspace_ref: string;
  readonly no_production: true;
}

export interface WaveTaskAuthorization {
  readonly owner_session: "owner-main/1LSS_OWNER_MAIN" | string;
  readonly authority_ref: string;
  readonly signed_gate: "ATHENA_YELLOW";
  readonly signed_execution_required: true;
  readonly secret_material_in_payload: false;
}

export interface WaveTaskExecution {
  readonly state: WaveTaskExecutionState;
  readonly executor: "TMN" | "GH_ADDMIN_POVIDER" | "CODEX_S_HOST" | "LINEAR" | "MANUS";
  readonly attempt: number;
  readonly max_attempts: number;
  readonly adapter_ref?: string;
  readonly external_task_id?: string;
  readonly command_task_id?: string;
}

export interface WaveTaskResultReceipt {
  readonly receipt_id: string;
  readonly state: "RESULT_OUT" | "RESULT_VERIFIED" | "FAILED" | "BLOCKED";
  readonly result_hash: string;
  readonly evidence_ref: string;
  readonly executor_ref: string;
  readonly completed_at: string;
}

export interface WaveTaskFallback {
  readonly mode: WaveTaskFallbackMode;
  readonly allowed: boolean;
  readonly reason: string;
}

export interface WaveTaskEnvelopeV1 {
  readonly version: WaveTaskEnvelopeVersion;
  readonly task_id: `waveenv_${string}`;
  readonly idempotency_key: string;
  readonly title: string;
  readonly instruction: string;
  readonly context: WaveTaskContextRef;
  readonly scope: WaveTaskScope;
  readonly authorization: WaveTaskAuthorization;
  readonly execution: WaveTaskExecution;
  readonly fallback: WaveTaskFallback;
  readonly a2a?: {
    readonly task_id?: string;
    readonly context_id?: string;
    readonly message_id?: string;
    readonly terminal_state?: "completed" | "failed" | "canceled" | "rejected";
  };
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly result_receipt?: WaveTaskResultReceipt;
}

export type WaveTaskEnvelopeValidation =
  | { readonly ok: true; readonly envelope: WaveTaskEnvelopeV1 }
  | { readonly ok: false; readonly code: string; readonly message: string };

const TASK_ID_PATTERN = /^waveenv_[a-f0-9]{32,128}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i;

function text(value: unknown, max: number): string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : "";
}

function hasSecretLikePayload(value: unknown): boolean {
  return SECRET_PATTERN.test(JSON.stringify(value ?? ""));
}

function isEnvelopeLike(value: unknown): value is WaveTaskEnvelopeV1 {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateWaveTaskEnvelope(value: unknown): WaveTaskEnvelopeValidation {
  if (!isEnvelopeLike(value)) return { ok: false, code: "INVALID_ENVELOPE", message: "Envelope must be an object." };
  const envelope = value as WaveTaskEnvelopeV1;
  if (envelope.version !== "wave.task.envelope.v1") return { ok: false, code: "UNSUPPORTED_VERSION", message: "Only wave.task.envelope.v1 is accepted." };
  if (!TASK_ID_PATTERN.test(envelope.task_id)) return { ok: false, code: "INVALID_TASK_ID", message: "task_id must be waveenv_<hex>." };
  if (!text(envelope.idempotency_key, 160)) return { ok: false, code: "IDEMPOTENCY_REQUIRED", message: "idempotency_key is required." };
  if (!text(envelope.title, 180) || !text(envelope.instruction, 32768)) return { ok: false, code: "TASK_BODY_REQUIRED", message: "title and instruction are required." };
  if (hasSecretLikePayload(envelope)) return { ok: false, code: "SECRET_LIKE_INPUT_REJECTED", message: "Envelope must not contain credentials or bearer material." };
  if (!envelope.context || !text(envelope.context.context_ref, 240) || !Number.isSafeInteger(envelope.context.context_revision) || envelope.context.context_revision < 1) {
    return { ok: false, code: "INVALID_CONTEXT", message: "context_ref and positive context_revision are required." };
  }
  if (envelope.context.context_sha256 && !HASH_PATTERN.test(envelope.context.context_sha256)) return { ok: false, code: "INVALID_CONTEXT_HASH", message: "context_sha256 must be sha256 hex." };
  if (!envelope.scope?.no_production || envelope.scope.environment !== "staging") return { ok: false, code: "STAGING_ONLY", message: "Task Envelope is staging-only and must set no_production=true." };
  if (!envelope.authorization || envelope.authorization.signed_gate !== "ATHENA_YELLOW" || envelope.authorization.signed_execution_required !== true || envelope.authorization.secret_material_in_payload !== false) {
    return { ok: false, code: "SIGNED_GATE_REQUIRED", message: "ATHENA/YELLOW signed gate and no-secret boundary are required." };
  }
  if (!envelope.execution || !Number.isSafeInteger(envelope.execution.attempt) || envelope.execution.attempt < 0 || envelope.execution.max_attempts < 1) {
    return { ok: false, code: "INVALID_EXECUTION", message: "execution attempt/max_attempts are invalid." };
  }
  if (!envelope.fallback) return { ok: false, code: "FALLBACK_REQUIRED", message: "fallback policy is required, even when disabled." };
  return { ok: true, envelope };
}

export function taskEnvelopeToA2AMessage(envelope: WaveTaskEnvelopeV1): Readonly<Record<string, JsonValue>> {
  const validated = validateWaveTaskEnvelope(envelope);
  if (!validated.ok) throw new Error(validated.code);
  return {
    kind: "message",
    messageId: envelope.a2a?.message_id ?? envelope.task_id,
    contextId: envelope.a2a?.context_id ?? envelope.context.a2a_context_id ?? envelope.context.context_ref,
    taskId: envelope.a2a?.task_id ?? envelope.task_id,
    role: "user",
    parts: [{ kind: "text", text: envelope.instruction }],
    metadata: {
      wave_task_id: envelope.task_id,
      context_ref: envelope.context.context_ref,
      context_revision: envelope.context.context_revision,
      scope: { ...envelope.scope },
      authorization_ref: envelope.authorization.authority_ref,
      execution_state: envelope.execution.state,
      fallback: { ...envelope.fallback },
    },
  };
}

export function isTerminalEnvelopeState(state: WaveTaskExecutionState): boolean {
  return state === "RESULT_VERIFIED" || state === "BLOCKED" || state === "FAILED";
}
