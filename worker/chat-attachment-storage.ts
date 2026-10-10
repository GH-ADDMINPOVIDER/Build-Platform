import { publicCcsStatus } from "./capability-card-stone";

/**
 * WAVE large-file storage bridge.
 *
 * R2 holds the original bytes. D1 keeps only the legacy chat attachment
 * metadata row plus a versioned R2 reference in data_base64. Every reader
 * must detect this marker before interpreting data_base64 as Base64.
 *
 * No bucket binding is assumed: absent CHAT_UPLOADS fails closed with
 * CONFIGURATION_REQUIRED:R2_BUCKET. Never expose this binding or API keys.
 */
export const R2_ATTACHMENT_REF_PREFIX = "R2REF1:";
export const R2_ATTACHMENT_MANIFEST_PREFIX = "__wave_chat_uploads/manifests/";
export const R2_ATTACHMENT_IDEMPOTENCY_PREFIX = "__wave_chat_uploads/idempotency/";
export const R2_ATTACHMENT_PART_SIZE = 8 * 1024 * 1024;
export const R2_ATTACHMENT_MAX_BYTES = 1_073_741_824; // 1 GiB storage cap; not the model input cap.
export const R2_RESPONSES_FILE_MAX_BYTES = 48_000_000; // Decimal bytes; safely below the Responses API 50 MB request/file ceiling.
export const R2_RESPONSES_IMAGE_MAX_BYTES = 20_000_000; // Decimal bytes; conservative per-image ceiling.
export const R2_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

export type R2UploadedPartLike = { partNumber: number; etag: string };
export type R2MultipartUploadLike = {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | Blob | string): Promise<R2UploadedPartLike>;
  complete(parts: R2UploadedPartLike[]): Promise<{ key: string; size: number; httpEtag: string }>;
  abort(): Promise<void>;
};
export type R2ObjectBodyLike = {
  size: number;
  httpEtag?: string;
  body?: ReadableStream<Uint8Array>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type R2BucketLike = {
  createMultipartUpload(key: string, options?: Record<string, unknown>): Promise<R2MultipartUploadLike>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadLike;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBodyLike | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | Blob, options?: Record<string, unknown>): Promise<unknown>;
  delete(key: string): Promise<void>;
  list?(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; uploaded?: Date }>; truncated?: boolean; cursor?: string }>;
};
export type ChatAttachmentStorageEnv = {
  CHAT_UPLOADS?: R2BucketLike;
  OPENAI_API_KEY?: string;
  DB?: { prepare(query: string): { bind(...values: unknown[]): { first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> } } };
};

export type R2AttachmentManifest = {
  version: 1;
  handle: string;
  attachment_id: string;
  key: string;
  r2_upload_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  part_size_bytes: number;
  total_parts: number;
  owner_id: "owner";
  conversation_id: "owner-main";
  status: "UPLOADING" | "UPLOADED" | "PROVIDER_FILE_READY" | "HANDED_OFF" | "ABORTED" | "EXPIRED";
  created_at: number;
  expires_at: number;
  idempotency_object_key: string;
  object_etag?: string;
  openai_upload_id?: string;
  openai_upload_created_at?: number;
  openai_part_ids?: string[];
  openai_file_id?: string;
  handoff_error_code?: string;
};

export function isR2AttachmentReference(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(R2_ATTACHMENT_REF_PREFIX);
}

export function r2AttachmentReference(handle: string) {
  return `${R2_ATTACHMENT_REF_PREFIX}${handle}`;
}

