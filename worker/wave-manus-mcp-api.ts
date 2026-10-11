import { hasOwnerOrOpsAccess } from "./app-auth";
import type { ConnectorBindings } from "./connector-runtime";

type BridgeBindings = ConnectorBindings & {
  WAVE_MANUS_MCP_TOKEN?: string;
  WAVE_N8N_HOOK_TOKEN?: string;
  OGENIC_RUNTIME?: string;
  OGENIC_PHASE?: string;
  OGENIC_GITHUB_BRANCH?: string;
  OGENIC_GIT_SHA?: string;
};
type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};
type IntakeSource = "wave" | "discord" | "n8n" | "manus";
type IntakeKind = "url" | "image" | "file";
type IntakeInput = {
  event_id?: unknown;
  source?: unknown;
  kind?: unknown;
  title?: unknown;
  note?: unknown;
  url?: unknown;
  attachment_ref?: unknown;
  mime_type?: unknown;
  data_url?: unknown;
};
type StoredEvent = {
  id: string;
  event_type: string;
  state: string;
  external_id: string | null;
  detail_json: string | null;
  created_at: number;
};
type IntakeRecord = {
  item_id: string;
  event_id: string;
  source: IntakeSource;
  kind: IntakeKind;
  title: string;
  note: string;
  url: string | null;
  attachment_ref: string | null;
  owned_attachment: boolean;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: number;
  expires_at: number;
  ttl_seconds: number;
  storage_status: "IMAGE_BYTES_STORED_TEMPORARILY" | "FILE_BYTES_STORED_TEMPORARILY" | "URL_REFERENCE_ONLY" | "ATTACHMENT_REFERENCE_ONLY";
  bytes_verified: boolean;
};

const PROVIDER = "wave_data_stone";
const TTL_MS = 5 * 60 * 1000;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 5_800_000;
const MAX_DATA_URL_CHARS = 5_500_000;
const MAX_ATTACHMENT_BYTES = 4_000_000;
const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json",
]);
const MCP_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const enc = new TextEncoder();
const clean = (value: unknown, max = 240) => String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);

function safeEqual(left: string, right: string) {
  const a = enc.encode(left);
  const b = enc.encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function bearer(request: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1]?.trim() ?? "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonRpc(id: JsonRpcId | undefined, result: unknown, protocolVersion = MCP_PROTOCOLS[0]) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, {
    status: 200,
    headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": protocolVersion },
  });
}

function jsonRpcError(id: JsonRpcId | undefined, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": MCP_PROTOCOLS[0] },
  });
}

function toolResult(value: unknown, isError = false, extraContent: Array<Record<string, unknown>> = []) {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: JSON.stringify(value) }, ...extraContent];
  return { content, structuredContent: value, ...(isError ? { isError: true } : {}) };
}

function parseJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

function safeUrl(value: unknown) {
  const raw = clean(value, 2048);
  if (!raw) return { url: null as string | null, error: null as string | null };
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return { url: null, error: "HTTPS_URL_REQUIRED" };
    if (parsed.username || parsed.password) return { url: null, error: "URL_CREDENTIALS_NOT_ALLOWED" };
    for (const [key] of parsed.searchParams) {
      if (/(token|secret|signature|^sig$|password|passwd|credential|authorization|access[_-]?key|api[_-]?key|session|x-amz|x-goog|^ex$|^is$|^hm$)/i.test(key)) {
        return { url: null, error: "SENSITIVE_OR_SIGNED_URL_NOT_ALLOWED" };
      }
    }
    parsed.hash = "";
    return { url: parsed.toString(), error: null };
  } catch {
    return { url: null, error: "INVALID_URL" };
  }
}

function parseDataUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return { error: null as string | null, value: null as null | { mime: string; data: string; bytes: number } };
  if (value.length > MAX_DATA_URL_CHARS) return { error: "DATA_URL_TOO_LARGE", value: null };
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) return { error: "INVALID_DATA_URL", value: null };
  const mime = match[1].trim().toLowerCase();
  const data = match[2].replace(/[\r\n]/g, "");
  if (!ALLOWED_MIME.has(mime)) return { error: "UNSUPPORTED_MEDIA_TYPE", value: null };
  if (data.length % 4 !== 0) return { error: "INVALID_BASE64", value: null };
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, Math.floor(data.length * 3 / 4) - padding);
  if (bytes < 1) return { error: "EMPTY_MEDIA", value: null };
  if (bytes > MAX_ATTACHMENT_BYTES) return { error: "STORAGE_BLOCKED_SIZE_LIMIT", value: null };
  try { atob(data); } catch { return { error: "INVALID_BASE64", value: null }; }
  return { error: null, value: { mime, data, bytes } };
}

