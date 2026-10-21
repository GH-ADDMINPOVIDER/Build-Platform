import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pstackWorkflows from "../config/pstack-workflows.json";
import ComposerAttachments, { useComposerDraft } from "./ComposerAttachments";

type Surface = "ogenic-app" | "ogenic-web";
type Role = "user" | "assistant" | "system";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type ToolMode = "chat" | "command" | "web" | "rag" | "github" | "linear" | "n8n" | "meta" | "manus" | "live";
type ExperienceMode = "chat-api" | "agent-ai";

function withoutPstackTemplates(value: string): string {
  // One active workflow, never copy old built-in prompt instructions into another.
  let task = value;
  for (const preset of pstackWorkflows.workflows) task = task.split(preset.prompt).join("");
  return task.replace(/(?:^|\n)\s*\+pstack\s*(?=\n|$)/gi, "\n").trim();
}

type Session = { authenticated?: boolean; user?: { label?: string; role?: string } | null };
type MemoryPersistenceReceipt = {
  status?: string;
  user_sequence_no?: number | null;
  result_sequence_no?: number | null;
  failure_code?: string;
};
type PersistedTurnResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  text?: string;
  model?: string;
  agent_session_id?: string;
  session_continuation?: boolean;
  memory_persistence?: MemoryPersistenceReceipt;
};
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
type ChatConfig = { model: string; effort: Effort; boost: 1 | 10 | 20 };
type BridgeSurface = {
  source_surface: Surface;
  message_count: number;
  last_message_sequence: number;
  door_last_sequence: number;
  door_last_seen_at: number;
  door_seen: boolean;
  fresh: boolean;
  persisted: boolean;
  caught_up_to_pair_latest: boolean;
};
type BridgeStatus = {
  ok?: boolean;
  cross_surface_ready?: boolean;
  latest_sequence?: number;
  checked_at?: number;
  surfaces?: BridgeSurface[];
};


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
const EXPERIENCE_MODES: Array<{ id: ExperienceMode; label: string; state: string }> = [
  { id: "chat-api", label: "WAVE", state: "SAME MIND · OGENIC HARNESS · 1LSS" },
  { id: "agent-ai", label: "Agent AI", state: "OGENIC HARNESS · Agent Session · 1LSS" },
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
function memoryPersistenceNotice(body: PersistedTurnResponse, headerStatus?: string | null) {
  const receipt = body.memory_persistence;
  const status = cleanText(receipt?.status || headerStatus, 80).toUpperCase();
  if (!status || status === "NOT_APPLICABLE") return "";
  const sequence = Number(receipt?.result_sequence_no ?? receipt?.user_sequence_no ?? 0);
  const ref = sequence > 0 ? ` · #${sequence}` : "";
  const code = receipt?.failure_code ? ` · ${cleanText(receipt.failure_code, 100)}` : "";
  if (status === "SAVED") return `1LSS SAVED${ref}`;
  if (status === "SAVED_WITH_FAILURE") return `1LSS SAVED · TURN FAILURE RECORDED${ref}`;
  if (status === "USER_TURN_ONLY") return `1LSS USER TURN SAVED; RESULT NOT CONFIRMED${ref}${code}`;
  if (status === "UNAVAILABLE") return `1LSS UNAVAILABLE · NOT CONFIRMED${code}`;
  if (status === "FAILED" || status === "USER_TURN_NOT_CONFIRMED") return `1LSS ${status} · NOT CONFIRMED${code}`;
  if (status === "PARTIAL") return `1LSS PARTIAL · VERIFY HISTORY${ref}${code}`;
  return `1LSS ${status}${ref}${code}`;
}
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
  const composerDraft = useComposerDraft(Boolean(session?.authenticated));
  const draft = composerDraft.text;
  const attachments = composerDraft.attachments;
  const setDraft = composerDraft.store.setText.bind(composerDraft.store);
  const [sending, setSending] = useState(false);
  const [newAgentSession, setNewAgentSession] = useState(false);
  const [toolDock, setToolDock] = useState(false);
  const [capabilityQuery, setCapabilityQuery] = useState("");
  const [modelDock, setModelDock] = useState(false);
  const [newDock, setNewDock] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>("chat");
  const [selectedPstackId, setSelectedPstackId] = useState<string | null>(null);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("chat-api");
  const [d1Enabled, setD1Enabled] = useState(() => readBool(MEMORY_KEY, true));
  const [allowPaidFallback, setAllowPaidFallback] = useState(() => readBool(PAID_FALLBACK_KEY, false));
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() => readJson(CHAT_CONFIG_KEY, DEFAULT_CONFIG));
  const [inlineNotice, setInlineNotice] = useState("");
  const [manualDispatch, setManualDispatch] = useState<{ taskId: string; url: string } | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [speakingMessage, setSpeakingMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const composerInput = useRef<HTMLTextAreaElement | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const latestSequenceRef = useRef(0);
  const eventCursorRef = useRef(0);

  const liveTools = useMemo(() => new Map((dashboard.tools ?? []).map((tool) => [tool.id, tool])), [dashboard.tools]);
  const platformTools = useMemo(() => new Map((platform?.tools ?? []).map((tool) => [tool.id, tool])), [platform?.tools]);
  const providerModelIds = useMemo(() => new Set((platform?.models?.data ?? []).map((row) => String(row.id ?? ""))), [platform?.models?.data]);
  const availableModels = useMemo(() => {
    if (!providerModelIds.size) return MODEL_CANDIDATES.filter((item) => item.id === DEFAULT_CONFIG.model);
    const rows = MODEL_CANDIDATES.filter((item) => providerModelIds.has(item.id));
    return rows.length ? rows : MODEL_CANDIDATES.filter((item) => item.id === DEFAULT_CONFIG.model);
  }, [providerModelIds]);
  const selectedModel = availableModels.find((item) => item.id === chatConfig.model) ?? availableModels[0] ?? MODEL_CANDIDATES[0];
  const selectedPstackPreset = pstackWorkflows.workflows.find((item) => item.id === selectedPstackId) ?? null;
  const pools = dashboard.incentives?.pools ?? [];
  const exhausted = dashboard.incentives?.policy_state === "EXHAUSTED";
  const requiresOpenAI = !["manus", "live", "command"].includes(toolMode);
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
    latestSequenceRef.current = Math.max(latestSequenceRef.current, latest);
    eventCursorRef.current = Math.max(eventCursorRef.current, latest);
    setLatestSequence(latestSequenceRef.current);
    setHistoryHasMore(Boolean(body.has_more ?? (rows.length >= 60)));
    setMessages(rows.filter((row) => Number(row.sequence_no ?? 0) > floor));
  }, [d1Enabled, viewportFloor]);

  const poll1LSS = useCallback(async () => {
    if (!d1Enabled || !session?.authenticated || sending) return;
    const after = eventCursorRef.current;
    const response = await fetch(`/api/1lss/events?after_sequence=${after}&limit=40`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as { messages?: Message[]; latest_sequence?: number; cursor?: number };
    const rows = Array.isArray(body.messages) ? body.messages : [];
    const cursor = Math.max(
      after,
      Number(body.cursor ?? 0),
      ...rows.map((row) => Number(row.sequence_no ?? 0)),
    );
    if (cursor > eventCursorRef.current) eventCursorRef.current = cursor;
    if (cursor > latestSequenceRef.current) {
      latestSequenceRef.current = cursor;
      setLatestSequence(cursor);
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

  const loadBridgeStatus = useCallback(async () => {
    if (!d1Enabled || !session?.authenticated) return;
    const response = await fetch("/api/1lss/status", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({})) as BridgeStatus;
    if (body?.ok) setBridgeStatus(body);
  }, [d1Enabled, session?.authenticated]);

  useEffect(() => {
    if (!d1Enabled || !session?.authenticated) return;
    void loadBridgeStatus();
    const timer = window.setInterval(() => { void loadBridgeStatus(); }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadBridgeStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [d1Enabled, session?.authenticated, loadBridgeStatus]);

  async function registerSessionRef(ref = viewportSessionRef, sequenceNo = 0) {
    if (!d1Enabled || !ref) return;
    const response = await fetch("/api/1lss/sessions", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_surface: surface,
        session_ref: ref,
        session_url: `${window.location.origin}${window.location.pathname}`,
        label: surface === "ogenic-app" ? "WAVE App viewport" : "WAVE Web viewport",
        sequence_no: sequenceNo || undefined,
      }),
    });
    if (response.ok) await loadSessionRefs();
  }

  const heartbeatSessionRef = useCallback(async () => {
    if (!d1Enabled || !session?.authenticated || !viewportSessionRef) return;
    if (document.visibilityState !== "visible") return;
    await fetch("/api/1lss/sessions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_surface: surface,
        session_ref: viewportSessionRef,
        session_url: `${window.location.origin}${window.location.pathname}`,
        label: surface === "ogenic-app" ? "WAVE App viewport" : "WAVE Web viewport",
        sequence_no: latestSequenceRef.current || undefined,
      }),
    }).catch(() => undefined);
  }, [d1Enabled, session?.authenticated, surface, viewportSessionRef]);

  useEffect(() => {
    if (!d1Enabled || !session?.authenticated) return;
    void heartbeatSessionRef();
    const timer = window.setInterval(() => { void heartbeatSessionRef(); }, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void heartbeatSessionRef();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [d1Enabled, session?.authenticated, heartbeatSessionRef]);

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
    if (sending) return;
    setToolDock(false);
    try {
      await composerDraft.store.add(file);
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

  async function runHostedTools(prompt: string, hostedMode: "web" | "rag" | "auto" = toolMode === "rag" ? "rag" : "web") {
    if (!d1Enabled) throw new Error("Web/RAG tool ต้องเปิด D1 เพื่อคง 1LSS");
    const response = await fetch("/api/chat/functions", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": `hosted_${crypto.randomUUID()}` },
      body: JSON.stringify({ prompt, model: selectedModel.id, source_surface: surface, tool_mode: hostedMode, reasoning_effort: chatConfig.effort, allow_paid_fallback: allowPaidFallback }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
    await loadHistory();
  }

  async function runAgentAI(prompt: string) {
    if (!d1Enabled) throw new Error("Agent AI ต้องเปิด D1 เพื่อคง owner-main / 1LSS");
    const response = await fetch("/api/chat/agent", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `agent_${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        prompt,
        model: selectedModel.id,
        source_surface: surface,
        reasoning_effort: chatConfig.effort,
        allow_paid_fallback: allowPaidFallback,
        new_session: newAgentSession,
      }),
    });
    const body = await response.json().catch(() => ({})) as PersistedTurnResponse;
    const persistence = memoryPersistenceNotice(body, response.headers.get("X-OGENIC-1LSS-PERSISTENCE"));
    if (!response.ok || !body?.ok) {
      throw new Error([body?.message || body?.code || `HTTP_${response.status}`, persistence].filter(Boolean).join(" · "));
    }
    if (body.agent_session_id) {
      setNewAgentSession(false);
      const sessionNotice = `Agent Session · ${body.agent_session_id}${body.session_continuation ? " · continued" : " · new"}`;
      setInlineNotice([sessionNotice, persistence].filter(Boolean).join(" · "));
    } else if (persistence) {
      setInlineNotice(persistence);
    }
    await loadHistory();
  }

  // Explicit commands are written by the authenticated Owner, never guessed
  // from ordinary chat text or emitted by an LLM tool call.
  const ownerProtocol = (value: string) =>
    /^\/OG\.(MODES|STATUS|MODE|PROBE|RUN|EXECUTE|COMMAND)(?:\s+([\s\S]*))?$/i.exec(value.trim());

  async function runOwnerProtocol(kind: string, arg: string) {
    const command = kind.toUpperCase();
    if (command === "RUN" || command === "EXECUTE" || command === "COMMAND") {
      if (!arg.trim()) throw new Error("OG_COMMAND_TEXT_REQUIRED");
      return runWaveCommand(arg.trim());
    }
    if (command === "PROBE") {
      const match = /^((?:n8n)|(?:mcp))(?:\s+([a-z0-9_-]{1,80}))?$/i.exec(arg.trim());
      if (!match || (match[1].toLowerCase() === "mcp" && !match[2])) throw new Error("USAGE: /OG.PROBE n8n  or  /OG.PROBE mcp provider-id");
      const qs = new URLSearchParams({ mode: match[1].toLowerCase() });
      if (match[2]) qs.set("provider", match[2]);
      const response = await fetch("/api/connector-endpoint/v1/probe?" + qs.toString(), { credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      setMessages(rows => [...rows, { id: crypto.randomUUID(), role: "assistant", text: `/OG.PROBE ${arg} · HTTP ${response.status} · ${String(body.state ?? body.code ?? (body.ok ? "PASS" : "NOT_VERIFIED"))} · E2E execution not implied`, created_at: Date.now() }]);
      return;
    }
    const response = await fetch("/api/connector-modes/status?probe=1", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; code?: string; modes?: Array<{ mode?: string; runtime_status?: string; missing_bindings?: string[]; e2e_evidence?: string }> };
    if (!response.ok || !data.ok || !Array.isArray(data.modes)) throw new Error(data.code || `MODES_HTTP_${response.status}`);
    const rows = command === "MODE" ? data.modes.filter(x => x.mode?.toLowerCase() === arg.toLowerCase().replace(/[ -]+/g, "_")) : data.modes;
    if (command === "MODE" && rows.length !== 1) throw new Error("MODE_NOT_FOUND · /OG.MODES to list all 15");
    const lines = rows.map((row, i) => `${command === "MODE" ? "" : `${i+1}. `}${row.mode}: ${row.runtime_status ?? "NOT_VERIFIED"}${row.missing_bindings?.length ? " · missing " + row.missing_bindings.join(", ") : ""} · ${row.e2e_evidence ?? "NO_LIVE_RECEIPT"}`);
    setMessages(rows => [...rows, { id: crypto.randomUUID(), role: "assistant", text: `OGENIC CCS · ${data.modes?.length ?? 0} modes · source/credential and execution status are separate\n${lines.join("\n")}`, created_at: Date.now() }]);
  }

  async function runWaveCommand(prompt: string) {
    const response = await fetch("/api/wave/command", {
      method: "POST", credentials: "same-origin", headers: {
        "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        command: prompt, mode: "autonomous", environment: "staging",
        capability: "codex_selfhost", provider: "openai",
      }),
    });
    const body = await response.json().catch(() => ({})) as {
      ok?: boolean; code?: string; message?: string;
      task?: { id?: string; status?: string };
      dispatch?: { task_id?: string; workflow_url?: string };
      run_id?: string; verification?: { status?: string };
    };
    if (!response.ok || !body.ok) throw new Error(body.message || body.code || `HTTP_${response.status}`);
    if (body.code === "COMMAND_MANUAL_DISPATCH_REQUIRED" && body.dispatch?.task_id && body.dispatch?.workflow_url) {
      setManualDispatch({ taskId: body.dispatch.task_id, url: body.dispatch.workflow_url });
      setMessages(rows => [...rows, { id: crypto.randomUUID(), role: "assistant",
        text: "งานบันทึกใน D1 แล้ว แต่การเรียก GitHub Actions อัตโนมัติถูกปฏิเสธ · เปิด Workflow แล้วเลือก Staging พร้อม Task ID · รอผล Runner-1 จริง",
        created_at: Date.now() }]);
      setInlineNotice("รอ GitHub Workflow Dispatch · ยังไม่ใช่ DONE");
      return;
    }
    setManualDispatch(null);
    const dispatched = body.code === "COMMAND_DISPATCHED" || body.code === "COMMAND_ALREADY_QUEUED";
    const text = dispatched
      ? `Owner Session authorized · ${body.code === "COMMAND_DISPATCHED" ? "DISPATCHED" : "QUEUED"} · task ${body.task?.id || "unknown"} · รอ Runner-1 และ COMMAND_RESULT`
      : `Owner Session authorized · ${body.verification?.status || "verified"} · run ${body.run_id || "n/a"}`;
    setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text, created_at: Date.now() }]);
    setInlineNotice(dispatched ? "ส่งงานแล้ว · ยังไม่ใช่ DONE · รอ COMMAND_RESULT" : "คำสั่งสำเร็จผ่าน Yellow Stone");
  }

  async function runChat(prompt: string) {
    const sentDraft = composerDraft.store.getSnapshot();
    const endpoint = d1Enabled ? "/api/chat/model" : "/api/chat/ephemeral";
    const response = await fetch(endpoint, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `${surface}_${crypto.randomUUID()}` },
      body: JSON.stringify({
        prompt,
        attachment_ids: d1Enabled ? sentDraft.attachments.map((item) => item.uploaded!.id) : [],
        model: selectedModel.id,
        reasoning_effort: chatConfig.effort,
        token_boost: chatConfig.boost,
        source_surface: surface,
        session_ref: viewportSessionRef,
        session_url: `${window.location.origin}${window.location.pathname}`,
        session_label: surface === "ogenic-app" ? "WAVE App viewport" : "WAVE Web viewport",
        allow_paid_fallback: allowPaidFallback,
      }),
    });
    const body = await response.json().catch(() => ({})) as PersistedTurnResponse & { id?: string };
    if (body?.code === "ATTACHMENT_NOT_FOUND") composerDraft.store.unavailable(body.id);
    const persistence = memoryPersistenceNotice(body, response.headers.get("X-OGENIC-1LSS-PERSISTENCE"));
    if (!response.ok || !body?.ok) {
      throw new Error([body?.message || body?.code || `HTTP_${response.status}`, persistence].filter(Boolean).join(" · "));
    }
    composerDraft.store.consume(sentDraft.text, sentDraft.attachments.map(item => item.localId));
    if (d1Enabled) await loadHistory();
    else setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text: body.text, model: body.model, created_at: Date.now() }]);
    if (persistence) setInlineNotice(persistence);
  }

  function messageActionKey(message: Message, index: number) {
    return String(message.id || message.sequence_no || `message-${index}`);
  }

  async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const node = document.createElement("textarea");
    node.value = value;
    node.setAttribute("readonly", "");
    node.style.position = "fixed";
    node.style.opacity = "0";
    document.body.appendChild(node);
    node.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(node);
    if (!copied) throw new Error("Clipboard unavailable");
  }

  async function recordMessageAction(message: Message, index: number, action: "REACTION" | "FEEDBACK" | "RETRY_REQUESTED" | "EVIDENCE_OPENED", value = "") {
    const response = await fetch("/api/chat/message-action", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `msg_action_${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        action,
        value,
        message_id: message.id || messageActionKey(message, index),
        sequence_no: message.sequence_no || undefined,
        source_surface: message.source_surface || surface,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
  }

  async function copyMessage(message: Message) {
    const text = cleanText(message.text, 20_000);
    if (!text) return;
    await copyText(text);
    setInlineNotice("Copied message");
  }

  async function shareMessage(message: Message) {
    const text = cleanText(message.text, 20_000);
    if (!text) return;
    if (navigator.share) {
      await navigator.share({ title: "WAVE", text });
      setInlineNotice("Shared message");
      return;
    }
    await copyText(text);
    setInlineNotice("Share unavailable here · copied instead");
  }

  function readMessage(message: Message, index: number) {
    const key = messageActionKey(message, index);
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setInlineNotice("Read Aloud unavailable in this browser");
      return;
    }
    if (speakingMessage === key) {
      window.speechSynthesis.cancel();
      setSpeakingMessage(null);
      setInlineNotice("Read Aloud stopped");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText(message.text, 20_000));
    utterance.onend = () => setSpeakingMessage((current) => current === key ? null : current);
    utterance.onerror = () => setSpeakingMessage((current) => current === key ? null : current);
    setSpeakingMessage(key);
    window.speechSynthesis.speak(utterance);
  }

  async function retryMessage(message: Message, index: number) {
    const priorUser = [...messages.slice(0, index)].reverse().find((row) => row.role === "user" && cleanText(row.text));
    if (!priorUser?.text) {
      setInlineNotice("No preceding user prompt available to retry");
      return;
    }
    await recordMessageAction(message, index, "RETRY_REQUESTED", "QUEUED");
    setDraft(priorUser.text);
    setToolMode("chat");
    setActiveMessageMenu(null);
    setInlineNotice("Retry queued in composer · review and Send when ready");
    window.setTimeout(() => composerInput.current?.focus(), 0);
  }

  async function reactToMessage(message: Message, index: number, value: "👍" | "👎" | "❤️" | "🔥") {
    await recordMessageAction(message, index, "REACTION", value);
    setActiveMessageMenu(null);
    setInlineNotice(`Reaction ${value} saved as reference-only evidence`);
  }

  async function feedbackMessage(message: Message, index: number, value: "HELPFUL" | "NEEDS_WORK") {
    await recordMessageAction(message, index, "FEEDBACK", value);
    setActiveMessageMenu(null);
    setInlineNotice(value === "HELPFUL" ? "Feedback saved · helpful" : "Feedback saved · needs work");
  }

  async function openMessageEvidence(message: Message, index: number) {
    await recordMessageAction(message, index, "EVIDENCE_OPENED", "OPENED");
    const source = parseUrl(cleanText(message.text, 20_000));
    if (source) {
      try {
        const url = new URL(source);
        if (url.protocol === "https:" || url.protocol === "http:") {
          window.open(url.toString(), "_blank", "noopener,noreferrer");
          return;
        }
      } catch { /* fall through to canonical run surface */ }
    }
    const sequence = Number(message.sequence_no ?? 0);
    window.location.assign(`/overview?tab=run${sequence ? `&sequence=${sequence}` : ""}`);
  }

  async function send() {
    const prompt = draft.trim() || (attachments.length ? "วิเคราะห์ไฟล์ที่แนบมา" : "");
    if (!prompt || sending) return;
    // OGE-109: @pstack is a WAVE LOCAL workflow picker, not a model/tool request.
    // No billing, no D1 turn, no external call until the owner chooses and explicitly sends.
    const pstackCommand = !attachments.length && prompt.match(/^[@/]pstack(?:\s+([\s\S]*))?$/i);
    if (pstackCommand) {
      const args = (pstackCommand[1] || "").trim();
      const subcommand = args.match(/^([a-z-]+)(?:\s+([\s\S]+))?$/i);
      const preset = pstackWorkflows.workflows.find((item) => item.id === subcommand?.[1]?.toLowerCase());
      if (preset) {
        setSelectedPstackId(preset.id);
        setDraft(withoutPstackTemplates(subcommand?.[2]?.trim() || ""));
        setToolMode("chat");
        setToolDock(false);
        setModelDock(false);
        setInlineNotice(`pstack ${preset.title} selected. Type ONE specific task, then press Send. No Agent has been called yet.`);
      } else {
        setSelectedPstackId(null);
        setDraft(args);
        setCapabilityQuery("pstack");
        setToolDock(true);
        setModelDock(false);
        setInlineNotice("pstack picker opened. Select one workflow, then describe your task; nothing has been sent.");
      }
      return;
    }
    // Old iPhone drafts may still contain several exact pstack template bodies from pre-fix UI.
    // Intercept locally instead of consuming ATHENA's bounded tool loop on a task-less prompt.
    if (!selectedPstackPreset && !attachments.length &&
      pstackWorkflows.workflows.some((preset) => prompt.includes(preset.prompt))) {
      setDraft(withoutPstackTemplates(prompt));
      setCapabilityQuery("pstack");
      setToolDock(true);
      setModelDock(false);
      setInlineNotice("Old stacked pstack prompts removed. Select ONE workflow and type one task; no Agent was called.");
      return;
    }
    const pstackTask = selectedPstackPreset ? withoutPstackTemplates(draft) : "";
    if (selectedPstackPreset && !pstackTask) {
      setInlineNotice(`pstack ${selectedPstackPreset.title} selected · พิมพ์โจทย์งานก่อนกด Send เพื่อไม่ให้ AI วนเรียกเครื่องมือ`);
      return;
    }
    const ogMatch = !attachments.length ? ownerProtocol(prompt) : null;
    const explicitOwnerRoute = Boolean(ogMatch);
    const effectivePrompt = selectedPstackPreset
      ? selectedPstackPreset.prompt + "\n\nUSER TASK:\n" + pstackTask
      : prompt;
    if (!composerDraft.ready) { setInlineNotice("กำลังอ่าน draft · รอสักครู่"); return; }
    if (attachments.some(row => row.status !== "uploaded")) { setInlineNotice("รอ upload ให้ครบ หรือ retry/เอาไฟล์ที่ล้มเหลวออกก่อนส่ง"); return; }
    if (attachments.length && (toolMode !== "chat" || experienceMode !== "chat-api")) { setInlineNotice("โหมดนี้ยังไม่รับไฟล์แนบ · เลือก WAVE Chat ก่อนส่ง ไฟล์ยังอยู่ครบ"); return; }
    if (quotaBlocked && !explicitOwnerRoute) { setInlineNotice("Included quota หมด · เลือก API fallback ก่อน กูจะไม่เผา token เอง"); return; }
    if (experienceMode === "agent-ai" && !d1Enabled) {
      setInlineNotice("Agent AI ต้องใช้ owner-main / 1LSS");
      return;
    }
    if (!d1Enabled && attachments.length) { setInlineNotice("ไฟล์แนบต้องใช้ D1; เปิด D1 หรือเอาไฟล์ออกก่อน"); return; }
    setSending(true);
    setInlineNotice("");
    const sentText = draft;
    setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "user", text: selectedPstackPreset ? `pstack · ${selectedPstackPreset.title}: ${pstackTask}` : prompt, created_at: Date.now(), source_surface: surface }]);
    try {
      if (ogMatch) await runOwnerProtocol(ogMatch[1], (ogMatch[2] || "").trim());
      else if (toolMode === "command") await runWaveCommand(effectivePrompt);
      else if (toolMode === "manus") await runManus(effectivePrompt);
      else if (toolMode === "live") await runLiveDoor(effectivePrompt);
      else if (toolMode === "github" || toolMode === "linear" || toolMode === "n8n" || toolMode === "meta") await runInlineTool(toolMode, effectivePrompt);
      else if (toolMode === "web" || toolMode === "rag") await runHostedTools(effectivePrompt);
      else if (experienceMode === "agent-ai") await runAgentAI(effectivePrompt);
      else await runChat(effectivePrompt);
      composerDraft.store.consume(sentText, []);
      if (selectedPstackPreset) setSelectedPstackId(null);
      await loadRuntime();
    } catch (error) {
      setInlineNotice(error instanceof Error ? error.message : "Request failed · draft retained");
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
    setToolMode("chat");
    setNewAgentSession(true);
    setNewDock(false);
    setInlineNotice(memory ? `New viewport · D1 ต่อจาก #${latestSequence} · next Agent turn starts a new provider session` : "New ephemeral chat · D1 off");
  }

  function selectExperience(next: ExperienceMode) {
    setExperienceMode(next);
    setToolMode("chat");
    setToolDock(false);
    setModelDock(false);
    if (next === "agent-ai") {
      setD1Enabled(true);
      setInlineNotice("Agent AI · OpenAI Agent Session · owner-main / 1LSS");
    } else {
      setInlineNotice("SAME MIND · OpenAI Responses API · owner-main / 1LSS");
    }
  }

  if (session === null) return <main className="ucSplash"><img src="/assets/wave-logo.webp" alt="" /><b>WAVE — SAME MIND</b><span>Joining 1LSS…</span></main>;
  if (!session.authenticated) return <main className="ucAuth"><section><img src="/assets/wave-logo.webp" alt="" /><small>OWNER ACCESS</small><h1>WAVE — SAME MIND</h1><p>One clean chat · one canonical line.</p><input type="password" value={ownerKey} onChange={(event) => setOwnerKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void signIn(); }} placeholder="Owner access key" /><button onClick={() => void signIn()}>Continue</button>{authError && <em>{authError}</em>}</section></main>;

  const toolRows: Array<{ id: ToolMode; label: string; sub: string; live: boolean; state: string }> = [
    { id: "command", label: "WAVE Command", sub: "Signed Owner Session → Yellow → Runner-1", live: true, state: "GUARDED" },
    { id: "web", label: "Web search", sub: "Fresh web sources", live: toolLive(platformTools.get("web_search")?.state), state: String(platformTools.get("web_search")?.state || "NOT_MEASURED") },
    { id: "rag", label: "RAG memory", sub: "OGENIC HARNESS · D1 canonical · 1LSS", live: toolLive(platformTools.get("d1_canonical")?.state) || toolLive(platformTools.get("file_search")?.state), state: String(platformTools.get("d1_canonical")?.state || platformTools.get("file_search")?.state || "NOT_MEASURED") },
    { id: "github", label: "GitHub", sub: liveTools.get("github")?.summary || "Repository + CI", live: toolLive(liveTools.get("github")?.state), state: String(liveTools.get("github")?.state || "NOT_MEASURED") },
    { id: "linear", label: "Linear", sub: liveTools.get("linear")?.summary || "Issues + projects", live: toolLive(liveTools.get("linear")?.state), state: String(liveTools.get("linear")?.state || "NOT_MEASURED") },
    { id: "n8n", label: "n8n", sub: liveTools.get("n8n")?.summary || "Workflows", live: toolLive(liveTools.get("n8n")?.state), state: String(liveTools.get("n8n")?.state || "NOT_MEASURED") },
    { id: "meta", label: "Meta Facebook", sub: liveTools.get("meta")?.summary || "Facebook Page · Messenger · Instagram optional", live: toolLive(liveTools.get("meta")?.state), state: String(liveTools.get("meta")?.state || "NOT_MEASURED") },
    { id: "manus", label: "Manus", sub: "Delegate a task", live: toolLive(manus?.state) || manus?.configured === true, state: String(manus?.state || (manus?.configured ? "CONFIGURED" : "NOT_MEASURED")) },
    { id: "live", label: "Live door", sub: "Browser quota · stop before secrets", live: toolLive(browser?.state), state: String(browser?.state || "NOT_MEASURED") },
  ];
  const normalizedCapabilityQuery = capabilityQuery.trim().toLowerCase();
  const matchesCapabilityQuery = (label: string, sub = "") =>
    !normalizedCapabilityQuery || `${label} ${sub}`.toLowerCase().includes(normalizedCapabilityQuery);
  const visibleTools = toolRows.filter((row) => row.live && matchesCapabilityQuery(row.label, row.sub));
  const visiblePstackPresets = pstackWorkflows.workflows.filter((row) => matchesCapabilityQuery(`pstack ${row.title}`, row.description));
  const visibleConnectorStates = connectors
    .filter((row) => matchesCapabilityQuery(row.label, `${row.kind || ""} ${row.summary || ""}`))
    .slice(0, 12);
  const connected = connectors.filter((row) => toolLive(row.state)).slice(0, 8);
  const webBridge = bridgeStatus?.surfaces?.find((row) => row.source_surface === "ogenic-web");
  const appBridge = bridgeStatus?.surfaces?.find((row) => row.source_surface === "ogenic-app");
  const webReady = Boolean(webBridge?.fresh && webBridge?.persisted && webBridge?.caught_up_to_pair_latest);
  const appReady = Boolean(appBridge?.fresh && appBridge?.persisted && appBridge?.caught_up_to_pair_latest);
  const bridgeLabel = bridgeStatus?.cross_surface_ready
    ? `WEB✓#${webBridge?.door_last_sequence || "?"} · APP✓#${appBridge?.door_last_sequence || "?"}`
    : `WEB${webReady ? "✓" : "○"} · APP${appReady ? "✓" : "○"}`;

  return <main className="ucShell">
    <input ref={fileInput} type="file" className="ucHidden" accept="image/*,.pdf,.txt,.md,.csv,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />

    <header className="ucTopbar">
      <button className="ucBrand" onClick={() => setNewDock((value) => !value)}><img src="/assets/wave-logo.webp" alt="" /><span><b>WAVE</b><small>{surface === "ogenic-app" ? "SAME MIND · APP" : "SAME MIND · WEB"}</small></span></button>
      <div className="ucLineState"><b>1LSS #{String(latestSequence).padStart(4, "0")}</b><span className={d1Enabled ? "on" : "off"}>D1 {d1Enabled ? "●" : "○"}</span><span>LIVE ≤3s</span></div>
      <a className="ucWeb" href="/overview" aria-label="Open WAVE Dashboard">DASHBOARD ↗</a>
      <button className="ucNew" onClick={() => setNewDock((value) => !value)}>＋ New</button>
      {newDock && <section className="ucNewDock"><strong>New chat viewport</strong><p>เส้นชีวิตไม่แตก ถ้าเปิด D1 จะต่อ owner-main หลังบ้าน</p><label><input type="checkbox" checked={d1Enabled} onChange={(event) => setD1Enabled(event.target.checked)} /> D1 · 1LSS Memory</label><div><button onClick={() => startNew(d1Enabled)}>Start</button><button className="ghost" onClick={() => void loadOlder()}>Load older</button><button className="ghost" onClick={() => setNewDock(false)}>Cancel</button></div>{!!sessionRefs.length && <div className="ucConnected"><small>RECENT DOORS</small><p>{sessionRefs.slice(0, 5).map((row) => `${row.label || row.source_surface} #${row.last_sequence || "?"}`).join(" · ")}</p><div>{sessionRefs.slice(0, 5).map((row) => <button key={row.id} className="ghost" onClick={() => void openKnownSession(row)}>{row.source_surface} · #{row.last_sequence || "?"}</button>)}</div></div>}</section>}
    </header>

    <section className="ucConversation">
      {historyHasMore && <button className="ghost" onClick={() => void loadOlder()}>↑ Load older 1LSS</button>}
      {!messages.length && <div className="ucWelcome"><div className="ucOrb"><i /></div><small>WAVE · SAME MIND</small><h1>What are we doing next?</h1><p>Powered by OGENIC HARNESS · capability · 1LSS — one canonical line.</p></div>}
      {messages.map((message, index) => {
        const actionKey = messageActionKey(message, index);
        const assistantMessage = message.role === "assistant";
        return <article key={message.id || index} className={`ucMessage ${message.role || "assistant"}`}>
          <div className="ucMessageMeta"><b>{message.role === "user" ? "YOU" : message.role === "system" ? "SYSTEM" : "WAVE"}</b><span title={message.created_at ? new Date(message.created_at).toLocaleString() : undefined}>{message.sequence_no ? `#${message.sequence_no}` : ""}{message.source_surface ? ` · ${message.source_surface}` : ""}{message.created_at ? ` · ${timeAgo(message.created_at)}` : ""}</span></div>
          <p>{message.text}</p>
          {message.model && <small>{message.model}</small>}
          {assistantMessage && <div className="ucMessageActions" aria-label="Message actions">
            <button onClick={() => void copyMessage(message)}>Copy</button>
            <button onClick={() => void shareMessage(message)}>Share</button>
            <button onClick={() => readMessage(message, index)}>{speakingMessage === actionKey ? "Stop" : "Listen"}</button>
            <button onClick={() => void retryMessage(message, index)}>Retry</button>
            <button onClick={() => void openMessageEvidence(message, index)}>Evidence</button>
            <button aria-expanded={activeMessageMenu === actionKey} onClick={() => setActiveMessageMenu((current) => current === actionKey ? null : actionKey)}>More</button>
            {activeMessageMenu === actionKey && <div className="ucMessageMore">
              <small>REACTION</small>
              <div>
                {(["👍", "👎", "❤️", "🔥"] as const).map((reaction) => <button key={reaction} aria-label={`React ${reaction}`} onClick={() => void reactToMessage(message, index, reaction)}>{reaction}</button>)}
              </div>
              <small>FEEDBACK</small>
              <button onClick={() => void feedbackMessage(message, index, "HELPFUL")}>Helpful</button>
              <button onClick={() => void feedbackMessage(message, index, "NEEDS_WORK")}>Needs work</button>
            </div>}
          </div>}
        </article>;
      })}
      {sending && <article className="ucMessage assistant"><div className="ucMessageMeta"><b>AMMONITE</b><span>working</span></div><p className="ucThinking">•••</p></article>}
      <div ref={chatEnd} />
    </section>

    <footer className="ucComposerWrap">
      {(toolDock || modelDock) && <section className="ucDock">
        {toolDock && <>
          <div className="ucDockHead"><div><b>Capabilities</b><small>Live execution only · other states are read-only status</small></div><button onClick={() => setToolDock(false)}>×</button></div>
          <input className="ucCapabilitySearch" value={capabilityQuery} onChange={(event) => setCapabilityQuery(event.target.value)} placeholder="Search capabilities…" aria-label="Search capabilities" />
          <div className="ucCapabilityNav">
            <a href="/overview?tab=connections">Manage Connections</a>
            <a href="/agents">Agents</a>
            <a href="/overview?tab=run">Runtime</a>
          </div>
          <div className="ucMemoryRow"><span><b>D1 · 1LSS</b><small>{d1Enabled ? "Canonical memory ON" : "Ephemeral · no memory write"}</small></span><button className={d1Enabled ? "toggle on" : "toggle"} disabled={experienceMode === "agent-ai"} aria-label={experienceMode === "agent-ai" ? "Agent AI requires 1LSS memory" : "Toggle 1LSS memory"} onClick={() => setD1Enabled((value) => !value)}><i /></button></div>
          <button className="ucCapability" onClick={() => fileInput.current?.click()}><span>▧</span><div><b>Photos & files</b><small>Attach to this turn</small></div><em>＋</em></button>
          {!!visiblePstackPresets.length && <section className="ucPstackPresets" aria-label="pstack workflow presets">
            <div className="ucDockHead"><div><b>pstack · guided workflows</b><small>MIT patterns · draft only · Cursor plugin not installed</small></div></div>
            {visiblePstackPresets.map((preset) => <button key={preset.id} type="button" className="ucCapability" onClick={() => {
              setSelectedPstackId(preset.id);
              setDraft(withoutPstackTemplates(draft));
              setToolMode("chat");
              setToolDock(false);
              setInlineNotice(`pstack ${preset.title} selected. Type one task; No Agent has been called yet.`);
            }}><span>◇</span><div><b>{preset.title}</b><small>{preset.description} · DRAFT ONLY</small></div><em>＋</em></button>)}
          </section>}
          {visibleTools.map((row) => <button key={row.id} className={`ucCapability ${toolMode === row.id ? "active" : ""}`} onClick={() => { setToolMode(row.id); setToolDock(false); }}><span>{row.id === "live" ? "◎" : row.id === "manus" ? "◉" : row.id === "github" ? "⌘" : row.id === "rag" ? "◇" : "✦"}</span><div><b>{row.label}</b><small>{row.sub} · {row.state}</small></div><em>{toolMode === row.id ? "✓" : "›"}</em></button>)}
          {!visibleTools.length && !visiblePstackPresets.length && <div className="ucCapabilityEmpty">No matching executable tool or pstack prompt preset.</div>}
          {!!visibleConnectorStates.length && <div className="ucConnectorStates"><small>CONNECTION STATES</small>{visibleConnectorStates.map((row) => <div key={row.id}><span><b>{row.label}</b><em>{row.kind || "connector"}</em></span><strong>{String(row.state || "NOT_MEASURED").toUpperCase()}</strong></div>)}</div>}
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
      {selectedPstackPreset && <div className="ucActiveTool"><span>pstack · {selectedPstackPreset.title} · add your task</span><button type="button" aria-label="Clear pstack selection" onClick={() => setSelectedPstackId(null)}>×</button></div>}
      <ComposerAttachments rows={attachments} store={composerDraft.store} disabled={sending} />
      {composerDraft.persistenceError && <div className="ucNotice" role="alert">{composerDraft.persistenceError}</div>}
      {inlineNotice && <div className="ucNotice" role="status" aria-live="polite">{inlineNotice}</div>}
      {manualDispatch && <div className="ucQuotaWarn" role="status">
        <b>GitHub Runner-1 · เรียกด้วย Owner</b>
        <span>Staging Workflow ต้องใส่ Task ID: {manualDispatch.taskId}</span>
        <a href={manualDispatch.url} target="_blank" rel="noreferrer">เปิด GitHub Actions →</a>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(manualDispatch.taskId).catch(() => {})}>Copy Task ID</button>
      </div>}
      {quotaBlocked && toolMode !== "command" && <div className="ucQuotaWarn"><b>Guarded quota หมด</b><span>Paid fallback ปิดอยู่ กูจะไม่ข้าม guard เอง</span><button onClick={() => setAllowPaidFallback(true)}>Allow paid fallback</button></div>}
      <div className="ucExperience" role="group" aria-label="Owner command control">
        <button type="button" aria-pressed={toolMode === "command"} className={toolMode === "command" ? "active" : ""}
          onClick={() => { setToolMode(current => current === "command" ? "chat" : "command"); setToolDock(false); }}>
          <b>{toolMode === "command" ? "OWNER RUN · ON" : "OWNER RUN"}</b>
          <small>Signed Owner → Yellow → Runner-1 · no repeat confirmation</small>
        </button>
        <button type="button" onClick={() => { setDraft("/OG.MODES"); composerInput.current?.focus(); }}>
          <b>15 CCS MODES</b><small>Live discovery · type /OG.MODES</small>
        </button>
      </div>
      <div className="ucExperience" role="group" aria-label="Chat mode">
        {EXPERIENCE_MODES.map((item) => <button key={item.id} className={experienceMode === item.id ? "active" : ""} aria-pressed={experienceMode === item.id} onClick={() => selectExperience(item.id)}><b>{item.label}</b><small>{item.state}</small></button>)}
      </div>
      <section className="ucComposer">
        <textarea ref={composerInput} rows={1} disabled={!composerDraft.ready} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={selectedPstackPreset ? "พิมพ์โจทย์งานให้ pstack หนึ่งงาน…" : toolMode === "command" ? "พิมพ์คำสั่งแล้วส่งได้เลย · Signed Owner Session…" : toolMode === "live" ? "วาง URL + บอกว่าจะเข้าไปทำอะไร…" : toolMode === "manus" ? "ส่งงานให้ Manus…" : experienceMode === "agent-ai" ? "Message Agent AI on owner-main…" : "Message WAVE…"} />
        <div className="ucComposerBar">
          <button className="ucRound" onClick={() => { setToolDock((value) => !value); setModelDock(false); }}>＋</button>
          <button className="ucModel" onClick={() => { setModelDock((value) => !value); setToolDock(false); }}><i /> <b>{selectedModel.label}</b><small>{EFFORTS.find((row) => row.id === chatConfig.effort)?.label} · ×{chatConfig.boost}</small>⌄</button>
          <div className="ucQuotaMini">{pools.length ? <>{pools[0]?.state === "EXHAUSTED" ? (allowPaidFallback ? "Fallback ON" : "Guarded") : quotaMetered ? "Metered" : "Guarded"}</> : "Guarded"}</div>
          <button className="ucSend" aria-label="Send message" disabled={sending || !composerDraft.ready || attachments.some(row => row.status !== "uploaded") || (!draft.trim() && !attachments.length)} onClick={() => void send()}>{sending ? "…" : "↑"}</button>
        </div>
      </section>
      <div className="ucFooterLine"><span>{d1Enabled ? `WAVE · OGENIC HARNESS · 1LSS · ${bridgeLabel} · next #${latestSequence + 1}` : "ephemeral · D1 off"}</span><button onClick={() => { void loadRuntime(); void loadBridgeStatus(); }}>↻</button><button onClick={() => void signOut()}>Sign out</button></div>
    </footer>
  </main>;
}
