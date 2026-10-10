// Unsent device-local draft only. Sent messages/attachments remain canonical in D1.
export type UploadedAttachment = { id: string; filename: string; mime_type: string; size_bytes: number; storage?: "D1_BASE64" | "R2"; status?: string; handoff_state?: string; reference?: string };
export type MultipartUploadSession = { handle: string; part_size_bytes: number; parts: Array<{ part_number: number; etag: string }>; created_at: number };
export type DraftAttachment = {
  localId: string; filename: string; mime_type: string; size_bytes: number; blob: Blob;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number | null; error?: string; uploaded?: UploadedAttachment; uploadedAt?: number;
  uploadSession?: MultipartUploadSession;
};
export type ComposerDraft = { text: string; attachments: DraftAttachment[]; ready: boolean; persistenceError: string };
type SavedDraft = Pick<ComposerDraft, "text" | "attachments">;
export type DraftPersistence = { load(): Promise<SavedDraft | undefined>; save(draft: SavedDraft): Promise<void>; saveText?(text: string): void };
export type AttachmentUpload = (attachment: DraftAttachment, progress: (value: number | null) => void, signal: AbortSignal, saveUploadSession: (session: MultipartUploadSession | undefined) => void) => Promise<UploadedAttachment>;

export class ComposerDraftStore {
  private state: ComposerDraft = { text: "", attachments: [], ready: false, persistenceError: "" };
  private listeners = new Set<() => void>();
  private controllers = new Map<string, AbortController>();
  private saveQueue: Promise<void> = Promise.resolve();
  private restorePromise?: Promise<void>;
  constructor(private persistence: DraftPersistence, private transport: AttachmentUpload) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(state: ComposerDraft) { this.state = state; for (const listener of this.listeners) listener(); }
  private persist() {
    const saved = { text: this.state.text, attachments: this.state.attachments };
    try { this.persistence.saveText?.(saved.text); } catch { /* IndexedDB remains the durable path. */ }
    this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.persistence.save(saved));
    this.saveQueue.catch(() => this.emit({ ...this.state, persistenceError: "บันทึก draft ในเครื่องไม่สำเร็จ · อย่าเพิ่งปิดหน้านี้" }));
    return this.saveQueue;
  }
  restore() {
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = this.persistence.load().then(saved => {
      const attachments = (saved?.attachments ?? []).map(row => {
        if (row.status !== "uploaded" || !row.uploaded || Date.now() - (row.uploadedAt ?? 0) >= 23 * 60 * 60 * 1000) {
          return { ...row, status: "failed" as const, progress: null, uploaded: undefined, error: "Upload interrupted or expired · retry" };
        }
        return row;
      });
      this.emit({ text: saved?.text ?? "", attachments, ready: true, persistenceError: "" });
    }).catch(() => this.emit({ ...this.state, ready: true, persistenceError: "อ่าน draft ในเครื่องไม่สำเร็จ · การเก็บข้ามหน้ายังไม่พร้อม" }));
    return this.restorePromise;
  }
  setText(text: string) { this.emit({ ...this.state, text }); void this.persist().catch(() => undefined); }
  async add(file: File) {
    if (!this.state.ready) throw new Error("กำลังอ่าน draft · รอสักครู่");
    if (file.size > 1_073_741_824) throw new Error("ไฟล์เกิน 1 GiB · จำกัดขนาดไฟล์ต่อรายการ");
    if (this.state.attachments.length >= 4) throw new Error("แนบได้ 4 ไฟล์ · เอาไฟล์ออกก่อนเพิ่มใหม่");
    const row: DraftAttachment = { localId: crypto.randomUUID(), filename: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size, blob: file, status: "queued", progress: null };
    this.emit({ ...this.state, attachments: [...this.state.attachments, row] });
    // Commit the Blob before network work; navigation cannot strand a selected File.
    await this.persist().catch(() => undefined);
    await this.retry(row.localId);
  }
  private update(localId: string, patch: Partial<DraftAttachment>, persist = true) {
    if (!this.state.attachments.some(row => row.localId === localId)) return;
    this.emit({ ...this.state, attachments: this.state.attachments.map(row => row.localId === localId ? { ...row, ...patch } : row) });
    if (persist) void this.persist().catch(() => undefined);
  }
  async retry(localId: string) {
    const row = this.state.attachments.find(row => row.localId === localId);
    if (!row || this.controllers.has(localId)) return;
    const controller = new AbortController(); this.controllers.set(localId, controller);
    this.update(localId, { status: "uploading", progress: null, error: undefined, uploaded: undefined });
    try {
      const uploaded = await this.transport(
        row,
        value => this.update(localId, { progress: value }, false),
        controller.signal,
        session => this.update(localId, { uploadSession: session }),
      );
      if (!uploaded?.id || !uploaded.filename || !uploaded.mime_type || !Number.isFinite(uploaded.size_bytes)) throw new Error("INVALID_UPLOAD_RESPONSE");
      this.update(localId, { status: "uploaded", uploaded, uploadedAt: Date.now(), progress: 100, error: undefined, uploadSession: undefined });
    } catch (error) {
      this.update(localId, { status: "failed", progress: null, error: error instanceof Error ? error.message : "Upload failed · retry" });
    } finally { this.controllers.delete(localId); }
  }
  remove(localId: string) {
    this.controllers.get(localId)?.abort(); this.controllers.delete(localId);
    this.emit({ ...this.state, attachments: this.state.attachments.filter(row => row.localId !== localId) });
    void this.persist().catch(() => undefined);
  }
  unavailable(serverId?: string) {
    for (const row of this.state.attachments) {
      if (!serverId || row.uploaded?.id === serverId) this.update(row.localId, { status: "failed", uploaded: undefined, progress: null, error: "Attachment expired or unavailable · retry upload" });
    }
  }
  // Consume only the successful request snapshot. New work typed during a send survives.
  consume(text: string, localIds: string[]) {
    const consumed = new Set(localIds);
    this.emit({ ...this.state, text: this.state.text === text ? "" : this.state.text, attachments: this.state.attachments.filter(row => !consumed.has(row.localId)) });
    void this.persist().catch(() => undefined);
  }
  flush() { return this.saveQueue; }
}

export function deviceDraftPersistence(scope: string): DraftPersistence {
  const textKey = `wave.composer.text.${scope}`;
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wave-unsent-drafts", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("drafts"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("DRAFT_STORAGE_BLOCKED"));
  });
  return {
    saveText(text) { localStorage.setItem(textKey, text); },
    async load() {
      const db = await open();
      try {
        const saved = await new Promise<SavedDraft | undefined>((resolve, reject) => {
          const request = db.transaction("drafts", "readonly").objectStore("drafts").get(scope);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        let text = saved?.text ?? "";
        try { text = localStorage.getItem(textKey) ?? text; } catch { /* use saved text */ }
        return { text, attachments: saved?.attachments ?? [] };
      } finally { db.close(); }
    },
    async save(draft) {
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").put(draft, scope);
          tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    },
  };
}