function normalizeIntake(input: IntakeInput, transport: "n8n" | "mcp") {
  const sourceText = clean(input.source, 20).toLowerCase();
  const source = (["wave", "discord", "n8n", "manus"].includes(sourceText) ? sourceText : transport) as IntakeSource;
  const kindText = clean(input.kind, 20).toLowerCase();
  if (!["url", "image", "file"].includes(kindText)) return { error: "INVALID_KIND" as const };
  const kind = kindText as IntakeKind;
  const title = clean(input.title, 160);
  const note = clean(input.note, 900);
  const reference = clean(input.attachment_ref, 256);
  if (reference && !/^att_[A-Za-z0-9_-]{8,180}$/.test(reference)) {
    return { error: "INVALID_ATTACHMENT_REFERENCE" as const };
  }
  const checkedUrl = safeUrl(input.url);
  if (checkedUrl.error) return { error: checkedUrl.error };
  const parsedData = parseDataUrl(input.data_url);
  if (parsedData.error) return { error: parsedData.error };
  if (parsedData.value && kind === "url") return { error: "KIND_MISMATCH_FOR_BINARY_MEDIA" as const };
  if (parsedData.value && reference) return { error: "USE_DATA_URL_OR_ATTACHMENT_REF_NOT_BOTH" as const };
  const url = checkedUrl.url;
  if (!url && !reference && !parsedData.value) return { error: "URL_ATTACHMENT_REFERENCE_OR_DATA_REQUIRED" as const };
  if (kind === "url" && !url) return { error: "URL_REQUIRED_FOR_URL_KIND" as const };
  if (kind === "image" && parsedData.value && !parsedData.value.mime.startsWith("image/")) return { error: "IMAGE_MIME_REQUIRED" as const };
  const mime = parsedData.value?.mime ?? clean(input.mime_type, 120).toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime)) return { error: "UNSUPPORTED_MEDIA_TYPE" as const };
  const eventId = clean(input.event_id, 180);
  if (eventId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(eventId)) return { error: "INVALID_EVENT_ID" as const };
  return {
    value: {
      source, kind,
      title: title || (kind === "image" ? "Incoming image" : kind === "file" ? "Incoming file" : "Incoming link"),
      note, url, attachment_ref: reference || null, mime_type: mime || null,
      event_id: eventId, data: parsedData.value,
    },
  };
}

async function cleanupExpired(env: BridgeBindings, now = Date.now()) {
  const db = env.DB;
  if (!db) return;
  const expired = await db.prepare(
    "SELECT detail_json FROM connector_events WHERE provider = ? AND event_type = ? AND created_at < ?",
  ).bind(PROVIDER, "INTAKE_ITEM", now - TTL_MS).all<{ detail_json: string | null }>().catch(() => ({ results: [] }));
  for (const row of expired.results ?? []) {
    const record = parseJson(row.detail_json);
    const attachmentId = clean(record?.attachment_ref, 256);
    if (record?.owned_attachment === true && /^att_[A-Za-z0-9_-]{8,180}$/.test(attachmentId)) {
      await db.prepare("DELETE FROM chat_attachments WHERE id = ? AND conversation_id = ?")
        .bind(attachmentId, "owner-main").run().catch(() => undefined);
    }
  }
  await db.prepare("DELETE FROM connector_events WHERE provider = ? AND created_at < ?")
    .bind(PROVIDER, now - TTL_MS).run().catch(() => undefined);
  await db.prepare("DELETE FROM connector_hook_dedup WHERE provider = ? AND created_at < ?")
    .bind(PROVIDER, now - DEDUP_TTL_MS).run().catch(() => undefined);
}