export function parseR2AttachmentReference(value: unknown): string | null {
  if (!isR2AttachmentReference(value)) return null;
  const handle = value.slice(R2_ATTACHMENT_REF_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(handle)
    ? handle
    : null;
}

export function r2ManifestKey(handle: string) {
  return `${R2_ATTACHMENT_MANIFEST_PREFIX}${handle}.json`;
}

export function r2IdempotencyKey(digest: string) {
  return `${R2_ATTACHMENT_IDEMPOTENCY_PREFIX}${digest}.json`;
}

export function isSafeUploadHandle(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requiredBucket(env: ChatAttachmentStorageEnv): R2BucketLike {
  if (!env.CHAT_UPLOADS) throw new Error("CONFIGURATION_REQUIRED:R2_BUCKET");
  return env.CHAT_UPLOADS;
}

export function fileHandoffGateStatus() {
  const ccs = publicCcsStatus();
  const ready = ccs.protocol === "CCS/1.0" && ccs.fail_closed === true && ccs.direct_execution_bypass === false;
  return {
    ok: ready,
    protocol: ccs.protocol,
    stone_code: ccs.stone_code,
    fail_closed: ccs.fail_closed === true,
    direct_execution_bypass: ccs.direct_execution_bypass === true,
    state: ready ? "READY" : "BLOCKED",
    code: ready ? null : "CCS_GATE_POLICY_UNSAFE",
  };
}

export function assertFileHandoffGate() {
  const gate = fileHandoffGateStatus();
  if (!gate.ok) throw new Error(`CCS_GATE_BLOCKED:${gate.code || "POLICY_UNSAFE"}`);
  return gate;
}

export function chatAttachmentStorageStatus(env: ChatAttachmentStorageEnv) {
  const storageReady = Boolean(env.CHAT_UPLOADS);
  const modelReady = Boolean(String(env.OPENAI_API_KEY ?? "").trim());
  const cardGate = fileHandoffGateStatus();
  const gateState = !cardGate.ok ? "BLOCKED" : storageReady ? (modelReady ? "READY" : "CONFIGURATION_REQUIRED") : "CONFIGURATION_REQUIRED";
  return {
    ok: true,
    protocol: "WAVE_FILE_HANDOFF_V1",
    card: "EXISTING_MCP_STATUS_GATE",
    gate_state: gateState,
    ccs_gate: cardGate,
    storage: { provider: "cloudflare_r2", state: storageReady ? "BOUND" : "CONFIGURATION_REQUIRED", code: storageReady ? null : "R2_BUCKET_NOT_BOUND" },
    agent_handoff: { provider: "openai_file_reference", state: modelReady ? "BOUND" : "CONFIGURATION_REQUIRED", code: modelReady ? null : "OPENAI_API_KEY_NOT_BOUND" },
    owner_scope: "owner-main",
    session_line: "1LSS_OWNER_MAIN",
    max_file_bytes: R2_ATTACHMENT_MAX_BYTES,
    max_file_bytes_label: "1 GiB stored",
    max_direct_model_file_bytes: R2_RESPONSES_FILE_MAX_BYTES,
    max_direct_model_image_bytes: R2_RESPONSES_IMAGE_MAX_BYTES,
    max_direct_model_file_label: "48 MB",
    max_direct_model_image_label: "20 MB",
    part_size_bytes: R2_ATTACHMENT_PART_SIZE,
    part_size_bytes_label: "8 MiB",
    expires_after_hours: 24,
    direct_execution_bypass: false,
    raw_secret_exposed: false,
  };
}

export async function loadR2AttachmentManifest(env: ChatAttachmentStorageEnv, handle: string): Promise<R2AttachmentManifest | null> {
  if (!isSafeUploadHandle(handle)) return null;
  const object = await requiredBucket(env).get(r2ManifestKey(handle));
  if (!object) return null;
  const parsed = await object.text().then(value => JSON.parse(value) as R2AttachmentManifest).catch(() => null);
  if (!parsed || parsed.version !== 1 || parsed.handle !== handle || parsed.owner_id !== "owner" || parsed.conversation_id !== "owner-main") return null;
  if (parsed.expires_at <= Date.now() && parsed.status !== "ABORTED" && parsed.status !== "EXPIRED") {
    parsed.status = "EXPIRED";
    await saveR2AttachmentManifest(env, parsed);
    return parsed;
  }
  return parsed;
}

export async function saveR2AttachmentManifest(env: ChatAttachmentStorageEnv, manifest: R2AttachmentManifest) {
  await requiredBucket(env).put(r2ManifestKey(manifest.handle), JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
  });
}

export async function beginR2AttachmentUpload(
  env: ChatAttachmentStorageEnv,
  input: { filename: string; mime_type: string; size_bytes: number; idempotency_key: string },
): Promise<R2AttachmentManifest> {
  assertFileHandoffGate();
  const bucket = requiredBucket(env);
  const filename = input.filename.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  const mime = input.mime_type.trim().toLowerCase().slice(0, 120);
  const size = Math.floor(Number(input.size_bytes));
  if (!filename) throw new Error("ATTACHMENT_FILENAME_REQUIRED");
  if (!mime || mime === "application/octet-stream") throw new Error("UNSUPPORTED_ATTACHMENT_TYPE");
  if (!Number.isSafeInteger(size) || size <= 4_000_000 || size > R2_ATTACHMENT_MAX_BYTES) throw new Error("ATTACHMENT_SIZE_OUT_OF_RANGE");
  if (!input.idempotency_key || input.idempotency_key.length > 240) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const idempotencyDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`owner-main:${input.idempotency_key}`)))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
  const idempotencyObjectKey = r2IdempotencyKey(idempotencyDigest);
  const existingMap = await bucket.get(idempotencyObjectKey);
  if (existingMap) {
    const mapped = await existingMap.text().then(value => JSON.parse(value) as { handle?: string }).catch(() => ({}));
    if (mapped.handle && isSafeUploadHandle(mapped.handle)) {
      const existing = await loadR2AttachmentManifest(env, mapped.handle);
      if (existing && existing.expires_at > Date.now() && existing.status !== "ABORTED" && existing.status !== "EXPIRED") {
        if (existing.filename !== filename || existing.mime_type !== mime || existing.size_bytes !== size) {
          throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        }
        return existing;
      }
    }
  }
  const handle = crypto.randomUUID();
  const key = `attachments/owner-main/${handle}/${filename.replace(/[/\\]/g, "_")}`;
  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: mime },
    customMetadata: { owner_scope: "owner-main", upload_protocol: "WAVE_FILE_HANDOFF_V1" },
  });
  const manifest: R2AttachmentManifest = {
    version: 1, handle, attachment_id: `att_${handle}`, key, r2_upload_id: upload.uploadId,
    filename, mime_type: mime, size_bytes: size, part_size_bytes: R2_ATTACHMENT_PART_SIZE,
    total_parts: Math.ceil(size / R2_ATTACHMENT_PART_SIZE),
    owner_id: "owner", conversation_id: "owner-main", status: "UPLOADING",
    created_at: Date.now(), expires_at: Date.now() + R2_ATTACHMENT_TTL_MS,
    idempotency_object_key: idempotencyObjectKey,
  };
  await saveR2AttachmentManifest(env, manifest);
  await bucket.put(idempotencyObjectKey, JSON.stringify({ handle, expires_at: manifest.expires_at }), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
  });
  return manifest;
}

