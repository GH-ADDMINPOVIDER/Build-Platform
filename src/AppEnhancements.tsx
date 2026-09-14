import { useEffect, useRef } from "react";

type PendingAttachment = { id: string; filename: string; mime_type: string; size_bytes: number };
type HistoryResponse = { ok?: boolean; messages?: Array<{ id: string }> };

const MAX_FILE_BYTES = 4_000_000;
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json",
]);

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export default function AppEnhancements() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<PendingAttachment[]>([]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let uploading = false;

    const composer = () => document.querySelector<HTMLElement>(".composer");

    const renderPending = () => {
      const root = composer();
      if (!root) return;
      root.classList.add("enhancedComposer");
      let tray = root.querySelector<HTMLElement>(".pendingAttachments");
      if (!tray) {
        tray = document.createElement("div");
        tray.className = "pendingAttachments";
        root.prepend(tray);
      }
      tray.replaceChildren();
      for (const item of pendingRef.current) {
        const chip = document.createElement("span");
        chip.className = "attachmentChip";
        chip.title = `${item.filename} · ${Math.ceil(item.size_bytes / 1024)} KB`;
        const label = document.createElement("span");
        label.textContent = item.mime_type.startsWith("image/") ? `🖼 ${item.filename}` : `📎 ${item.filename}`;
        chip.append(label);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${item.filename}`);
        remove.onclick = () => {
          pendingRef.current = pendingRef.current.filter((candidate) => candidate.id !== item.id);
          renderPending();
        };
        chip.append(remove);
        tray.append(chip);
      }
      tray.hidden = pendingRef.current.length === 0;
    };

    const setStatus = (message: string, isError = false) => {
      const root = composer();
      if (!root) return;
      let status = root.querySelector<HTMLElement>(".attachmentStatus");
      if (!status) {
        status = document.createElement("div");
        status.className = "attachmentStatus";
        root.append(status);
      }
      status.textContent = message;
      status.dataset.tone = isError ? "error" : "normal";
      status.hidden = !message;
    };

    const uploadFiles = async (files: File[]) => {
      if (uploading || files.length === 0) return;
      uploading = true;
      const attachButton = document.querySelector<HTMLButtonElement>(".attachmentButton");
      if (attachButton) { attachButton.disabled = true; attachButton.textContent = "…"; }
      try {
        const slots = Math.max(0, 4 - pendingRef.current.length);
        for (const file of files.slice(0, slots)) {
          const mime = file.type || "text/plain";
          if (!ALLOWED_TYPES.has(mime)) { setStatus(`ยังไม่รองรับ ${file.name}`, true); continue; }
          if (file.size > MAX_FILE_BYTES) { setStatus(`${file.name} เกิน 4 MB`, true); continue; }
          const response = await originalFetch("/api/chat/attachments", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, mime_type: mime, data_url: await fileToDataUrl(file) }),
          });
          const body = await response.json().catch(() => ({})) as { attachment?: PendingAttachment; code?: string; message?: string };
          if (!response.ok || !body.attachment) throw new Error(body.message || body.code || `UPLOAD_HTTP_${response.status}`);
          pendingRef.current.push(body.attachment);
          renderPending();
          setStatus("ไฟล์พร้อมส่งกับข้อความถัดไป");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Upload failed", true);
      } finally {
        uploading = false;
        if (attachButton) { attachButton.disabled = false; attachButton.textContent = "+"; }
        if (inputRef.current) inputRef.current.value = "";
      }
    };

    const wireComposer = () => {
      const root = composer();
      if (!root) return;
      root.classList.add("enhancedComposer");
      if (!root.querySelector(".attachmentButton")) {
        const attach = document.createElement("button");
        attach.type = "button";
        attach.className = "attachmentButton";
        attach.textContent = "+";
        attach.title = "แนบรูปหรือไฟล์";
        attach.setAttribute("aria-label", "แนบรูปหรือไฟล์");
        attach.onclick = () => inputRef.current?.click();
        root.insertBefore(attach, root.querySelector("textarea") ?? root.firstChild);
      }
      renderPending();
    };

    const wireSameMind = () => {
      const head = document.querySelector<HTMLElement>(".chatPanelHead");
      if (!head || head.querySelector(".sameMindBadge")) return;
      const badge = document.createElement("span");
      badge.className = "sameMindBadge";
      badge.textContent = "SAME MIND · syncing";
      badge.title = "OGENIC D1 memory only; ChatGPT App conversations are not imported automatically.";
      head.append(badge);
      void originalFetch("/api/chat/history", { cache: "no-store", credentials: "same-origin" })
        .then(async (response) => response.ok ? await response.json() as HistoryResponse : null)
        .then((body) => { badge.textContent = body?.ok ? `SAME MIND · ${body.messages?.length ?? 0} saved` : "SAME MIND · local"; })
        .catch(() => { badge.textContent = "SAME MIND · local"; });
    };

    const wire = () => { wireComposer(); wireSameMind(); };
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { subtree: true, childList: true });
    wire();

    const onFiles = (event: Event) => {
      const files = (event as CustomEvent<{ files: File[] }>).detail?.files ?? [];
      void uploadFiles(files);
    };
    window.addEventListener("ogenic:attachment-files", onFiles);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isChatSend = method === "POST" && /\/api\/chat(?:\?|$)/.test(url) && !url.includes("/attachments") && !url.includes("/history");
      if (!isChatSend || pendingRef.current.length === 0 || typeof init?.body !== "string") return originalFetch(input, init);
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.attachment_ids = pendingRef.current.map((item) => item.id);
        const response = await originalFetch(input, { ...init, body: JSON.stringify(body) });
        if (response.ok) { pendingRef.current = []; renderPending(); setStatus(""); }
        return response;
      } catch {
        return originalFetch(input, init);
      }
    };

    return () => {
      observer.disconnect();
      window.removeEventListener("ogenic:attachment-files", onFiles);
      window.fetch = originalFetch;
    };
  }, []);

  return <input
    ref={inputRef}
    className="ogenicAttachmentInput"
    type="file"
    multiple
    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json,.pdf"
    onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []);
      if (files.length) window.dispatchEvent(new CustomEvent("ogenic:attachment-files", { detail: { files } }));
    }}
    aria-hidden="true"
    tabIndex={-1}
  />;
}