async function getItemEvent(env: BridgeBindings, itemId: string) {
  if (!env.DB) return null;
  return env.DB.prepare(
    "SELECT id, event_type, state, external_id, detail_json, created_at FROM connector_events WHERE provider = ? AND event_type = ? AND external_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(PROVIDER, "INTAKE_ITEM", itemId).first<StoredEvent>();
}

async function storeAttachment(env: BridgeBindings, data: { mime: string; data: string; bytes: number }, title: string, now: number) {
  if (!env.DB) throw new Error("D1_UNAVAILABLE");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).bind("owner-main", "owner", "OGENIC SAME MIND", now, now).run();
  const id = "att_" + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO chat_attachments(id, conversation_id, filename, mime_type, data_base64, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, "owner-main", title.slice(0, 180), data.mime, data.data, data.bytes, now).run();
  return id;
}

async function addIntakeItem(env: BridgeBindings, input: IntakeInput, transport: "n8n" | "mcp") {
  const normalized = normalizeIntake(input, transport);
  if ("error" in normalized) return { ok: false, code: normalized.error };
  const db = env.DB;
  if (!db) return { ok: false, code: "CONFIGURATION_REQUIRED", missing: "existing D1 DB binding" };
  const now = Date.now();
  await cleanupExpired(env, now);
  const value = normalized.value;
  if (value.attachment_ref) {
    const existingAttachment = await db.prepare(
      "SELECT id, mime_type, size_bytes FROM chat_attachments WHERE id = ? AND conversation_id = ?",
    ).bind(value.attachment_ref, "owner-main").first<{ id: string; mime_type: string; size_bytes: number }>();
    if (!existingAttachment) return { ok: false, code: "ATTACHMENT_NOT_FOUND_OR_EXPIRED" };
    value.mime_type = existingAttachment.mime_type;
  }
  const fingerprint = JSON.stringify({
    source: value.source, kind: value.kind, title: value.title, url: value.url,
    attachment_ref: value.attachment_ref, note: value.note, data_sha: value.data ? await sha256(value.data.data) : "",
  });
  const generatedId = await sha256(fingerprint);
  const eventKeyValue = value.event_id || (generatedId + ":" + Math.floor(now / TTL_MS));
  const eventKey = PROVIDER + ":" + value.source + ":" + eventKeyValue;
  const itemId = "ds_" + (await sha256(eventKey)).slice(0, 24);
  const oldKey = await db.prepare("SELECT event_key FROM connector_hook_dedup WHERE event_key = ?")
    .bind(eventKey).first<{ event_key: string }>();
  if (oldKey) {
    const previous = await getItemEvent(env, itemId);
    const oldRecord = parseJson(previous?.detail_json ?? null);
    return {
      ok: true, duplicate: true, item_id: itemId,
      state: previous?.state ?? "EXPIRED_OR_ALREADY_ACKNOWLEDGED",
      expires_at: oldRecord?.expires_at ?? null,
      storage_status: oldRecord?.storage_status ?? "EXPIRED_OR_ALREADY_ACKNOWLEDGED",
    };
  }

  const dedupInsert = await db.prepare(
    "INSERT OR IGNORE INTO connector_hook_dedup(event_key, provider, created_at) VALUES (?, ?, ?)",
  ).bind(eventKey, PROVIDER, now).run() as { meta?: { changes?: number } };
  if (dedupInsert.meta?.changes === 0) {
    const previous = await getItemEvent(env, itemId);
    const oldRecord = parseJson(previous?.detail_json ?? null);
    return { ok: true, duplicate: true, item_id: itemId, state: previous?.state ?? "DUPLICATE", expires_at: oldRecord?.expires_at ?? null };
  }

  let attachmentId = value.attachment_ref;
  let ownedAttachment = false;
  try {
    if (value.data) {
      attachmentId = await storeAttachment(env, value.data, value.title, now);
      ownedAttachment = true;
    }
    const record: IntakeRecord = {
      item_id: itemId,
      event_id: value.event_id || generatedId,
      source: value.source,
      kind: value.kind,
      title: value.title,
      note: value.note,
      url: value.url,
      attachment_ref: attachmentId,
      owned_attachment: ownedAttachment,
      mime_type: value.data?.mime ?? value.mime_type,
      size_bytes: value.data?.bytes ?? null,
      created_at: now,
      expires_at: now + TTL_MS,
      ttl_seconds: 300,
      storage_status: value.data
        ? (value.kind === "image" ? "IMAGE_BYTES_STORED_TEMPORARILY" : "FILE_BYTES_STORED_TEMPORARILY")
        : attachmentId ? "ATTACHMENT_REFERENCE_ONLY" : "URL_REFERENCE_ONLY",
      bytes_verified: Boolean(value.data),
    };
    await db.prepare(
      "INSERT INTO connector_events(id, provider, event_type, state, external_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      "evt_" + crypto.randomUUID(), PROVIDER, "INTAKE_ITEM", "RECEIVED", itemId, JSON.stringify(record), now,
    ).run();
    return {
      ok: true, duplicate: false, item_id: itemId, source: record.source, kind: record.kind,
      state: "RECEIVED", created_at: now, expires_at: record.expires_at, ttl_seconds: 300,
      storage_status: record.storage_status, bytes_verified: record.bytes_verified, size_bytes: record.size_bytes,
    };
  } catch {
    if (ownedAttachment && attachmentId) {
      await db.prepare("DELETE FROM chat_attachments WHERE id = ? AND conversation_id = ?")
        .bind(attachmentId, "owner-main").run().catch(() => undefined);
    }
    await db.prepare("DELETE FROM connector_hook_dedup WHERE event_key = ?").bind(eventKey).run().catch(() => undefined);
    return { ok: false, code: "INTAKE_PERSISTENCE_FAILED" };
  }
}

