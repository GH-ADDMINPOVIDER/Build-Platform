import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Surface = "ogenic-app" | "ogenic-web";
type Role = "user" | "assistant" | "system";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type ToolMode = "chat" | "web" | "rag" | "github" | "linear" | "n8n" | "meta" | "manus" | "live";
type Session = { authenticated?: boolean; user?: { label?: string; role?: string } | null };
type Message = {
  id?: string;
  role?: Role | string;
  text?: string;
  model?: string | null;
  created_at?: number;
  sequence_no?: number | null;
  source_surface?: string | null;
};
type SessionRef = { id: string; source_surface: string; session_ref: string; session_url?: string | null; label?: string | null; first_sequence?: number | null; last_sequence?: number | null; last_seen_at?: number };
type RuntimeTool = { id: string; label: string; state: string; summary?: string; records?: Array<Record<string, unknown>> };
type IncentivePool = { id: string; label: string; remaining: number | null; cap: number | null; percent: number | null; state: string; telemetry?: string };
type Dashboard = {
  runtime?: { provider?: string; branch?: string };
  tools?: RuntimeTool[];
  incentives?: {
    policy_state?: string;
    routing_mode?: string;
    paid_fallback?: boolean;
    pools?: IncentivePool[];
  };
};
type Connector = { id: string; label: string; state: string; summary?: string; route_mode?: string; kind?: string };
type Platform = {
  api_key_state?: string;
  models?: { state?: string; count?: number; data?: Array<{ id?: string }> };
  vector_stores?: { state?: string; knowledge_store_id?: string | null };
  tools?: Array<{ id: string; label: string; state: string; note?: string }>;
};
type ManusState = { ok?: boolean; state?: string; configured?: boolean };
type BrowserState = { ok?: boolean; state?: string; provider?: string; human_in_the_loop?: boolean };
type Attachment = { id: string; filename: string; mime_type: string; size_bytes: number };
type ChatConfig = { model: string; effort: Effort; boost: 1 | 10 | 20 };

type Props = { surface: Surface };

const CHAT_CONFIG_KEY = "ogenic.unified.chat-config.v1";
const MEMORY_KEY = "ogenic.unified.d1-memory.v1";
const PAID_FALLBACK_KEY = "ogenic.unified.paid-fallback.v1";
const DEFAULT_CONFIG: ChatConfig = { model: "gpt-5.6-sol", effort: "medium", boost: 1 };
const MODEL_CANDIDATES = [
  { id: "gpt-5.6-sol", label: "Sol", note: "Balanced" },
  { id: "gpt-5.6-terra", label: "Terra", note: "Deep" },
  { id: "gpt-5.6-luna", label: "Luna", note: "Fast" },
  { id: "gpt-4.1-mini", label: "4.1 mini", note: "Efficient" },
  { id: "gpt-6-astra", label: "Astra", note: "Reasoning" },
];
const EFFORTS: Array<{ id: Effort; label: string }> = [
  { id: "low", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Max High" },
  { id: "max", label: "Max" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}
function readBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch { /* noop */ }
  return fallback;
}
function cleanText(value: unknown, max = 7000) { return String(value ?? "").trim().slice(0, max); }
function toolLive(value?: string) { return ["LIVE", "BOUND", "CONFIGURED", "READY", "OPERATIONAL"].includes(String(value ?? "").toUpperCase()); }
function timeAgo(ts?: number) {
  if (!ts) return "";
  const d = Math.max(0, Date.now() - ts);
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}
function parseUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s)\]}]+/i);
  return match?.[0] ?? "";
}
function makeViewportSessionRef(surface: Surface, reuse = true) {
  const key = `ogenic.1lss.viewport.${surface}`;
  try {
    if (reuse) {
      const current = sessionStorage.getItem(key);
      if (current) return current;
    }
    const next = `${surface}_${crypto.randomUUID()}`;
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `${surface}_${crypto.randomUUID()}`;
  }
}
function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error || new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

