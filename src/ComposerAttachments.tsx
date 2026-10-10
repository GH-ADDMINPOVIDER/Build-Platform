import { useEffect, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { ComposerDraftStore, deviceDraftPersistence, type DraftAttachment, type UploadedAttachment, type MultipartUploadSession } from "./composer-draft";

const WAVE_NEXT_HANDOFF_DRAFT_KEY = "ogenic.wave-next.handoff.v1";

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}
class UploadTransportError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || body.ok === false) {
    const code = String(body.code || `HTTP_${response.status}`);
    throw new UploadTransportError(code, code, response.status);
  }
  return body;
}

async function uploadLargeAttachment(
  row: DraftAttachment,
  progress: (value: number | null) => void,
  signal: AbortSignal,
  saveUploadSession: (session: MultipartUploadSession | undefined) => void,
): Promise<UploadedAttachment> {
  let session = row.uploadSession ? { ...row.uploadSession, parts: [...row.uploadSession.parts] } : undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (signal.aborted) throw new Error("Upload cancelled");
      if (!session) {
        const response = await fetch("/api/chat/attachments/multipart", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "Idempotency-Key": row.localId },
          body: JSON.stringify({ filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes }),
          signal,
        });
        const body = await responseJson(response);
        if (body.attachment?.id) return body.attachment as UploadedAttachment;
        const upload = body.upload as { handle?: string; part_size_bytes?: number };
        if (!upload?.handle || !Number.isSafeInteger(upload.part_size_bytes) || Number(upload.part_size_bytes) < 5 * 1024 * 1024) {
          throw new UploadTransportError("INVALID_MULTIPART_SESSION", "INVALID_MULTIPART_SESSION", 502);
        }
        session = { handle: upload.handle, part_size_bytes: Number(upload.part_size_bytes), parts: [], created_at: Date.now() };
        saveUploadSession(session);
      }

      const totalParts = Math.ceil(row.size_bytes / session.part_size_bytes);
      const uploadedParts = new Map(session.parts.map(part => [part.part_number, part.etag]));
      const abortRemote = () => {
        void fetch(`/api/chat/attachments/multipart/${encodeURIComponent(session!.handle)}`, {
          method: "DELETE", credentials: "same-origin", cache: "no-store",
        }).catch(() => undefined);
      };
      signal.addEventListener("abort", abortRemote, { once: true });
      try {
        for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
          if (signal.aborted) throw new Error("Upload cancelled");
          if (!uploadedParts.has(partNumber)) {
            const start = (partNumber - 1) * session.part_size_bytes;
            const end = Math.min(row.size_bytes, start + session.part_size_bytes);
            const chunk = row.blob.slice(start, end);
            const response = await fetch(
              `/api/chat/attachments/multipart/${encodeURIComponent(session.handle)}/parts/${partNumber}`,
              {
                method: "PUT",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Content-Type": "application/octet-stream" },
                body: chunk,
                signal,
              },
            );
            const body = await responseJson(response);
            const etag = String(body.part?.etag || "");
            if (!etag || Number(body.part?.part_number) !== partNumber) {
              throw new UploadTransportError("UPLOAD_PART_RECEIPT_INVALID", "UPLOAD_PART_RECEIPT_INVALID", 502);
            }
            uploadedParts.set(partNumber, etag);
            session.parts = [...uploadedParts.entries()].map(([part_number, value]) => ({ part_number, etag: value })).sort((a, b) => a.part_number - b.part_number);
            saveUploadSession(session);
          }
          let transferred = 0;
          for (const donePart of uploadedParts.keys()) {
            const offset = (donePart - 1) * session.part_size_bytes;
            transferred += Math.min(session.part_size_bytes, row.size_bytes - offset);
          }
          progress(Math.min(99, Math.floor(transferred / row.size_bytes * 100)));
        }
      } finally {
        signal.removeEventListener("abort", abortRemote);
      }

      if (signal.aborted) throw new Error("Upload cancelled");
      progress(99);
      const completeResponse = await fetch(
        `/api/chat/attachments/multipart/${encodeURIComponent(session.handle)}/complete`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "Idempotency-Key": `${row.localId}:complete` },
          body: JSON.stringify({ parts: session.parts }),
          signal,
        },
      );
      const completeBody = await responseJson(completeResponse);
      if (!completeBody.attachment?.id) throw new UploadTransportError("UPLOAD_COMPLETION_UNVERIFIED", "UPLOAD_COMPLETION_UNVERIFIED", 502);
      return completeBody.attachment as UploadedAttachment;
    } catch (cause) {
      const error = cause instanceof UploadTransportError
        ? cause
        : new UploadTransportError(cause instanceof Error ? cause.message : "Upload failed · retry", "NETWORK_OR_UPLOAD_FAILURE", 0);
      const expiredSession = ["UPLOAD_SESSION_NOT_FOUND", "UPLOAD_SESSION_EXPIRED", "UPLOAD_SESSION_NOT_OPEN"].includes(error.code);
      if (attempt === 0 && session && expiredSession && !signal.aborted) {
        void fetch(`/api/chat/attachments/multipart/${encodeURIComponent(session.handle)}`, {
          method: "DELETE", credentials: "same-origin", cache: "no-store",
        }).catch(() => undefined);
        session = undefined;
        saveUploadSession(undefined);
        continue;
      }
      throw new Error(error.code === "CONFIGURATION_REQUIRED:R2_BUCKET"
        ? "Large-file storage is not configured yet (R2 bucket required)"
        : error.message);
    }
  }
  throw new Error("UPLOAD_RETRY_EXHAUSTED");
}