async function listIntake(env: BridgeBindings, limitInput: unknown) {
  if (!env.DB) return { ok: false, code: "CONFIGURATION_REQUIRED", missing: "existing D1 DB binding" };
  const now = Date.now();
  await cleanupExpired(env, now);
  const limit = Math.max(1, Math.min(50, Math.floor(Number(limitInput) || 20)));
  const response = await env.DB.prepare(
    "SELECT id, event_type, state, external_id, detail_json, created_at FROM connector_events WHERE provider = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 250",
  ).bind(PROVIDER, now - TTL_MS).all<StoredEvent>();
  const events = response.results ?? [];
  const currentState = new Map<string, string>();
  for (const row of events) {
    if (row.external_id && !currentState.has(row.external_id)) currentState.set(row.external_id, row.state);
  }
  const items: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const row of events) {
    if (row.event_type !== "INTAKE_ITEM" || !row.external_id || seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    const record = parseJson(row.detail_json);
    if (!record || Number(record.expires_at ?? 0) <= now) continue;
    const { owned_attachment: _owned, ...publicRecord } = record;
    items.push({ ...publicRecord, state: currentState.get(row.external_id) ?? row.state });
    if (items.length >= limit) break;
  }
  return { ok: true, count: items.length, ttl_seconds: 300, items };
}

