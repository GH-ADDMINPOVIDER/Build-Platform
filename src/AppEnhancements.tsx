import { useEffect, useRef } from "react";

type PendingAttachment = { id: string; filename: string; mime_type: string; size_bytes: number };
type HistoryResponse = { ok?: boolean; messages?: Array<{ id: string }> };
type OpenAIStatus = {
  ok?: boolean;
  overall?: string;
  indicator?: string;
  components?: { responses?: string; conversations?: string; files?: string; voice?: string; realtime?: string };
};
type ToolkitStatus = {
  ok?: boolean;
  label?: string;
  version?: string;
  runtime_state?: string;
  live_tools?: number;
  total_tools?: number;
};

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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function bestAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export default function AppEnhancements() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<PendingAttachment[]>([]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let uploading = false;
    let apiMode = false;
    let recorder: MediaRecorder | null = null;
    let recorderStream: MediaStream | null = null;
    let audioChunks: Blob[] = [];

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

    const transcribeAudio = async (blob: Blob, mime: string) => {
      const root = composer();
      const mic = root?.querySelector<HTMLButtonElement>(".voiceButton");
      if (mic) { mic.disabled = true; mic.textContent = "…"; }
      setStatus("กำลังถอดเสียงผ่าน OpenAI API…");
      try {
        const extension = mime.includes("mp4") ? "m4a" : "webm";
        const form = new FormData();
        form.set("file", new File([blob], `voice-${Date.now()}.${extension}`, { type: mime || "audio/webm" }));
        const response = await originalFetch("/api/chat/transcribe", { method: "POST", credentials: "same-origin", body: form });
        const body = await response.json().catch(() => ({})) as { text?: string; code?: string; message?: string };
        if (!response.ok || !body.text) throw new Error(body.message || body.code || `TRANSCRIBE_HTTP_${response.status}`);
        const textarea = root?.querySelector<HTMLTextAreaElement>("textarea");
        if (textarea) setTextareaValue(textarea, `${textarea.value}${textarea.value ? " " : ""}${body.text}`);
        setStatus("ถอดเสียงแล้ว · ตรวจข้อความก่อนกด Send");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Voice transcription failed", true);
      } finally {
        if (mic) { mic.disabled = false; mic.textContent = "🎙"; mic.classList.remove("recording"); }
      }
    };

    const toggleVoice = async () => {
      const root = composer();
      const mic = root?.querySelector<HTMLButtonElement>(".voiceButton");
      if (recorder?.state === "recording") {
        recorder.stop();
        if (mic) { mic.textContent = "…"; mic.classList.remove("recording"); }
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setStatus("เบราว์เซอร์นี้ยังไม่รองรับการอัดเสียง", true);
        return;
      }
      try {
        recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = bestAudioMime();
        recorder = mime ? new MediaRecorder(recorderStream, { mimeType: mime }) : new MediaRecorder(recorderStream);
        audioChunks = [];
        recorder.ondataavailable = (event) => { if (event.data.size) audioChunks.push(event.data); };
        recorder.onstop = () => {
          const actualMime = recorder?.mimeType || mime || "audio/webm";
          const blob = new Blob(audioChunks, { type: actualMime });
          recorderStream?.getTracks().forEach((track) => track.stop());
          recorderStream = null;
          recorder = null;
          audioChunks = [];
          void transcribeAudio(blob, actualMime);
        };
        recorder.start();
        if (mic) { mic.textContent = "■"; mic.classList.add("recording"); }
        setStatus("กำลังอัดเสียง · กด ■ เพื่อหยุด");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Microphone unavailable", true);
      }
    };

    const wireComposer = () => {
      const root = composer();
      if (!root) return;
      root.classList.add("enhancedComposer");
      const textarea = root.querySelector("textarea");
      if (!root.querySelector(".attachmentButton")) {
        const attach = document.createElement("button");
        attach.type = "button";
        attach.className = "attachmentButton";
        attach.textContent = "+";
        attach.title = "แนบรูปหรือไฟล์";
        attach.setAttribute("aria-label", "แนบรูปหรือไฟล์");
        attach.onclick = () => inputRef.current?.click();
        root.insertBefore(attach, textarea ?? root.firstChild);
      }
      if (!root.querySelector(".voiceButton")) {
        const voice = document.createElement("button");
        voice.type = "button";
        voice.className = "voiceButton";
        voice.textContent = "🎙";
        voice.title = "พูดด้วยเสียง";
        voice.setAttribute("aria-label", "พูดด้วยเสียง");
        voice.onclick = () => void toggleVoice();
        const send = root.querySelector("button:not(.attachmentButton)");
        root.insertBefore(voice, send ?? null);
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

    const wireApiMode = () => {
      const switcher = document.querySelector<HTMLElement>(".modeSwitch");
      if (!switcher) return;
      const existing = Array.from(switcher.querySelectorAll<HTMLButtonElement>("button:not(.apiModeButton)"));
      for (const button of existing) {
        if (button.dataset.apiResetWired === "1") continue;
        button.dataset.apiResetWired = "1";
        button.addEventListener("click", () => {
          apiMode = false;
          switcher.querySelector(".apiModeButton")?.classList.remove("active");
        });
      }
      if (!switcher.querySelector(".apiModeButton")) {
        const api = document.createElement("button");
        api.type = "button";
        api.className = "apiModeButton";
        api.textContent = "API";
        api.title = "Paid OpenAI API mode · separate from GM pools";
        api.onclick = () => {
          apiMode = true;
          existing.forEach((button) => button.classList.remove("active"));
          api.classList.add("active");
          setStatus("API mode: ใช้ OpenAI Platform API billing แยกจาก GM pools");
        };
        switcher.append(api);
      }
    };

    const wireDashboardCards = () => {
      const grid = document.querySelector<HTMLElement>(".metricGrid");
      if (!grid) return;
      if (!grid.querySelector(".openAIHealthCard")) {
        const card = document.createElement("article");
        card.className = "openAIHealthCard externalMetricCard";
        card.innerHTML = "<span>OpenAI Status</span><strong>Checking…</strong><small>Responses · Files · Voice</small>";
        grid.append(card);
        void originalFetch("/api/openai-status", { cache: "no-store", credentials: "same-origin" })
          .then(async (response) => response.ok ? await response.json() as OpenAIStatus : null)
          .then((body) => {
            const strong = card.querySelector("strong");
            const small = card.querySelector("small");
            if (strong) strong.textContent = body?.ok ? body.overall ?? "Unknown" : "Unavailable";
            if (small && body?.components) small.textContent = `API ${body.components.responses} · Files ${body.components.files} · Voice ${body.components.voice}`;
            card.dataset.state = body?.indicator ?? "unknown";
          })
          .catch(() => { const strong = card.querySelector("strong"); if (strong) strong.textContent = "Unavailable"; });
      }
      if (!grid.querySelector(".godModeCard")) {
        const card = document.createElement("article");
        card.className = "godModeCard externalMetricCard";
        card.innerHTML = "<span>OGENIC GOD MODE</span><strong>Checking…</strong><small>Phase VI toolkit runtime</small>";
        grid.append(card);
        void originalFetch("/api/toolkit-status", { cache: "no-store", credentials: "same-origin" })
          .then(async (response) => response.ok ? await response.json() as ToolkitStatus : null)
          .then((body) => {
            const strong = card.querySelector("strong");
            const small = card.querySelector("small");
            if (strong) strong.textContent = body?.ok ? body.runtime_state ?? "Unknown" : "Unavailable";
            if (small && body?.ok) small.textContent = `v${body.version ?? "?"} · Live tools ${body.live_tools ?? 0}/${body.total_tools ?? 0}`;
            card.dataset.state = body?.runtime_state?.toLowerCase() ?? "unknown";
          })
          .catch(() => { const strong = card.querySelector("strong"); if (strong) strong.textContent = "Unavailable"; });
      }
    };

    const wire = () => { wireComposer(); wireSameMind(); wireApiMode(); wireDashboardCards(); };
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
      const isChatSend = method === "POST" && /\/api\/chat(?:\?|$)/.test(url) && !url.includes("/attachments") && !url.includes("/history") && !url.includes("/transcribe") && !url.includes("/api");
      if (!isChatSend || typeof init?.body !== "string") return originalFetch(input, init);
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        if (pendingRef.current.length) body.attachment_ids = pendingRef.current.map((item) => item.id);
        const destination = apiMode ? "/api/chat/api" : input;
        const response = await originalFetch(destination, { ...init, body: JSON.stringify(body) });
        if (response.ok && pendingRef.current.length) { pendingRef.current = []; renderPending(); setStatus(""); }
        return response;
      } catch {
        return originalFetch(input, init);
      }
    };

    return () => {
      observer.disconnect();
      window.removeEventListener("ogenic:attachment-files", onFiles);
      recorderStream?.getTracks().forEach((track) => track.stop());
      if (recorder?.state === "recording") recorder.stop();
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
