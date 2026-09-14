import { useEffect, useRef, useState } from "react";

type GuideMessage = { id: string; role: "assistant" | "user" | "system"; text: string };
type Target = { x: number; y: number; label: string } | null;
type LiveAssistResponse = {
  ok?: boolean;
  text?: string;
  target?: Target;
  pause_before_secret?: boolean;
  code?: string;
  message?: string;
  usage_tokens?: number;
};

const AUTO_SAMPLE_MS = 1500;
const AUTO_MIN_SEND_MS = 4500;
const CHANGE_THRESHOLD = 10;

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function LiveAssist() {
  const [ownerReady, setOwnerReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [autoWatch, setAutoWatch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [secretShield, setSecretShield] = useState(false);
  const [status, setStatus] = useState("พร้อมแชร์หน้าจอ");
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState<Target>(null);
  const [messages, setMessages] = useState<GuideMessage[]>([
    { id: "welcome", role: "assistant", text: "LIVE ASSIST พร้อมแล้ว · แชร์หน้าจอแล้วกูจะพาไปทีละจุด และจะหยุดก่อนหน้าที่เปิด/คัดลอก Secret" },
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);
  const fingerprintRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const previousFingerprintRef = useRef<Uint8Array | null>(null);
  const lastSentAtRef = useRef(0);
  const busyRef = useRef(false);
  const autoWatchRef = useRef(true);

  useEffect(() => {
    void fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => response.ok ? await response.json() : null)
      .then((body) => setOwnerReady(Boolean(body?.authenticated)))
      .catch(() => setOwnerReady(false));
  }, []);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { autoWatchRef.current = autoWatch; }, [autoWatch]);

  useEffect(() => {
    if (!sharing || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [sharing, open, previewCollapsed]);

  useEffect(() => () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function addMessage(role: GuideMessage["role"], text: string) {
    setMessages((rows) => [...rows.slice(-10), { id: crypto.randomUUID(), role, text }]);
  }

  function stopShare(message = "หยุดแชร์แล้ว") {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    previousFingerprintRef.current = null;
    setSharing(false);
    setBusy(false);
    setTarget(null);
    setSecretShield(false);
    setStatus(message);
  }

  async function startShare() {
    const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (!getDisplayMedia) {
      setStatus("เบราว์เซอร์นี้ยังไม่รองรับ Screen Share");
      return;
    }
    try {
      const stream = await getDisplayMedia({
        video: { frameRate: { ideal: 2, max: 5 } },
        audio: false,
      });
      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      if (track) track.addEventListener("ended", () => stopShare("การแชร์หน้าจอถูกหยุดจากเบราว์เซอร์"), { once: true });
      setOpen(true);
      setSharing(true);
      setAutoWatch(true);
      setSecretShield(false);
      setStatus("LIVE · AI Watch ทำงานเมื่อหน้าจอเปลี่ยน");
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      }, 0);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(() => {
        void autoAnalyzeIfChanged();
      }, AUTO_SAMPLE_MS);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "เริ่มแชร์หน้าจอไม่ได้");
    }
  }

  function getFingerprint() {
    const video = videoRef.current;
    const canvas = fingerprintRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    const width = 64;
    const height = Math.max(24, Math.round(width * video.videoHeight / video.videoWidth));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let p = 0, i = 0; i < rgba.length; i += 4, p += 1) {
      gray[p] = Math.round((rgba[i] * 0.299) + (rgba[i + 1] * 0.587) + (rgba[i + 2] * 0.114));
    }
    return gray;
  }

  function changedEnough(current: Uint8Array) {
    const previous = previousFingerprintRef.current;
    previousFingerprintRef.current = current;
    if (!previous || previous.length !== current.length) return true;
    let total = 0;
    for (let i = 0; i < current.length; i += 1) total += Math.abs(current[i] - previous[i]);
    return total / current.length >= CHANGE_THRESHOLD;
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = captureRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return "";
    const width = Math.min(1280, video.videoWidth);
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.68);
  }

  async function analyze(prompt: string, auto = false) {
    if (!sharing || busyRef.current || secretShield) return;
    const frame = captureFrame();
    if (!frame) return;
    busyRef.current = true;
    setBusy(true);
    setStatus(auto ? "AI กำลังดูหน้าจอที่เปลี่ยน…" : "กำลังวิเคราะห์หน้าจอ…");
    if (!auto) addMessage("user", `${prompt} · ${nowLabel()}`);
    try {
      const response = await fetch("/api/live-assist", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `live_${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ prompt, image_data_url: frame, auto }),
      });
      const body = await response.json().catch(() => ({})) as LiveAssistResponse;
      if (!response.ok || !body.ok) throw new Error(body.message || body.code || `LIVE_HTTP_${response.status}`);
      const text = body.text || "เห็นหน้าจอแล้ว แต่ยังไม่มีขั้นตอนที่มั่นใจ";
      setTarget(body.target ?? null);
      addMessage("assistant", `${text}${body.usage_tokens ? ` · ${body.usage_tokens} tok` : ""}`);
      if (body.pause_before_secret) {
        setSecretShield(true);
        setAutoWatch(false);
        setTarget(null);
        setStatus("SECRET SHIELD · AI Vision หยุดแล้ว เก็บ Secret เองก่อนแล้วค่อย Resume");
      } else {
        setStatus(autoWatchRef.current ? "LIVE · รอดูการเปลี่ยนหน้าจอ" : "แชร์อยู่ · AI Watch ปิดอยู่");
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Live Assist failed";
      addMessage("system", text);
      setStatus(text);
    } finally {
      busyRef.current = false;
      setBusy(false);
      lastSentAtRef.current = Date.now();
    }
  }

  async function autoAnalyzeIfChanged() {
    if (!sharing || !autoWatchRef.current || busyRef.current || secretShield) return;
    if (Date.now() - lastSentAtRef.current < AUTO_MIN_SEND_MS) return;
    const fingerprint = getFingerprint();
    if (!fingerprint || !changedEnough(fingerprint)) return;
    await analyze("ดูหน้าจอล่าสุดแล้วพากูไปขั้นตอนถัดไปทีละจุด ถ้าใกล้ถึงหน้าที่เปิดหรือคัดลอก Secret ให้หยุดก่อนทันที", true);
  }

  function resumeVision() {
    setSecretShield(false);
    setAutoWatch(true);
    setStatus("LIVE · AI Vision กลับมาทำงานแล้ว");
    lastSentAtRef.current = 0;
  }

  async function sendQuestion() {
    const prompt = draft.trim();
    if (!prompt) return;
    setDraft("");
    await analyze(prompt, false);
  }

  if (!ownerReady) return null;

  return <>
    {!open && <button className="liveAssistLauncher" onClick={() => setOpen(true)}>
      <span className="liveDot" /> LIVE ASSIST
    </button>}

    {open && <aside className="liveAssistDrawer" aria-label="OGENIC Live Assist">
      <header className="liveAssistHead">
        <div><strong>LIVE ASSIST</strong><small>{sharing ? "Screen + AI Guide" : "Owner screen guide"}</small></div>
        <div className="liveAssistHeadActions">
          {sharing && <button onClick={() => setPreviewCollapsed((value) => !value)}>{previewCollapsed ? "▣" : "▁"}</button>}
          <button onClick={() => setOpen(false)}>×</button>
        </div>
      </header>

      <div className="liveAssistStatus" data-live={sharing ? "1" : "0"} data-shield={secretShield ? "1" : "0"}>
        <span className="liveDot" /> {status}
      </div>

      {!sharing && <section className="liveAssistStart">
        <h3>แชร์หน้าจอให้ AI ดูไปพร้อมกับมึง</h3>
        <p>AI จะเห็นเป็นเฟรมภาพเมื่อหน้าจอเปลี่ยน ไม่ใช่วิดีโอดิบทั้งสาย และจะหยุดก่อนขั้นตอนเปิด/คัดลอก Secret</p>
        <button className="primary" onClick={() => void startShare()}>แชร์หน้าจอ</button>
      </section>}

      {sharing && <>
        {!previewCollapsed && <div className="livePreviewWrap">
          <video ref={videoRef} className="livePreview" muted playsInline />
          {target && !secretShield && <div className="liveTarget" style={{ left: `${target.x}%`, top: `${target.y}%` }}>
            <span />
            <b>{target.label}</b>
          </div>}
          {secretShield && <div className="secretShieldOverlay"><strong>SECRET SHIELD</strong><span>AI Vision paused</span></div>}
        </div>}

        <div className="liveAssistControls">
          <button className={autoWatch ? "active" : ""} onClick={() => {
            if (secretShield) return;
            setAutoWatch((value) => !value);
          }}>◉ Auto Watch</button>
          <button onClick={() => void analyze("ดูหน้าจอนี้ตอนนี้ แล้วบอกว่ากูต้องกดตรงไหนต่อ", false)} disabled={busy || secretShield}>{busy ? "ดูอยู่…" : "⌖ ดูตอนนี้"}</button>
          {secretShield ? <button className="resume" onClick={resumeVision}>Resume AI</button> : <button onClick={() => stopShare()}>■ Stop</button>}
        </div>
      </>}

      <div className="liveAssistChat">
        {messages.map((message) => <div key={message.id} className={`liveMsg ${message.role}`}><span>{message.role === "assistant" ? "AI" : message.role === "user" ? "YOU" : "SYS"}</span><p>{message.text}</p></div>)}
      </div>

      {sharing && <div className="liveAssistComposer">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); }
        }} placeholder={secretShield ? "เก็บ Secret เสร็จแล้วกด Resume AI ก่อน" : "ถามขณะดูจอ เช่น 'ตรงไหนวะ'"} disabled={secretShield} />
        <button onClick={() => void sendQuestion()} disabled={!draft.trim() || busy || secretShield}>Send</button>
      </div>}

      <canvas ref={captureRef} className="liveHiddenCanvas" />
      <canvas ref={fingerprintRef} className="liveHiddenCanvas" />
    </aside>}
  </>;
}