async function readIntakeItem(env: BridgeBindings, itemIdInput: unknown) {
  if (!env.DB) return { result: { ok: false, code: "CONFIGURATION_REQUIRED", missing: "existing D1 DB binding" }, content: [] as Array<Record<string, unknown>>, isError: true };
  const itemId = clean(itemIdInput, 80);
  if (!/^ds_[a-f0-9]{24}$/.test(itemId)) return { result: { ok: false, code: "INVALID_ITEM_ID" }, content: [] as Array<Record<string, unknown>>, isError: true };
  const now = Date.now();
  await cleanupExpired(env, now);
  const event = await getItemEvent(env, itemId);
  const record = parseJson(event?.detail_json ?? null);
  if (!event || !record || Number(record.expires_at ?? 0) <= now) {
    return { result: { ok: false, code: "ITEM_NOT_FOUND_OR_EXPIRED" }, content: [] as Array<Record<string, unknown>>, isError: true };
  }
  const attachmentId = clean(record.attachment_ref, 256);
  if (attachmentId) {
    const row = await env.DB.prepare(
      "SELECT id, filename, mime_type, data_base64, size_bytes FROM chat_attachments WHERE id = ? AND conversation_id = ?",
    ).bind(attachmentId, "owner-main").first<{ id: string; filename: string; mime_type: string; data_base64: string; size_bytes: number }>();
    if (!row) {
      return { result: { ok: false, code: "ATTACHMENT_NOT_FOUND_OR_EXPIRED", item_id: itemId }, content: [] as Array<Record<string, unknown>>, isError: true };
    }
    const actualBytes = Math.max(0, Math.floor(row.data_base64.length * 3 / 4) - (row.data_base64.endsWith("==") ? 2 : row.data_base64.endsWith("=") ? 1 : 0));
    if (actualBytes !== Number(row.size_bytes) || !ALLOWED_MIME.has(row.mime_type)) {
      return { result: { ok: false, code: "ATTACHMENT_INTEGRITY_FAILED", item_id: itemId }, content: [] as Array<Record<string, unknown>>, isError: true };
    }
    const metadata = {
      ok: true, item_id: itemId, title: clean(record.title, 160), mime_type: row.mime_type,
      size_bytes: row.size_bytes, bytes_verified: true, storage_status: record.storage_status,
      expires_at: record.expires_at, ttl_seconds: 300,
    };
    const mediaBlock = row.mime_type.startsWith("image/")
      ? { type: "image", data: row.data_base64, mimeType: row.mime_type }
      : { type: "resource", resource: { uri: "wave://data-stone/" + itemId, mimeType: row.mime_type, blob: row.data_base64 } };
    return { result: metadata, content: [mediaBlock], isError: false };
  }
  return {
    result: {
      ok: false, item_id: itemId, code: "MEDIA_BYTES_NOT_STORED",
      storage_status: record.url ? "URL_REFERENCE_ONLY" : "ATTACHMENT_REFERENCE_ONLY",
      url: record.url ?? null, note: record.note ?? "", expires_at: record.expires_at,
    },
    content: [],
    isError: true,
  };
}

async function acknowledgeItem(env: BridgeBindings, args: Record<string, unknown>) {
  if (!env.DB) return { ok: false, code: "CONFIGURATION_REQUIRED", missing: "existing D1 DB binding" };
  const itemId = clean(args.item_id, 80);
  if (!/^ds_[a-f0-9]{24}$/.test(itemId)) return { ok: false, code: "INVALID_ITEM_ID" };
  const now = Date.now();
  await cleanupExpired(env, now);
  const item = await getItemEvent(env, itemId);
  const record = parseJson(item?.detail_json ?? null);
  if (!item || !record || Number(record.expires_at ?? 0) <= now) return { ok: false, code: "ITEM_NOT_FOUND_OR_EXPIRED" };
  const ackKey = PROVIDER + ":ack:" + itemId;
  const previousAck = await env.DB.prepare("SELECT event_key FROM connector_hook_dedup WHERE event_key = ?")
    .bind(ackKey).first<{ event_key: string }>();
  if (previousAck) return { ok: true, duplicate: true, item_id: itemId, state: "ACKNOWLEDGED", expires_at: record.expires_at };
  await env.DB.prepare("INSERT OR IGNORE INTO connector_hook_dedup(event_key, provider, created_at) VALUES (?, ?, ?)")
    .bind(ackKey, PROVIDER, now).run();
  await env.DB.prepare(
    "INSERT INTO connector_events(id, provider, event_type, state, external_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    "evt_" + crypto.randomUUID(), PROVIDER, "INTAKE_ACK", "ACKNOWLEDGED", itemId,
    JSON.stringify({ item_id: itemId, note: clean(args.note, 400), acknowledged_at: now, expires_at: record.expires_at }), now,
  ).run();
  return { ok: true, duplicate: false, item_id: itemId, state: "ACKNOWLEDGED", expires_at: record.expires_at };
}

