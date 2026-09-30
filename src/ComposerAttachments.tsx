import { useEffect, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { ComposerDraftStore, deviceDraftPersistence, type DraftAttachment, type UploadedAttachment } from "./composer-draft";

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}
async function uploadAttachment(row: DraftAttachment, progress: (value: number | null) => void, signal: AbortSignal): Promise<UploadedAttachment> {
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
  useEffect(() => { if (authenticated) void store.restore(); }, [store, authenticated]);
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