export async function uploadR2AttachmentPart(
  env: ChatAttachmentStorageEnv,
  manifest: R2AttachmentManifest,
  partNumber: number,
  bytes: ArrayBuffer,
): Promise<R2UploadedPartLike> {
  assertFileHandoffGate();
  if (manifest.status !== "UPLOADING") throw new Error("UPLOAD_SESSION_NOT_OPEN");
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > manifest.total_parts) throw new Error("INVALID_PART_NUMBER");
  if (manifest.expires_at <= Date.now()) throw new Error("UPLOAD_SESSION_EXPIRED");
  const expectedStart = (partNumber - 1) * manifest.part_size_bytes;
  const expectedSize = Math.min(manifest.part_size_bytes, manifest.size_bytes - expectedStart);
  if (bytes.byteLength !== expectedSize) throw new Error("UPLOAD_PART_SIZE_MISMATCH");
  return requiredBucket(env).resumeMultipartUpload(manifest.key, manifest.r2_upload_id).uploadPart(partNumber, bytes);
}

export async function completeR2AttachmentUpload(
  env: ChatAttachmentStorageEnv,
  manifest: R2AttachmentManifest,
  parts: R2UploadedPartLike[],
): Promise<R2AttachmentManifest> {
  assertFileHandoffGate();
  const bucket = requiredBucket(env);
  if (manifest.status === "UPLOADED" || manifest.status === "PROVIDER_FILE_READY" || manifest.status === "HANDED_OFF") return manifest;
  if (manifest.status !== "UPLOADING") throw new Error("UPLOAD_SESSION_NOT_OPEN");
  if (manifest.expires_at <= Date.now()) throw new Error("UPLOAD_SESSION_EXPIRED");
  if (!Array.isArray(parts) || parts.length !== manifest.total_parts) throw new Error("UPLOAD_PART_LIST_INCOMPLETE");
  const normalized = parts.map(part => ({ partNumber: Number(part?.partNumber), etag: String(part?.etag ?? "").trim().replace(/^"|"$/g, "") }));
  normalized.sort((a, b) => a.partNumber - b.partNumber);
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i].partNumber !== i + 1 || !normalized[i].etag || normalized[i].etag.length > 256) throw new Error("UPLOAD_PART_LIST_INVALID");
  }
  const object = await bucket.resumeMultipartUpload(manifest.key, manifest.r2_upload_id).complete(normalized);
  if (object.size !== manifest.size_bytes) {
    await bucket.delete(manifest.key).catch(() => undefined);
    manifest.status = "ABORTED";
    await saveR2AttachmentManifest(env, manifest);
    throw new Error("UPLOAD_TOTAL_SIZE_MISMATCH");
  }
  manifest.status = "UPLOADED";
  manifest.object_etag = object.httpEtag ?? "";
  await saveR2AttachmentManifest(env, manifest);
  return manifest;
}