const MCP_TOOLS = [
  {
    name: "wave_bridge_status",
    description: "Read-only status of the WAVE remote MCP bridge, n8n ingress configuration and temporary Data Stone. Never returns secret values or claims n8n is reachable just because a key exists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "wave_intake_add",
    description: "Add a secure HTTPS URL, an existing WAVE attachment reference, or base64 data URL to the temporary Data Stone inbox for ATHENA / White Diamond. Base64 media is persisted temporarily in existing chat_attachments and deleted after five minutes. URL-only items do not mean media bytes are readable.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "Stable source message/event id for safe retries." },
        source: { type: "string", enum: ["wave", "discord", "n8n", "manus"] },
        kind: { type: "string", enum: ["url", "image", "file"] },
        title: { type: "string", maxLength: 160 },
        note: { type: "string", maxLength: 900 },
        url: { type: "string", description: "Public HTTPS URL; credential-bearing or signed URLs are rejected." },
        attachment_ref: { type: "string", description: "Existing WAVE attachment ID att_...; it must still exist in owner-main." },
        mime_type: { type: "string", maxLength: 120 },
        data_url: { type: "string", description: "Optional data:<mime>;base64,... for media up to 4 MB. Never send secrets in this field." },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "wave_intake_list",
    description: "List only unexpired five-minute Data Stone items. Returns metadata/references but never embeds raw media bytes.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    name: "wave_intake_read",
    description: "Read a Data Stone item. If original media bytes were stored, returns the actual image/file payload through MCP content. If only a URL/reference exists, reports MEDIA_BYTES_NOT_STORED instead of pretending it read the media.",
    inputSchema: {
      type: "object",
      properties: { item_id: { type: "string", maxLength: 80 } },
      required: ["item_id"],
      additionalProperties: false,
    },
  },
  {
    name: "wave_intake_ack",
    description: "Acknowledge a temporary item after ATHENA has finished using it. The record/media still expires at its five-minute deadline.",
    inputSchema: {
      type: "object",
      properties: { item_id: { type: "string", maxLength: 80 }, note: { type: "string", maxLength: 400 } },
      required: ["item_id"],
      additionalProperties: false,
    },
  },
];

async function callTool(env: BridgeBindings, nameInput: unknown, argsInput: unknown) {
  const name = clean(nameInput, 100);
  const args = argsInput && typeof argsInput === "object" && !Array.isArray(argsInput)
    ? argsInput as Record<string, unknown> : {};
  if (name === "wave_bridge_status") {
    await cleanupExpired(env);
    const result = {
      ok: true,
      service: "WAVE_REMOTE_MCP",
      branch: clean(env.OGENIC_GITHUB_BRANCH, 100) || "branch binding unavailable",
      git_sha: clean(env.OGENIC_GIT_SHA, 80) || "sha binding unavailable",
      mcp_token_configured: Boolean(clean(env.WAVE_MANUS_MCP_TOKEN, 4000)),
      n8n_hook_token_configured: Boolean(clean(env.WAVE_N8N_HOOK_TOKEN, 4000)),
      n8n_api_configured: Boolean(clean(env.N8N_BASE_URL, 500) && clean(env.N8N_API_KEY, 4000)),
      d1_available: Boolean(env.DB),
      data_stone_ttl_seconds: 300,
      media_storage: "existing D1 chat_attachments only; up to 4 MB; no new database or migration",
      live_n8n_reachability: "NOT_VERIFIED_BY_THIS_TOOL",
    };
    return toolResult(result);
  }
  if (name === "wave_intake_add") {
    const result = await addIntakeItem(env, args as IntakeInput, "mcp");
    return toolResult(result, !result.ok);
  }
  if (name === "wave_intake_list") {
    const result = await listIntake(env, args.limit);
    return toolResult(result, !result.ok);
  }
  if (name === "wave_intake_read") {
    const result = await readIntakeItem(env, args.item_id);
    return toolResult(result.result, result.isError, result.content);
  }
  if (name === "wave_intake_ack") {
    const result = await acknowledgeItem(env, args);
    return toolResult(result, !result.ok);
  }
  return toolResult({ ok: false, code: "UNKNOWN_TOOL", name }, true);
}

async function parseRequest(request: Request) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return { error: "REQUEST_TOO_LARGE" as const };
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as JsonRpcRequest };
  } catch {
    return { error: "INVALID_JSON" as const };
  }
}

