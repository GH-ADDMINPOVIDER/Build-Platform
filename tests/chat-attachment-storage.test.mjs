import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../worker/chat-attachment-storage.ts", import.meta.url), "utf8")
  .replace(
    'import { publicCcsStatus } from "./capability-card-stone";',
    'const publicCcsStatus = () => ({ protocol: "CCS/1.0", stone_code: "YS-01", fail_closed: true, direct_execution_bypass: false, verbs: [] });',
  );
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const storage = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

function bytesFrom(value) {
  if (typeof value === "string") return Promise.resolve(new TextEncoder().encode(value));
  if (value instanceof Blob) return value.arrayBuffer().then(buffer => new Uint8Array(buffer));
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return Promise.resolve(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  throw new Error("unsupported fake R2 value");
}

class FakeR2Bucket {
  constructor() { this.objects = new Map(); this.uploads = new Map(); this.nextUpload = 0; }
  async put(key, value) { this.objects.set(key, typeof value === "string" ? value : await bytesFrom(value)); }
  async get(key, options) {
    const stored = this.objects.get(key);
    if (stored === undefined) return null;
    let bytes = typeof stored === "string" ? new TextEncoder().encode(stored) : stored;
    if (options?.range) bytes = bytes.slice(options.range.offset, options.range.offset + options.range.length);
    const snapshot = bytes.slice();
    return {
      key, size: snapshot.byteLength, httpEtag: `etag-${snapshot.byteLength}`,
      body: new ReadableStream({ start(controller) { controller.enqueue(snapshot); controller.close(); } }),
      async text() { return new TextDecoder().decode(snapshot); },
      async arrayBuffer() { return snapshot.slice().buffer; },
    };
  }
  async delete(key) { this.objects.delete(key); }
  async list({ prefix = "", limit = 100 } = {}) {
    const objects = [...this.objects.keys()].filter(key => key.startsWith(prefix)).slice(0, limit).map(key => ({ key }));
    return { objects, truncated: false };
  }
  async createMultipartUpload(key) {
    const uploadId = `upload-${++this.nextUpload}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    return this.handle(key, uploadId);
  }
  resumeMultipartUpload(key, uploadId) {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error("FAKE_MULTIPART_NOT_FOUND");
    return this.handle(key, uploadId);
  }
  handle(key, uploadId) {
    const bucket = this;
    return {
      key, uploadId,
      async uploadPart(partNumber, value) {
        const upload = bucket.uploads.get(uploadId);
        if (!upload) throw new Error("FAKE_MULTIPART_NOT_FOUND");
        const bytes = await bytesFrom(value);
        upload.parts.set(partNumber, bytes);
        return { partNumber, etag: `part-${partNumber}-${bytes.byteLength}` };
      },
      async complete(parts) {
        const upload = bucket.uploads.get(uploadId);
        if (!upload) throw new Error("FAKE_MULTIPART_NOT_FOUND");
        const chunks = parts.map(part => {
          const bytes = upload.parts.get(part.partNumber);
          if (!bytes || part.etag !== `part-${part.partNumber}-${bytes.byteLength}`) throw new Error("FAKE_PART_MISMATCH");
          return bytes;
        });
        const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
        bucket.objects.set(key, merged);
        bucket.uploads.delete(uploadId);
        return { key, size, httpEtag: `object-${size}` };
      },
      async abort() { bucket.uploads.delete(uploadId); },
    };
  }
}

function envWithBucket(bucket = new FakeR2Bucket()) {
  return { env: { CHAT_UPLOADS: bucket }, bucket };
}

test("storage readiness fails closed until R2 and the model credential are bound", () => {
  const status = storage.chatAttachmentStorageStatus({});
  assert.equal(status.gate_state, "CONFIGURATION_REQUIRED");
  assert.equal(status.storage.code, "R2_BUCKET_NOT_BOUND");
  assert.equal(status.direct_execution_bypass, false);
  assert.equal(status.ccs_gate.fail_closed, true);
  assert.equal(status.ccs_gate.state, "READY");
});

test("file references are explicitly versioned and reject malformed handles", () => {
  const handle = "8d9ec3f0-2b48-4bb7-8ec0-bf3e3f2df313";
  const reference = storage.r2AttachmentReference(handle);
  assert.equal(reference, `R2REF1:${handle}`);
  assert.equal(storage.isR2AttachmentReference(reference), true);
  assert.equal(storage.parseR2AttachmentReference(reference), handle);
  assert.equal(storage.parseR2AttachmentReference("old-base64-value"), null);
  assert.equal(storage.parseR2AttachmentReference("R2REF1:not-a-uuid"), null);
});

test("multipart upload is idempotent and metadata conflicts are rejected", async () => {
  const { env } = envWithBucket();
  const input = { filename: "report.pdf", mime_type: "application/pdf", size_bytes: 6_000_000, idempotency_key: "draft-abc" };
  const first = await storage.beginR2AttachmentUpload(env, input);
  const replay = await storage.beginR2AttachmentUpload(env, input);
  assert.equal(replay.handle, first.handle);
  assert.equal(replay.r2_upload_id, first.r2_upload_id);
  await assert.rejects(
    storage.beginR2AttachmentUpload(env, { ...input, filename: "other.pdf" }),
    /IDEMPOTENCY_KEY_CONFLICT/,
  );
});

test("multipart completion verifies the full size and the R2 object can be read", async () => {
  const { env, bucket } = envWithBucket();
  const size = 6_000_000;
  const input = { filename: "report.pdf", mime_type: "application/pdf", size_bytes: size, idempotency_key: "draft-large" };
  const manifest = await storage.beginR2AttachmentUpload(env, input);
  const payload = new Uint8Array(size);
  for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
  const part = await storage.uploadR2AttachmentPart(env, manifest, 1, payload.buffer);
  assert.equal(part.partNumber, 1);
  await assert.rejects(
    storage.completeR2AttachmentUpload(env, manifest, [{ partNumber: 2, etag: "wrong" }]),
    /UPLOAD_PART_LIST_INVALID/,
  );
  const completed = await storage.completeR2AttachmentUpload(env, manifest, [part]);
  assert.equal(completed.status, "UPLOADED");
  assert.equal(completed.object_etag, `object-${size}`);
  const reference = storage.r2AttachmentReference(completed.handle);
  const read = await storage.readR2AttachmentObject(env, reference);
  assert.equal(read.manifest.size_bytes, size);
  const downloaded = new Uint8Array(await read.object.arrayBuffer());
  assert.equal(downloaded.byteLength, size);
  assert.equal(downloaded[0], payload[0]);
  assert.equal(downloaded[5_000_000], payload[5_000_000]);
  assert.equal(downloaded[size - 1], payload[size - 1]);
});

test("direct model handoff blocks oversized inputs without deleting stored originals", () => {
  assert.equal(storage.r2ModelInputBlocker({ mime_type: "application/pdf", size_bytes: 40 * 1024 * 1024 }), null);
  assert.equal(storage.r2ModelInputBlocker({ mime_type: "application/pdf", size_bytes: 49 * 1024 * 1024 }), "MODEL_INPUT_TOO_LARGE");
  assert.equal(storage.r2ModelInputBlocker({ mime_type: "image/png", size_bytes: 21 * 1024 * 1024 }), "MODEL_INPUT_TOO_LARGE");
});