async function uploadAttachment(
  row: DraftAttachment,
  progress: (value: number | null) => void,
  signal: AbortSignal,
  saveUploadSession: (session: MultipartUploadSession | undefined) => void,
): Promise<UploadedAttachment> {
  if (row.size_bytes > 4_000_000) return uploadLargeAttachment(row, progress, signal, saveUploadSession);
  const payload = JSON.stringify({ filename: row.filename, mime_type: row.mime_type, data_url: await dataUrl(row.blob) });
  if (signal.aborted) throw new Error("Upload cancelled");
  // Preserve the existing native fetch/session bridge. Web/PWA uses real XHR byte progress.
  if (Capacitor.isNativePlatform()) {
    progress(null);
    const response = await fetch("/api/chat/attachments", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: payload, signal });
    const body = await response.json();
    if (!response.ok || !body.attachment) throw new Error(body.message || body.code || `HTTP_${response.status}`);
    return body.attachment;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("POST", "/api/chat/attachments"); xhr.withCredentials = true; xhr.timeout = 120_000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = event => progress(event.lengthComputable ? Math.floor(event.loaded / event.total * 100) : null);
    xhr.onload = () => {
      finish();
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || !body.attachment) throw new Error(body.message || body.code || `HTTP_${xhr.status}`);
        resolve(body.attachment);
      } catch (error) { reject(error); }
    };
    xhr.onerror = () => { finish(); reject(new Error("Network error · retry upload")); };
    xhr.ontimeout = () => { finish(); reject(new Error("Upload timed out · retry")); };
    xhr.onabort = () => { finish(); reject(new Error("Upload interrupted · retry")); };
    xhr.send(payload);
  });
}
let ownerDraft: ComposerDraftStore | undefined;
export function useComposerDraft(authenticated: boolean) {
  const [store] = useState(() => ownerDraft ??= new ComposerDraftStore(deviceDraftPersistence("owner-main"), uploadAttachment));
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (!authenticated) return;
    void store.restore().then(() => {
      try {
        const handoff = sessionStorage.getItem(WAVE_NEXT_HANDOFF_DRAFT_KEY)?.trim();
        if (!handoff) return;
        store.setText(handoff);
        sessionStorage.removeItem(WAVE_NEXT_HANDOFF_DRAFT_KEY);
      } catch { /* noop */ }
    });
  }, [store, authenticated]);
  return { store, ...draft };
}
function AttachmentCard({ row, store, disabled }: { row: DraftAttachment; store: ComposerDraftStore; disabled: boolean }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!row.mime_type.startsWith("image/")) return;
    const url = URL.createObjectURL(row.blob); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [row.blob, row.mime_type]);
  const status = row.status === "queued" ? "Saving locally…" : row.status === "uploading" ? (row.progress === 100 ? "Processing…" : row.progress === null ? "Uploading…" : `Uploading ${row.progress}%`) : row.status === "uploaded" ? "Uploaded" : "Failed";
  return <article className={`ucAttachmentCard ${row.status}`} aria-label={`Attachment ${row.filename}`}>
    {preview ? <img src={preview} alt={`Preview of ${row.filename}`} /> : <span className="ucAttachmentIcon" aria-hidden="true">▧</span>}
    <div className="ucAttachmentInfo"><b title={row.filename}>{row.filename}</b><small role="status">{status}</small>{row.status === "uploading" && <progress aria-label={`Upload progress ${row.filename}`} max={100} value={row.progress ?? undefined} />}{row.error && <small className="ucAttachmentError">{row.error}</small>}</div>
    {row.status === "failed" && <button type="button" disabled={disabled} onClick={() => void store.retry(row.localId)} aria-label={`Retry upload ${row.filename}`}>Retry</button>}
    <button type="button" disabled={disabled} onClick={() => store.remove(row.localId)} aria-label={`Remove attachment ${row.filename}`}>×</button>
  </article>;
}
export default function ComposerAttachments({ rows, store, disabled }: { rows: DraftAttachment[]; store: ComposerDraftStore; disabled: boolean }) {
  if (!rows.length) return null;
  return <div className="ucAttachmentList" aria-label="Attachments">{rows.map(row => <AttachmentCard key={row.localId} row={row} store={store} disabled={disabled} />)}</div>;
}