async function handleMcp(request: Request, env: BridgeBindings) {
  if (request.method === "GET") {
    return new Response("MCP GET/SSE is not enabled; use Streamable HTTP POST.", { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  const expected = clean(env.WAVE_MANUS_MCP_TOKEN, 4000);
  if (!expected) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "WAVE_MANUS_MCP_TOKEN" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!safeEqual(bearer(request), expected)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" } });

  const parsed = await parseRequest(request);
  if ("error" in parsed) return Response.json({ ok: false, code: parsed.error }, { status: parsed.error === "INVALID_JSON" ? 400 : 413 });
  const message = parsed.value;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return jsonRpcError(message.id, -32600, "Invalid JSON-RPC request", 400);
  const requestedProtocol = clean(message.params?.protocolVersion, 40);
  const protocolVersion = MCP_PROTOCOLS.includes(requestedProtocol) ? requestedProtocol : MCP_PROTOCOLS[0];

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    if (message.id !== undefined) return jsonRpcError(message.id, -32600, "Notification must not contain an id");
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  if (message.method === "initialize") {
    return jsonRpc(message.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ogenic-wave-remote-mcp", version: "0.1.0" },
      instructions: "WAVE is the authenticated tool gateway for ATHENA / White Diamond. Use wave_intake_add for temporary links/images, wave_intake_read to confirm actual media bytes, and wave_intake_ack after processing. Temporary Data Stone records and owned media expire after five minutes. Yellow Stone remains the only side-effect authority.",
    }, protocolVersion);
  }
  if (message.method === "ping") return jsonRpc(message.id, {}, protocolVersion);
  if (message.method === "tools/list") return jsonRpc(message.id, { tools: MCP_TOOLS }, protocolVersion);
  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const result = await callTool(env, params.name, params.arguments);
    return jsonRpc(message.id, result, protocolVersion);
  }
  if (message.method === "resources/list") return jsonRpc(message.id, { resources: [] }, protocolVersion);
  if (message.method === "prompts/list") return jsonRpc(message.id, { prompts: [] }, protocolVersion);
  if (message.id === undefined) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  return jsonRpcError(message.id, -32601, "Method not found");
}

async function handleN8n(request: Request, env: BridgeBindings) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  const expected = clean(env.WAVE_N8N_HOOK_TOKEN, 4000);
  if (!expected) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "WAVE_N8N_HOOK_TOKEN" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!safeEqual(bearer(request), expected)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" } });
  const parsed = await parseRequest(request);
  if ("error" in parsed) return Response.json({ ok: false, code: parsed.error }, { status: parsed.error === "INVALID_JSON" ? 400 : 413 });
  const body = parsed.value as Record<string, unknown>;
  const item = body.item && typeof body.item === "object" && !Array.isArray(body.item)
    ? body.item as IntakeInput : body as IntakeInput;
  const idempotencyKey = clean(request.headers.get("idempotency-key"), 180);
  if (idempotencyKey && !item.event_id) item.event_id = idempotencyKey;
  const result = await addIntakeItem(env, item, "n8n");
  const resultCode = "code" in result ? String(result.code) : "";
  return Response.json(result, { status: result.ok ? 202 : resultCode === "CONFIGURATION_REQUIRED" ? 503 : 400, headers: { "Cache-Control": "no-store" } });
}

export function createWaveManusMcpApi() {
  return {
    async fetch(request: Request, env: BridgeBindings, _ctx?: unknown): Promise<Response> {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/mcp" || pathname === "/mcp/") return handleMcp(request, env);
      if (pathname === "/hooks/n8n/data-stone") return handleN8n(request, env);
      if (pathname === "/api/wave-bridge/status") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
        if (!(await hasOwnerOrOpsAccess(request, env as never))) {
          return Response.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, { status: 401, headers: { "Cache-Control": "no-store" } });
        }
        await cleanupExpired(env);
        return Response.json({
          ok: true,
          service: "WAVE_REMOTE_MCP",
          mcp_endpoint: "/mcp",
          n8n_ingress_endpoint: "/hooks/n8n/data-stone",
          mcp_token_configured: Boolean(clean(env.WAVE_MANUS_MCP_TOKEN, 4000)),
          n8n_hook_token_configured: Boolean(clean(env.WAVE_N8N_HOOK_TOKEN, 4000)),
          n8n_api_configured: Boolean(clean(env.N8N_BASE_URL, 500) && clean(env.N8N_API_KEY, 4000)),
          d1_available: Boolean(env.DB),
          data_stone_ttl_seconds: 300,
          media_storage: "reference-only unless n8n sends allowed data_url <= 4 MB",
          production_or_main_changes: false,
        }, { headers: { "Cache-Control": "no-store" } });
      }
      return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
    },
  };
}