export async function abortR2AttachmentUpload(env: ChatAttachmentStorageEnv, manifest: R2AttachmentManifest) {
  if (manifest.status === "UPLOADING") {
    await requiredBucket(env).resumeMultipartUpload(manifest.key, manifest.r2_upload_id).abort().catch(() => undefined);
    manifest.status = "ABORTED";
    await saveR2AttachmentManifest(env, manifest);
  }
  return manifest;
}

async function openAIJson(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    const code = String(error.code ?? "");
    const message = String(error.message ?? "").slice(0, 240);
    throw new Error(code ? `OPENAI_UPLOAD_FAILED:${code}` : `OPENAI_UPLOAD_HTTP_${response.status}${message ? `:${message}` : ""}`);
  }
  return body;
}

/**
 * Convert an R2 object to an OpenAI File using OpenAI's multipart Upload API.
 * Only one bounded part is buffered at a time; the R2 object remains canonical.
 */
export async function ensureR2AttachmentOpenAIFile(
  env: ChatAttachmentStorageEnv,
  manifest: R2AttachmentManifest,
): Promise<R2AttachmentManifest> {
  const inputBlocker = r2ModelInputBlocker(manifest);
  if (inputBlocker) {
    manifest.handoff_error_code = inputBlocker;
    await saveR2AttachmentManifest(env, manifest);
    throw new Error(`${inputBlocker}:${manifest.mime_type.startsWith("image/") ? "image exceeds the conservative 20 MiB model input limit" : "file exceeds the conservative 48 MiB model input limit"}; stored object requires chunked extraction`);
  }
  assertFileHandoffGate();
  if (manifest.openai_file_id) return manifest;
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("CONFIGURATION_REQUIRED:OPENAI_API_KEY");
  if (manifest.status !== "UPLOADED" && manifest.status !== "PROVIDER_FILE_READY" && manifest.status !== "HANDED_OFF") throw new Error("ATTACHMENT_NOT_UPLOADED");
  const bucket = requiredBucket(env);
  const now = Date.now();
  let uploadId = manifest.openai_upload_id;
  let partIds = [...(manifest.openai_part_ids ?? [])];
  if (!uploadId || !manifest.openai_upload_created_at || now - manifest.openai_upload_created_at >= 55 * 60 * 1000) {
    const uploadResponse = await fetch("https://api.openai.com/v1/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: manifest.filename,
        bytes: manifest.size_bytes,
        purpose: "user_data",
        mime_type: manifest.mime_type,
        expires_after: { anchor: "created_at", seconds: 86_400 },
      }),
    });
    const upload = await openAIJson(uploadResponse);
    uploadId = String(upload.id ?? "");
    if (!uploadId) throw new Error("OPENAI_UPLOAD_ID_MISSING");
    partIds = [];
    manifest.openai_upload_id = uploadId;
    manifest.openai_upload_created_at = now;
    manifest.openai_part_ids = [];
    manifest.handoff_error_code = undefined;
    await saveR2AttachmentManifest(env, manifest);
  }
  const totalParts = Math.ceil(manifest.size_bytes / R2_ATTACHMENT_PART_SIZE);
  for (let partIndex = partIds.length; partIndex < totalParts; partIndex += 1) {
    const offset = partIndex * R2_ATTACHMENT_PART_SIZE;
    const length = Math.min(R2_ATTACHMENT_PART_SIZE, manifest.size_bytes - offset);
    const objectPart = await bucket.get(manifest.key, { range: { offset, length } });
    if (!objectPart) throw new Error("R2_OBJECT_PART_NOT_FOUND");
    const bytes = await objectPart.arrayBuffer();
    if (bytes.byteLength !== length) throw new Error("R2_OBJECT_PART_SIZE_MISMATCH");
    const form = new FormData();
    form.append("data", new Blob([bytes], { type: manifest.mime_type }), manifest.filename);
    const response = await fetch(`https://api.openai.com/v1/uploads/${encodeURIComponent(uploadId)}/parts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const part = await openAIJson(response);
    const partId = String(part.id ?? "");
    if (!partId) throw new Error("OPENAI_UPLOAD_PART_ID_MISSING");
    partIds.push(partId);
    manifest.openai_part_ids = partIds;
    await saveR2AttachmentManifest(env, manifest);
  }
  const completedResponse = await fetch(`https://api.openai.com/v1/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ part_ids: partIds }),
  });
  const completed = await openAIJson(completedResponse);
  const file = completed.file && typeof completed.file === "object" ? completed.file as Record<string, unknown> : {};
  const fileId = String(file.id ?? "");
  if (completed.status !== "completed" || !fileId) throw new Error("OPENAI_UPLOAD_COMPLETION_UNVERIFIED");
  manifest.openai_file_id = fileId;
  manifest.status = "PROVIDER_FILE_READY";
  manifest.handoff_error_code = undefined;
  await saveR2AttachmentManifest(env, manifest);
  return manifest;
}

