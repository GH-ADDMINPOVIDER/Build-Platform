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
export const R2_ATTACHMENT_MAX_BYTES = 1_073_741_824; // 1 GiB per file; policy cap, not R2's platform maximum.
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
  status: "UPLOADING" | "UPLOADED" | "HANDED_OFF" | "ABORTED" | "EXPIRED";
  created_at: number;
  expires_at: number;
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

export function chatAttachmentStorageStatus(env: ChatAttachmentStorageEnv) {
  const storageReady = Boolean(env.CHAT_UPLOADS);
  const modelReady = Boolean(String(env.OPENAI_API_KEY ?? "").trim());
  return {
    ok: true,
    protocol: "WAVE_FILE_HANDOFF_V1",
    card: "EXISTING_MCP_STATUS_GATE",
    gate_state: storageReady ? (modelReady ? "READY" : "CONFIGURATION_REQUIRED") : "CONFIGURATION_REQUIRED",
    storage: { provider: "cloudflare_r2", state: storageReady ? "BOUND" : "CONFIGURATION_REQUIRED", code: storageReady ? null : "R2_BUCKET_NOT_BOUND" },
    agent_handoff: { provider: "openai_file_reference", state: modelReady ? "BOUND" : "CONFIGURATION_REQUIRED", code: modelReady ? null : "OPENAI_API_KEY_NOT_BOUND" },
    owner_scope: "owner-main",
    session_line: "1LSS_OWNER_MAIN",
    max_file_bytes: R2_ATTACHMENT_MAX_BYTES,
    max_file_bytes_label: "1 GiB",
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
  if (parsed.expires_at <= Date.now() && parsed.status === "UPLOADING") {
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
  const bucket = requiredBucket(env);
  const filename = input.filename.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  const mime = input.mime_type.trim().toLowerCase().slice(0, 120);
  const size = Math.floor(Number(input.size_bytes));
  if (!filename) throw new Error("ATTACHMENT_FILENAME_REQUIRED");
  if (!mime || mime === "application/octet-stream") throw new Error("UNSUPPORTED_ATTACHMENT_TYPE");
  if (!Number.isSafeInteger(size) || size <= 4_000_000 || size > R2_ATTACHMENT_MAX_BYTES) throw new Error("ATTACHMENT_SIZE_OUT_OF_RANGE");
  if (!input.idempotency_key || input.idempotency_key.length > 240) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
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
  };
  await saveR2AttachmentManifest(env, manifest);
  return manifest;
}

export async function uploadR2AttachmentPart(
  env: ChatAttachmentStorageEnv,
  manifest: R2AttachmentManifest,
  partNumber: number,
  bytes: ArrayBuffer,
): Promise<R2UploadedPartLike> {
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
  const bucket = requiredBucket(env);
  if (manifest.status === "UPLOADED" || manifest.status === "HANDED_OFF") return manifest;
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
  if (manifest.openai_file_id) return manifest;
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("CONFIGURATION_REQUIRED:OPENAI_API_KEY");
  if (manifest.status !== "UPLOADED" && manifest.status !== "HANDED_OFF") throw new Error("ATTACHMENT_NOT_UPLOADED");
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
      }),
    });
    const upload = await openAIJson(uploadResponse);
    uploadId = String(upload.id ?? "");
    if (!uploadId) throw new Error("OPENAI_UPLOAD_ID_MISSING");
    partIds = [];
    manifest.openai_upload_id = uploadId;
    manifest.openai_upload_created_at = now;
    manifest.openai_part_ids = [];
    await saveR2AttachmentManifest(env, manifest);
  }
  const totalParts = Math.ceil(manifest.size_bytes / R2_ATTACHMENT_PART_SIZE);
  for (let partIndex = partIds.length; partIndex < totalParts; partIndex += 1) {
    const offset = partIndex * R2_ATTACHMENT_PART_SIZE;
    const length = Math.min(R2_ATTACHMENT_PART_SIZE, manifest.size_bytes - offset);
    const objectPart = await bucket.get(manifest.key, { range: { offset, length } });
    if (!objectPart || objectPart.size !== length) throw new Error("R2_OBJECT_PART_NOT_FOUND");
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
  manifest.status = "HANDED_OFF";
  manifest.handoff_error_code = undefined;
  await saveR2AttachmentManifest(env, manifest);
  return manifest;
}

export async function resolveR2ReferenceToOpenAIFile(
  env: ChatAttachmentStorageEnv,
  storedValue: string,
): Promise<{ file_id: string; manifest: R2AttachmentManifest } | null> {
  if (!isR2AttachmentReference(storedValue)) return null;
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
  const handle = parseR2AttachmentReference(storedValue);
  if (!handle) throw new Error("ATTACHMENT_REFERENCE_INVALID");
  const manifest = await loadR2AttachmentManifest(env, handle);
  if (!manifest || (manifest.status !== "UPLOADED" && manifest.status !== "HANDED_OFF")) throw new Error("ATTACHMENT_NOT_FOUND");
  const object = await requiredBucket(env).get(manifest.key);
  if (!object || object.size !== manifest.size_bytes) throw new Error("R2_OBJECT_NOT_FOUND");
  return { object, manifest };
}