export default function UnifiedChat({ surface }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [manus, setManus] = useState<ManusState | null>(null);
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionRefs, setSessionRefs] = useState<SessionRef[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [viewportSessionRef, setViewportSessionRef] = useState(() => makeViewportSessionRef(surface));
  const [latestSequence, setLatestSequence] = useState(0);
  const [viewportFloor, setViewportFloor] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [toolDock, setToolDock] = useState(false);
  const [modelDock, setModelDock] = useState(false);
  const [newDock, setNewDock] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>("chat");
  const [d1Enabled, setD1Enabled] = useState(() => readBool(MEMORY_KEY, true));
  const [allowPaidFallback, setAllowPaidFallback] = useState(() => readBool(PAID_FALLBACK_KEY, false));
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() => readJson(CHAT_CONFIG_KEY, DEFAULT_CONFIG));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [inlineNotice, setInlineNotice] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const latestSequenceRef = useRef(0);

  const liveTools = useMemo(() => new Map((dashboard.tools ?? []).map((tool) => [tool.id, tool])), [dashboard.tools]);
  const platformTools = useMemo(() => new Map((platform?.tools ?? []).map((tool) => [tool.id, tool])), [platform?.tools]);
  const providerModelIds = useMemo(() => new Set((platform?.models?.data ?? []).map((row) => String(row.id ?? ""))), [platform?.models?.data]);
  const availableModels = useMemo(() => {
    if (!providerModelIds.size) return MODEL_CANDIDATES.filter((item) => item.id === DEFAULT_CONFIG.model);
    const rows = MODEL_CANDIDATES.filter((item) => providerModelIds.has(item.id));
    return rows.length ? rows : MODEL_CANDIDATES.filter((item) => item.id === DEFAULT_CONFIG.model);
  }, [providerModelIds]);
  const selectedModel = availableModels.find((item) => item.id === chatConfig.model) ?? availableModels[0] ?? MODEL_CANDIDATES[0];
  const pools = dashboard.incentives?.pools ?? [];
  const exhausted = dashboard.incentives?.policy_state === "EXHAUSTED";
  const requiresOpenAI = !["manus", "live"].includes(toolMode);
  const quotaMetered = pools.some((pool) => pool.telemetry === "HARNESS_METERED");
  const quotaBlocked = exhausted && requiresOpenAI && !allowPaidFallback;

  useEffect(() => { try { localStorage.setItem(MEMORY_KEY, d1Enabled ? "1" : "0"); } catch { /* noop */ } }, [d1Enabled]);
  useEffect(() => { try { localStorage.setItem(PAID_FALLBACK_KEY, allowPaidFallback ? "1" : "0"); } catch { /* noop */ } }, [allowPaidFallback]);
  useEffect(() => { try { localStorage.setItem(CHAT_CONFIG_KEY, JSON.stringify(chatConfig)); } catch { /* noop */ } }, [chatConfig]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);
  useEffect(() => { latestSequenceRef.current = latestSequence; }, [latestSequence]);
  useEffect(() => {
    if (selectedModel.id !== chatConfig.model) setChatConfig((current) => ({ ...current, model: selectedModel.id }));
  }, [selectedModel.id, chatConfig.model]);

  const loadHistory = useCallback(async (floor = viewportFloor) => {
    if (!d1Enabled) return;
    const response = await fetch("/api/chat/history", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as { messages?: Message[]; has_more?: boolean };
    const rows = Array.isArray(body.messages) ? body.messages : [];
    const latest = rows.reduce((max, row) => Math.max(max, Number(row.sequence_no ?? 0)), 0);
    setLatestSequence(latest);
    setHistoryHasMore(Boolean(body.has_more ?? (rows.length >= 60)));
    setMessages(rows.filter((row) => Number(row.sequence_no ?? 0) > floor));
  }, [d1Enabled, viewportFloor]);

  const poll1LSS = useCallback(async () => {
    if (!d1Enabled || !session?.authenticated || sending) return;
    const after = latestSequenceRef.current;
    const response = await fetch(`/api/1lss/events?after_sequence=${after}&limit=40`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as { messages?: Message[]; latest_sequence?: number; cursor?: number };
    const rows = Array.isArray(body.messages) ? body.messages : [];
    const newest = Math.max(
      after,
      Number(body.latest_sequence ?? 0),
      Number(body.cursor ?? 0),
      ...rows.map((row) => Number(row.sequence_no ?? 0)),
    );
    if (newest > latestSequenceRef.current) {
      latestSequenceRef.current = newest;
      setLatestSequence(newest);
    }
    if (!rows.length) return;
    setMessages((current) => {
      const seenIds = new Set(current.map((row) => row.id).filter(Boolean));
      const seenSequences = new Set(current.map((row) => Number(row.sequence_no ?? 0)).filter((value) => value > 0));
      const additions = rows.filter((row) => {
        const sequence = Number(row.sequence_no ?? 0);
        if (sequence <= viewportFloor) return false;
        if (row.id && seenIds.has(row.id)) return false;
        if (sequence > 0 && seenSequences.has(sequence)) return false;
        return true;
      });
      if (!additions.length) return current;
      return [...current, ...additions].sort((left, right) =>
        Number(left.sequence_no ?? 0) - Number(right.sequence_no ?? 0)
      );
    });
  }, [d1Enabled, session?.authenticated, sending, viewportFloor]);

  useEffect(() => {
    if (!d1Enabled || !session?.authenticated) return;
    void poll1LSS();
    const timer = window.setInterval(() => { void poll1LSS(); }, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll1LSS();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [d1Enabled, session?.authenticated, poll1LSS]);

  const loadSessionRefs = useCallback(async () => {
    if (!d1Enabled) return;
    const response = await fetch("/api/1lss/sessions?limit=20", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as { sessions?: SessionRef[] };
    setSessionRefs(Array.isArray(body.sessions) ? body.sessions : []);
  }, [d1Enabled]);

  async function registerSessionRef(ref = viewportSessionRef, sequenceNo = 0) {
    if (!d1Enabled || !ref) return;
    const response = await fetch("/api/1lss/sessions", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_surface: surface,
        session_ref: ref,
        session_url: `${window.location.origin}${window.location.pathname}`,
        label: surface === "ogenic-app" ? "OGENIC App viewport" : "OGENIC Web viewport",
        sequence_no: sequenceNo || undefined,
      }),
    });
    if (response.ok) await loadSessionRefs();
  }

  async function loadOlder() {
    if (!d1Enabled) return;
    const oldest = messages.reduce((min, row) => {
      const seq = Number(row.sequence_no ?? 0);
      return seq > 0 ? Math.min(min, seq) : min;
    }, Number.POSITIVE_INFINITY);
    const before = Number.isFinite(oldest) ? oldest : latestSequence + 1;
    const response = await fetch(`/api/1lss/history-page?before_sequence=${before}&limit=60`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as { messages?: Message[]; has_more?: boolean };
    const older = Array.isArray(body.messages) ? body.messages : [];
    setHistoryHasMore(Boolean(body.has_more));
    setMessages((current) => {
      const seen = new Set(current.map((row) => `${row.sequence_no ?? "x"}:${row.id ?? ""}`));
      return [...older.filter((row) => !seen.has(`${row.sequence_no ?? "x"}:${row.id ?? ""}`)), ...current];
    });
    setInlineNotice(older.length ? `โหลด 1LSS เก่ามาอีก ${older.length} รายการ` : "ถึงต้นเส้นที่โหลดได้แล้ว");
  }

  async function openKnownSession(row: SessionRef) {
    if (row.session_url && row.source_surface.startsWith("chatgpt")) {
      window.open(row.session_url, "_blank", "noopener,noreferrer");
      setNewDock(false);
      return;
    }
    const response = await fetch(`/api/1lss/sessions/${encodeURIComponent(row.id)}`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as { messages?: Message[]; session?: SessionRef };
    const rows = Array.isArray(body.messages) ? body.messages : [];
    setMessages(rows);
    const first = Number(body.session?.first_sequence ?? row.first_sequence ?? 1);
    setViewportFloor(Math.max(0, first - 1));
    setNewDock(false);
    setInlineNotice(`เปิด session ${row.label || row.source_surface} จาก 1LSS แล้ว`);
  }

  const loadRuntime = useCallback(async () => {
    const [dashR, connectorR, platformR, manusR, browserR] = await Promise.all([
      fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/connectors", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/openai/platform", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/manus/status", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/browser-session", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if (dashR.status === 401) { setSession({ authenticated: false, user: null }); return; }
    const [dashB, connectorB, platformB, manusB, browserB] = await Promise.all([
      dashR.json().catch(() => ({})), connectorR.json().catch(() => ({})), platformR.json().catch(() => ({})),
      manusR.json().catch(() => ({})), browserR.json().catch(() => ({})),
    ]);
    if (dashR.ok) setDashboard(dashB);
    if (connectorR.ok && Array.isArray(connectorB.connectors)) setConnectors(connectorB.connectors);
    if (platformR.ok && platformB?.ok) setPlatform(platformB);
    if (manusR.ok) setManus(manusB);
    if (browserR.ok) setBrowser(browserB);
  }, []);

  useEffect(() => {
    void fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.json())
      .then(async (body: Session) => {
        setSession(body);
        if (body.authenticated) await Promise.all([loadRuntime(), loadHistory(0), loadSessionRefs(), registerSessionRef(viewportSessionRef)]);
      })
      .catch(() => setSession({ authenticated: false, user: null }));
  }, [loadRuntime]);

  async function signIn() {
    if (!ownerKey.trim()) return;
    setAuthError("");
    const response = await fetch("/api/session", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_key: ownerKey.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    setOwnerKey("");
    if (!response.ok || !body?.authenticated) { setAuthError(body?.message || body?.code || "Sign in failed"); return; }
    setSession(body);
    await Promise.all([loadRuntime(), loadHistory(0), loadSessionRefs(), registerSessionRef(viewportSessionRef)]);
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    setSession({ authenticated: false, user: null });
    setMessages([]);
  }

  async function upload(file: File) {
    if (!d1Enabled) { setInlineNotice("เปิด D1 ก่อนแนบไฟล์ เพื่อให้ไฟล์อยู่บน 1LSS เดียว"); return; }
    if (file.size > 4_000_000) { setInlineNotice("ไฟล์เกิน 4 MB"); return; }
    setInlineNotice(`กำลังแนบ ${file.name}…`);
    try {
      const response = await fetch("/api/chat/attachments", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mime_type: file.type || "application/octet-stream", data_url: await fileToDataUrl(file) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.attachment) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setAttachments((rows) => [...rows, body.attachment].slice(-4));
      setInlineNotice("พร้อมส่ง");
      setToolDock(false);
    } catch (error) { setInlineNotice(error instanceof Error ? error.message : "แนบไฟล์ไม่สำเร็จ"); }
  }

  async function stampEvents(events: Array<{ role: Role; content: string; model?: string | null }>) {
    if (!d1Enabled || !events.length) return;
    const response = await fetch("/api/1lss/event", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": `ui_evt_${crypto.randomUUID()}` },
      body: JSON.stringify({ source_surface: surface, events }),
    });
    if (response.ok) await loadHistory();
  }

  function snapshotFor(id: string) {
    const tool = liveTools.get(id);
    return tool ? JSON.stringify({ label: tool.label, state: tool.state, summary: tool.summary, records: tool.records ?? [] }).slice(0, 9000) : "";
  }

  async function runInlineTool(mode: "github" | "linear" | "n8n" | "meta", prompt: string) {
    const response = await fetch("/api/inline/tool", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": `inline_${crypto.randomUUID()}` },
      body: JSON.stringify({ tool: mode, prompt, model: selectedModel.id, reasoning_effort: chatConfig.effort, snapshot: snapshotFor(mode) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
    await stampEvents([
      { role: "user", content: `[${mode.toUpperCase()}] ${prompt}` },
      { role: "system", content: `[TOOL ${mode}] LIVE · READ_ONLY` },
      { role: "assistant", content: cleanText(body.text), model: body.model || selectedModel.id },
    ]);
    if (!d1Enabled) setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text: body.text, model: body.model, created_at: Date.now() }]);
  }

  async function runManus(prompt: string) {
    const response = await fetch("/api/manus/task", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
    const text = `Manus task created · ${cleanText(body.task_title || body.task_id, 240)}${body.task_url ? `\n${body.task_url}` : ""}`;
    await stampEvents([
      { role: "user", content: `[MANUS] ${prompt}` },
      { role: "system", content: `[TOOL manus] TASK_CREATED · ${cleanText(body.task_id, 160)}` },
      { role: "assistant", content: text },
    ]);
    if (!d1Enabled) setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text, created_at: Date.now() }]);
  }

  async function runLiveDoor(prompt: string) {
    const url = parseUrl(prompt);
    if (!url) throw new Error("Live ต้องมี URL ของประตูที่ต้องการเข้า");
    const response = await fetch("/api/live-door", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, goal: prompt }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
    const state = cleanText(body.state, 80) || "READY";
    const summary = state === "WAITING_HUMAN_SECRET"
      ? `ถึงประตูรหัสแล้ว · หยุดให้มึงรับช่วง (${body.gate || "secret"})`
      : state === "WAITING_HUMAN_CONSENT"
        ? "ถึงหน้าที่ต้องให้มึงกดยืนยันสิทธิ์แล้ว · กูหยุดตรงนี้"
        : `Live door · ${state}`;
    await stampEvents([
      { role: "user", content: `[LIVE] ${prompt}` },
      { role: "system", content: `[TOOL live-door] ${state}` },
      { role: "assistant", content: summary },
    ]);
    if (body.live_view_url) window.open(body.live_view_url, "_blank", "noopener,noreferrer");
    if (!d1Enabled) setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text: summary, created_at: Date.now() }]);
  }

  async function runHostedTools(prompt: string) {
    if (!d1Enabled) throw new Error("Web/RAG tool ต้องเปิด D1 เพื่อคง 1LSS");
    const response = await fetch("/api/chat/functions", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": `hosted_${crypto.randomUUID()}` },
      body: JSON.stringify({ prompt, model: selectedModel.id, source_surface: surface, tool_mode: toolMode, reasoning_effort: chatConfig.effort, allow_paid_fallback: allowPaidFallback }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
    await loadHistory();
  }

  async function runChat(prompt: string) {
    const endpoint = d1Enabled ? "/api/chat/model" : "/api/chat/ephemeral";
    const response = await fetch(endpoint, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `${surface}_${crypto.randomUUID()}` },
      body: JSON.stringify({
        prompt,
        attachment_ids: d1Enabled ? attachments.map((item) => item.id) : [],
        model: selectedModel.id,
        reasoning_effort: chatConfig.effort,
        token_boost: chatConfig.boost,
        source_surface: surface,
        session_ref: viewportSessionRef,
        session_url: `${window.location.origin}${window.location.pathname}`,
        session_label: surface === "ogenic-app" ? "OGENIC App viewport" : "OGENIC Web viewport",
        allow_paid_fallback: allowPaidFallback,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
    if (d1Enabled) await loadHistory();
    else setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text: body.text, model: body.model, created_at: Date.now() }]);
    setAttachments([]);
  }

  async function send() {
    const prompt = draft.trim() || (attachments.length ? "วิเคราะห์ไฟล์ที่แนบมา" : "");
    if (!prompt || sending) return;
    if (quotaBlocked) { setInlineNotice("Included quota หมด · เลือก API fallback ก่อน กูจะไม่เผา token เอง"); return; }
    if (!d1Enabled && attachments.length) { setInlineNotice("ไฟล์แนบต้องใช้ D1; เปิด D1 หรือเอาไฟล์ออกก่อน"); return; }
    setSending(true);
    setInlineNotice("");
    setDraft("");
    setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "user", text: prompt, created_at: Date.now(), source_surface: surface }]);
    try {
      if (toolMode === "manus") await runManus(prompt);
      else if (toolMode === "live") await runLiveDoor(prompt);
      else if (toolMode === "github" || toolMode === "linear" || toolMode === "n8n" || toolMode === "meta") await runInlineTool(toolMode, prompt);
      else if (toolMode === "web" || toolMode === "rag") await runHostedTools(prompt);
      else await runChat(prompt);
      await loadRuntime();
    } catch (error) {
      setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "system", text: error instanceof Error ? error.message : "Request failed", created_at: Date.now() }]);
    } finally { setSending(false); }
  }

  function startNew(memory: boolean) {
    setD1Enabled(memory);
    const nextRef = makeViewportSessionRef(surface, false);
    setViewportSessionRef(nextRef);
    if (memory) void registerSessionRef(nextRef, latestSequence + 1);
    setViewportFloor(latestSequence);
    setMessages([]);
    setAttachments([]);
    setToolMode("chat");
    setNewDock(false);
    setInlineNotice(memory ? `New viewport · D1 ต่อจาก #${latestSequence}` : "New ephemeral chat · D1 off");
  }

  if (session === null) return <main className="ucSplash"><img src="/ogenic-icon-192.png" alt="" /><b>OGENIC AI</b><span>Joining 1LSS…</span></main>;
  if (!session.authenticated) return <main className="ucAuth"><section><img src="/ogenic-icon-192.png" alt="" /><small>OWNER ACCESS</small><h1>OGENIC AI</h1><p>One clean chat · one canonical line.</p><input type="password" value={ownerKey} onChange={(event) => setOwnerKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void signIn(); }} placeholder="Owner access key" /><button onClick={() => void signIn()}>Continue</button>{authError && <em>{authError}</em>}</section></main>;

  const toolRows: Array<{ id: ToolMode; label: string; sub: string; live: boolean }> = [
    { id: "web", label: "Web search", sub: "Fresh web sources", live: toolLive(platformTools.get("web_search")?.state) },
    { id: "rag", label: "RAG memory", sub: "D1 canonical + OGENIC knowledge", live: toolLive(platformTools.get("d1_canonical")?.state) || toolLive(platformTools.get("file_search")?.state) },
    { id: "github", label: "GitHub", sub: liveTools.get("github")?.summary || "Repository + CI", live: toolLive(liveTools.get("github")?.state) },
    { id: "linear", label: "Linear", sub: liveTools.get("linear")?.summary || "Issues + projects", live: toolLive(liveTools.get("linear")?.state) },
    { id: "n8n", label: "n8n", sub: liveTools.get("n8n")?.summary || "Workflows", live: toolLive(liveTools.get("n8n")?.state) },
    { id: "meta", label: "Meta Facebook", sub: liveTools.get("meta")?.summary || "Facebook Page · Messenger · Instagram optional", live: toolLive(liveTools.get("meta")?.state) },
    { id: "manus", label: "Manus", sub: "Delegate a task", live: toolLive(manus?.state) || manus?.configured === true },
    { id: "live", label: "Live door", sub: "Browser quota · stop before secrets", live: toolLive(browser?.state) },
  ];
  const connected = connectors.filter((row) => toolLive(row.state)).slice(0, 8);

  return <main className="ucShell">
    <input ref={fileInput} type="file" className="ucHidden" accept="image/*,.pdf,.txt,.md,.csv,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />

    <header className="ucTopbar">
      <button className="ucBrand" onClick={() => setNewDock((value) => !value)}><img src="/ogenic-icon-192.png" alt="" /><span><b>OGENIC</b><small>{surface === "ogenic-app" ? "APP" : "WEB"}</small></span></button>
      <div className="ucLineState"><b>1LSS #{String(latestSequence).padStart(4, "0")}</b><span className={d1Enabled ? "on" : "off"}>D1 {d1Enabled ? "●" : "○"}</span></div>
      <button className="ucNew" onClick={() => setNewDock((value) => !value)}>＋ New</button>
      {newDock && <section className="ucNewDock"><strong>New chat viewport</strong><p>เส้นชีวิตไม่แตก ถ้าเปิด D1 จะต่อ owner-main หลังบ้าน</p><label><input type="checkbox" checked={d1Enabled} onChange={(event) => setD1Enabled(event.target.checked)} /> D1 · 1LSS Memory</label><div><button onClick={() => startNew(d1Enabled)}>Start</button><button className="ghost" onClick={() => void loadOlder()}>Load older</button><button className="ghost" onClick={() => setNewDock(false)}>Cancel</button></div>{!!sessionRefs.length && <div className="ucConnected"><small>RECENT DOORS</small><p>{sessionRefs.slice(0, 5).map((row) => `${row.label || row.source_surface} #${row.last_sequence || "?"}`).join(" · ")}</p><div>{sessionRefs.slice(0, 5).map((row) => <button key={row.id} className="ghost" onClick={() => void openKnownSession(row)}>{row.source_surface} · #{row.last_sequence || "?"}</button>)}</div></div>}</section>}
    </header>

    <section className="ucConversation">
      {historyHasMore && <button className="ghost" onClick={() => void loadOlder()}>↑ Load older 1LSS</button>}
      {!messages.length && <div className="ucWelcome"><div className="ucOrb"><i /></div><small>AMMONITE · 1LSS</small><h1>What are we doing next?</h1><p>Chat, files, tools, live browser and agents — one line, no cockpit clutter.</p></div>}
      {messages.map((message, index) => <article key={message.id || index} className={`ucMessage ${message.role || "assistant"}`}>
        <div className="ucMessageMeta"><b>{message.role === "user" ? "YOU" : message.role === "system" ? "SYSTEM" : "AMMONITE"}</b><span>{message.sequence_no ? `#${message.sequence_no}` : ""}{message.source_surface ? ` · ${message.source_surface}` : ""}{message.created_at ? ` · ${timeAgo(message.created_at)}` : ""}</span></div>
        <p>{message.text}</p>
        {message.model && <small>{message.model}</small>}
      </article>)}
      {sending && <article className="ucMessage assistant"><div className="ucMessageMeta"><b>AMMONITE</b><span>working</span></div><p className="ucThinking">•••</p></article>}
      <div ref={chatEnd} />
    </section>

    <footer className="ucComposerWrap">
      {(toolDock || modelDock) && <section className="ucDock">
        {toolDock && <>
          <div className="ucDockHead"><div><b>Capabilities</b><small>แสดงเฉพาะตัวที่ใช้งานได้จริง</small></div><button onClick={() => setToolDock(false)}>×</button></div>
          <div className="ucMemoryRow"><span><b>D1 · 1LSS</b><small>{d1Enabled ? "Canonical memory ON" : "Ephemeral · no memory write"}</small></span><button className={d1Enabled ? "toggle on" : "toggle"} onClick={() => setD1Enabled((value) => !value)}><i /></button></div>
          <button className="ucCapability" onClick={() => fileInput.current?.click()}><span>▧</span><div><b>Photos & files</b><small>Attach to this turn</small></div><em>＋</em></button>
          {toolRows.filter((row) => row.live).map((row) => <button key={row.id} className={`ucCapability ${toolMode === row.id ? "active" : ""}`} onClick={() => { setToolMode(row.id); setToolDock(false); }}><span>{row.id === "live" ? "◎" : row.id === "manus" ? "◉" : row.id === "github" ? "⌘" : row.id === "rag" ? "◇" : "✦"}</span><div><b>{row.label}</b><small>{row.sub}</small></div><em>{toolMode === row.id ? "✓" : "›"}</em></button>)}
          {!!connected.length && <div className="ucConnected"><small>CONNECTED</small><p>{connected.map((row) => row.label).join(" · ")}</p></div>}
          <div className="ucQuotaRow"><span><b>Quota route</b><small>{dashboard.incentives?.routing_mode || "quota-first"}{exhausted ? " · EXHAUSTED" : quotaMetered ? " · metered" : " · metering pending"}</small></span><button className={allowPaidFallback ? "ucFallback on" : "ucFallback"} onClick={() => setAllowPaidFallback((value) => !value)}>{allowPaidFallback ? "Paid fallback ON" : "Paid fallback OFF"}</button></div>
        </>}
        {modelDock && <>
          <div className="ucDockHead"><div><b>Model</b><small>Web + App ใช้ config เดียวกัน</small></div><button onClick={() => setModelDock(false)}>×</button></div>
          <div className="ucModelList">{availableModels.map((model) => <button key={model.id} className={chatConfig.model === model.id ? "active" : ""} onClick={() => setChatConfig((current) => ({ ...current, model: model.id }))}><span><b>{model.label}</b><small>{model.id} · {model.note}</small></span><em>{chatConfig.model === model.id ? "✓" : ""}</em></button>)}</div>
          <div className="ucEffort">{EFFORTS.map((row) => <button key={row.id} className={chatConfig.effort === row.id ? "active" : ""} onClick={() => setChatConfig((current) => ({ ...current, effort: row.id }))}>{row.label}</button>)}</div>
          <div className="ucBoost">{([1, 10, 20] as const).map((boost) => <button key={boost} className={chatConfig.boost === boost ? "active" : ""} onClick={() => setChatConfig((current) => ({ ...current, boost }))}>×{boost}</button>)}</div>
        </>}
      </section>}

      {toolMode !== "chat" && <div className="ucActiveTool"><span>{toolMode.toUpperCase()}</span><button onClick={() => setToolMode("chat")}>×</button></div>}
      {attachments.length > 0 && <div className="ucAttachments">{attachments.map((file) => <button key={file.id} onClick={() => setAttachments((rows) => rows.filter((row) => row.id !== file.id))}>▧ {file.filename} ×</button>)}</div>}
      {inlineNotice && <div className="ucNotice">{inlineNotice}</div>}
      {quotaBlocked && <div className="ucQuotaWarn"><b>Guarded quota หมด</b><span>Paid fallback ปิดอยู่ กูจะไม่ข้าม guard เอง</span><button onClick={() => setAllowPaidFallback(true)}>Allow paid fallback</button></div>}
      <section className="ucComposer">
        <textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={toolMode === "live" ? "วาง URL + บอกว่าจะเข้าไปทำอะไร…" : toolMode === "manus" ? "ส่งงานให้ Manus…" : "Message Ammonite…"} />
        <div className="ucComposerBar">
          <button className="ucRound" onClick={() => { setToolDock((value) => !value); setModelDock(false); }}>＋</button>
          <button className="ucModel" onClick={() => { setModelDock((value) => !value); setToolDock(false); }}><i /> <b>{selectedModel.label}</b><small>{EFFORTS.find((row) => row.id === chatConfig.effort)?.label} · ×{chatConfig.boost}</small>⌄</button>
          <div className="ucQuotaMini">{pools.length ? <>{pools[0]?.state === "EXHAUSTED" ? (allowPaidFallback ? "Fallback ON" : "Guarded") : quotaMetered ? "Metered" : "Guarded"}</> : "Guarded"}</div>
          <button className="ucSend" disabled={sending || (!draft.trim() && !attachments.length)} onClick={() => void send()}>{sending ? "…" : "↑"}</button>
        </div>
      </section>
      <div className="ucFooterLine"><span>{d1Enabled ? `owner-main · LIVE ≤3s · next #${latestSequence + 1}` : "ephemeral · D1 off"}</span><button onClick={() => void loadRuntime()}>↻</button><button onClick={() => void signOut()}>Sign out</button></div>
    </footer>
  </main>;
}