export async function resolveR2ReferenceToOpenAIFile(
  env: ChatAttachmentStorageEnv,
  storedValue: string,
): Promise<{ file_id: string; manifest: R2AttachmentManifest } | null> {
  if (!isR2AttachmentReference(storedValue)) return null;
  assertFileHandoffGate();
  const handle = parseR2AttachmentReference(storedValue);
  if (!handle) throw new Error("ATTACHMENT_REFERENCE_INVALID");
  const manifest = await loadR2AttachmentManifest(env, handle);
  if (!manifest || manifest.status === "ABORTED" || manifest.status === "EXPIRED") throw new Error("ATTACHMENT_NOT_FOUND");
  const resolved = await ensureR2AttachmentOpenAIFile(env, manifest);
  if (!resolved.openai_file_id) throw new Error("ATTACHMENT_HANDOFF_NOT_READY");
  return { file_id: resolved.openai_file_id, manifest: resolved };
}

export async function readR2AttachmentObject(
  env: ChatAttachmentStorageEnv,
  storedValue: string,
): Promise<{ object: R2ObjectBodyLike; manifest: R2AttachmentManifest } | null> {
  if (!isR2AttachmentReference(storedValue)) return null;
  assertFileHandoffGate();
  const handle = parseR2AttachmentReference(storedValue);
  if (!handle) throw new Error("ATTACHMENT_REFERENCE_INVALID");
  const manifest = await loadR2AttachmentManifest(env, handle);
  if (!manifest || (manifest.status !== "UPLOADED" && manifest.status !== "PROVIDER_FILE_READY" && manifest.status !== "HANDED_OFF")) throw new Error("ATTACHMENT_NOT_FOUND");
  const object = await requiredBucket(env).get(manifest.key);
  if (!object || object.size !== manifest.size_bytes) throw new Error("R2_OBJECT_NOT_FOUND");
  return { object, manifest };
}

export function r2ModelInputBlocker(manifest: Pick<R2AttachmentManifest, "mime_type" | "size_bytes">) {
  if (manifest.mime_type.startsWith("image/") && manifest.size_bytes > R2_RESPONSES_IMAGE_MAX_BYTES) return "MODEL_INPUT_TOO_LARGE";
  if (manifest.size_bytes > R2_RESPONSES_FILE_MAX_BYTES) return "MODEL_INPUT_TOO_LARGE";
  return null;
}

export async function recordR2FileHandoffEvidence(
  env: ChatAttachmentStorageEnv,
  manifest: R2AttachmentManifest,
  eventType: "FILE_UPLOAD_COMPLETED" | "PROVIDER_FILE_READY" | "FILE_HANDOFF_COMPLETED",
) {
  if (!env.DB) throw new Error("CONFIGURATION_REQUIRED:D1");
  const db = env.DB;
  const now = Date.now();
  const idempotencyKey = `file_handoff:${eventType}:${manifest.attachment_id}`;
  const existing = await db.prepare(
    `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
  ).bind(manifest.conversation_id, idempotencyKey).first<{ sequence_no?: number }>();
  if (existing?.sequence_no) return Number(existing.sequence_no);

  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(manifest.conversation_id, manifest.owner_id, "OGENIC SAME MIND", now, now).run();
  const sequence = await db.prepare(
    `UPDATE chat_conversations SET last_sequence = last_sequence + 1, updated_at = ? WHERE id = ? RETURNING last_sequence`,
  ).bind(now, manifest.conversation_id).first<{ last_sequence: number }>();
  if (!sequence || !Number.isFinite(Number(sequence.last_sequence))) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");

  const evidence = {
    schema: "OGENIC_FILE_HANDOFF_EVIDENCE_V1",
    event_type: eventType,
    attachment_id: manifest.attachment_id,
    mime_type: manifest.mime_type,
    size_bytes: manifest.size_bytes,
    storage: "cloudflare_r2",
    card: "EXISTING_MCP_STATUS_GATE",
    gate_protocol: "CCS/1.0",
    owner_scope: "owner-main",
    session_line: "1LSS_OWNER_MAIN",
    verified_from_bytes: eventType === "FILE_HANDOFF_COMPLETED",
    direct_execution_bypass: false,
    secret_values_included: false,
  };
  await db.prepare(
    `INSERT OR IGNORE INTO chat_messages(
       id, conversation_id, role, content, model, run_id, created_at,
       sequence_no, source_surface, idempotency_key
     ) VALUES (?, ?, 'system', ?, NULL, NULL, ?, ?, 'ogenic-web', ?)`,
  ).bind(`fileev_${crypto.randomUUID()}`, manifest.conversation_id, JSON.stringify(evidence), now, Number(sequence.last_sequence), idempotencyKey).run();
  return Number(sequence.last_sequence);
}

export async function markR2ReferenceHandedOff(env: ChatAttachmentStorageEnv, storedValue: string): Promise<R2AttachmentManifest | null> {
  if (!isR2AttachmentReference(storedValue)) return null;
  assertFileHandoffGate();
  const handle = parseR2AttachmentReference(storedValue);
  if (!handle) throw new Error("ATTACHMENT_REFERENCE_INVALID");
  const manifest = await loadR2AttachmentManifest(env, handle);
  if (!manifest || !manifest.openai_file_id || !["PROVIDER_FILE_READY", "HANDED_OFF"].includes(manifest.status)) {
    throw new Error("ATTACHMENT_HANDOFF_NOT_READY");
  }
  const inputBlocker = r2ModelInputBlocker(manifest);
  if (inputBlocker) throw new Error(`${inputBlocker}:stored file requires a chunked extraction path`);
  if (manifest.status !== "HANDED_OFF") {
    manifest.status = "HANDED_OFF";
    manifest.handoff_error_code = undefined;
    await saveR2AttachmentManifest(env, manifest);
  }
  return manifest;
}

/**
 * Prune expired objects and their provider files. Process a bounded page on each
 * scheduled tick so cleanup never monopolizes a Worker invocation.
 */
export async function cleanExpiredR2Attachments(env: ChatAttachmentStorageEnv, maxItems = 50) {
  if (!env.CHAT_UPLOADS?.list) return { ok: false, code: "CONFIGURATION_REQUIRED:R2_BUCKET", scanned: 0, deleted: 0 };
  const bucket = env.CHAT_UPLOADS;
  const page = await bucket.list({ prefix: R2_ATTACHMENT_MANIFEST_PREFIX, limit: Math.max(1, Math.min(100, maxItems)) });
  let scanned = 0;
  let deleted = 0;
  const errors: string[] = [];
  for (const listed of page.objects) {
    scanned += 1;
    try {
      const object = await bucket.get(listed.key);
      if (!object) continue;
      const manifest = await object.text().then(value => JSON.parse(value) as R2AttachmentManifest).catch(() => null);
      if (!manifest || manifest.version !== 1 || !isSafeUploadHandle(String(manifest.handle ?? ""))) continue;
      if (manifest.expires_at > Date.now() && manifest.status !== "EXPIRED" && manifest.status !== "ABORTED") continue;
      if (
        manifest.r2_upload_id &&
        !["UPLOADED", "PROVIDER_FILE_READY", "HANDED_OFF"].includes(manifest.status)
      ) {
        // Expiry normalization can change UPLOADING to EXPIRED before cleanup;
        // still abort the underlying multipart session when it has not completed.
        await bucket.resumeMultipartUpload(manifest.key, manifest.r2_upload_id).abort().catch(() => undefined);
      }
      await bucket.delete(manifest.key).catch(() => undefined);
      if (manifest.openai_upload_id && !manifest.openai_file_id && env.OPENAI_API_KEY) {
        await fetch(`https://api.openai.com/v1/uploads/${encodeURIComponent(manifest.openai_upload_id)}/cancel`, {
          method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        }).catch(() => undefined);
      }
      if (manifest.openai_file_id && env.OPENAI_API_KEY) {
        const response = await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(manifest.openai_file_id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        });
        if (!response.ok && response.status !== 404) errors.push("OPENAI_FILE_CLEANUP_FAILED");
      }
      await bucket.delete(listed.key).catch(() => undefined);
      if (manifest.idempotency_object_key) await bucket.delete(manifest.idempotency_object_key).catch(() => undefined);
      if (env.DB) {
        await env.DB.prepare("DELETE FROM chat_attachments WHERE id = ? AND conversation_id = ?")
          .bind(manifest.attachment_id, manifest.conversation_id).run();
      }
      deleted += 1;
    } catch {
      errors.push("EXPIRED_FILE_CLEANUP_FAILED");
    }
  }
  return { ok: errors.length === 0, scanned, deleted, errors: [...new Set(errors)], has_more: page.truncated === true };
}
