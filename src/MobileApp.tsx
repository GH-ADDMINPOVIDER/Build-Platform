import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tab = "chat" | "tasks" | "live" | "connect" | "rag";
type Theme = "light" | "dark";
type Sheet = null | "menu" | "model" | "add" | "task" | "settings";
type ModelId = "gpt-5.6-terra" | "gpt-5.6-luna" | "gpt-5.6-sol" | "gpt-4.1-mini" | "gpt-6-astra";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type Boost = 1 | 10 | 20;

type Session = { authenticated?: boolean; user?: { label?: string; role?: string } | null };
type Task = { id: string; title: string; status: string; priority?: number; capability?: string | null };
type Tool = { id: string; label: string; state: string; summary?: string };
type Dashboard = { tasks?: Task[]; tools?: Tool[]; runtime?: { provider?: string; branch?: string }; run_counts?: Array<{ status: string; count: number }> };
type MemoryMessage = { id?: string; role?: string; text?: string; model?: string | null; created_at?: number };
type Connector = { id: string; label: string; state: string; summary?: string; route_mode?: string; kind?: string };
type Platform = {
  api_key_state?: string;
  models?: { count?: number; state?: string };
  files?: { count?: number; state?: string };
  vector_stores?: { count?: number; state?: string; knowledge_store_id?: string | null };
  tools?: Array<{ id: string; label: string; state: string; note?: string }>;
};
type BrowserBridge = { ok?: boolean; state?: string; provider?: string; live_view?: boolean; human_in_the_loop?: boolean };
type ManusState = { ok?: boolean; configured?: boolean; state?: string };
type Attachment = { id: string; filename: string; mime_type: string; size_bytes: number };

type ChatConfig = { model: ModelId; effort: Effort; boost: Boost };

const THEME_KEY = "ogenic.mobile.theme.v1";
const CHAT_KEY = "ogenic.chat.model-config.v1";
const DEFAULT_CHAT: ChatConfig = { model: "gpt-5.6-sol", effort: "medium", boost: 1 };
const MODELS: Array<{ id: ModelId; label: string; sub: string; tone: string }> = [
  { id: "gpt-5.6-terra", label: "Terra", sub: "Most capable", tone: "terra" },
  { id: "gpt-5.6-luna", label: "Luna", sub: "Creative", tone: "luna" },
  { id: "gpt-5.6-sol", label: "Sol", sub: "Fast + smart", tone: "sol" },
  { id: "gpt-4.1-mini", label: "4.1 mini", sub: "Efficient", tone: "mini" },
  { id: "gpt-6-astra", label: "Austra", sub: "Reasoning", tone: "astra" },
];
const EFFORTS: Array<{ id: Effort; label: string }> = [
  { id: "low", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Max High" },
  { id: "max", label: "Max" },
];
const APP_LINKS = [
  { label: "GitHub", sub: "Build-Platform", domain: "github.com", url: "https://github.com/Wave-Runner-2/Build-Platform" },
  { label: "OpenAI", sub: "Platform", domain: "platform.openai.com", url: "https://platform.openai.com" },
  { label: "Linear", sub: "Tasks", domain: "linear.app", url: "https://linear.app/ogenic-sio" },
  { label: "Notion", sub: "Knowledge", domain: "notion.so", url: "https://www.notion.so" },
  { label: "Cloudflare", sub: "Workers · D1", domain: "cloudflare.com", url: "https://dash.cloudflare.com" },
  { label: "Figma", sub: "Design", domain: "figma.com", url: "https://www.figma.com" },
  { label: "Manus", sub: "Agent workspace", domain: "manus.im", url: "https://manus.im/app" },
  { label: "Gmail", sub: "Mail", domain: "mail.google.com", url: "https://mail.google.com" },
];

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* noop */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function readChatConfig(): ChatConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_KEY) || "null") as Partial<ChatConfig> | null;
    const model = MODELS.some((item) => item.id === raw?.model) ? raw!.model! : DEFAULT_CHAT.model;
    const effort = EFFORTS.some((item) => item.id === raw?.effort) ? raw!.effort! : DEFAULT_CHAT.effort;
    const boost = raw?.boost === 10 || raw?.boost === 20 ? raw.boost : 1;
    return { model, effort, boost };
  } catch { return DEFAULT_CHAT; }
}
function stateTone(state = "") {
  const value = state.toUpperCase();
  if (["LIVE", "BOUND", "CONFIGURED", "READY", "DONE", "OPERATIONAL", "SUCCESS"].includes(value)) return "good";
  if (["ERROR", "FAILED", "BLOCKED", "TOKEN_INVALID"].includes(value)) return "bad";
  if (["RUNNING", "QUEUED", "CLAIMED", "VERIFYING", "APPROVAL_REQUIRED", "HUMAN_APPROVAL_REQUIRED"].includes(value)) return "warn";
  return "quiet";
}
function ago(ts?: number) {
  if (!ts) return "";
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}
function favicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

export default function MobileApp() {
  const [tab, setTab] = useState<Tab>("chat");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [browser, setBrowser] = useState<BrowserBridge | null>(null);
  const [manus, setManus] = useState<ManusState | null>(null);
  const [memory, setMemory] = useState<MemoryMessage[]>([]);
  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(readChatConfig);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadState, setUploadState] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskState, setTaskState] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [liveState, setLiveState] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  const modelMeta = useMemo(() => MODELS.find((item) => item.id === chatConfig.model) || MODELS[2], [chatConfig.model]);
  const activeTasks = useMemo(() => (dashboard.tasks || []).filter((task) => !["DONE", "COMPLETED", "FAILED", "CANCELLED"].includes(task.status.toUpperCase())), [dashboard.tasks]);
  const completedTasks = useMemo(() => (dashboard.tasks || []).filter((task) => ["DONE", "COMPLETED"].includes(task.status.toUpperCase())), [dashboard.tasks]);
  const liveTools = useMemo(() => (dashboard.tools || []).filter((tool) => tool.state === "LIVE"), [dashboard.tools]);
  const readyConnectors = useMemo(() => connectors.filter((item) => ["LIVE", "CONFIGURED", "BOUND"].includes(item.state.toUpperCase())), [connectors]);

  useEffect(() => {
    document.documentElement.dataset.ogenicMobileTheme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ }
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatConfig)); } catch { /* noop */ }
  }, [chatConfig]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  const loadAll = useCallback(async () => {
    setSyncing(true);
    try {
      const [dashR, conR, platformR, memoryR, browserR, manusR] = await Promise.all([
        fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/connectors", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/openai/platform", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/chat/history", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/browser-session", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/manus/status", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (dashR.status === 401) { setSession({ authenticated: false, user: null }); return; }
      const [dashB, conB, platformB, memoryB, browserB, manusB] = await Promise.all([
        dashR.json().catch(() => ({})), conR.json().catch(() => ({})), platformR.json().catch(() => ({})),
        memoryR.json().catch(() => ({})), browserR.json().catch(() => ({})), manusR.json().catch(() => ({})),
      ]);
      if (dashR.ok) setDashboard(dashB);
      if (conR.ok && Array.isArray(conB.connectors)) setConnectors(conB.connectors);
      if (platformR.ok && platformB?.ok) setPlatform(platformB);
      if (memoryR.ok && Array.isArray(memoryB.messages)) {
        setMemory(memoryB.messages);
        setMessages(memoryB.messages.slice(-18));
      }
      if (browserR.ok) setBrowser(browserB);
      if (manusR.ok) setManus(manusB);
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    void fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.json())
      .then((body: Session) => { setSession(body); if (body.authenticated) void loadAll(); })
      .catch(() => setSession({ authenticated: false, user: null }));
  }, [loadAll]);

  async function signIn() {
    const key = ownerKey.trim();
    if (!key) return;
    setAuthError("");
    const response = await fetch("/api/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_key: key }) });
    const body = await response.json().catch(() => ({}));
    setOwnerKey("");
    if (!response.ok || !body?.authenticated) { setAuthError(body?.message || body?.code || "Sign in failed"); return; }
    setSession(body); await loadAll();
  }
  async function signOut() {
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    setSession({ authenticated: false, user: null }); setSheet(null);
  }

  async function upload(file: File) {
    if (file.size > 4_000_000) { setUploadState("ไฟล์เกิน 4 MB"); return; }
    setUploadState(`กำลังแนบ ${file.name}…`);
    try {
      const response = await fetch("/api/chat/attachments", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name || `image-${Date.now()}.jpg`, mime_type: file.type || "image/jpeg", data_url: await fileToDataUrl(file) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.attachment) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setAttachments((rows) => [...rows, body.attachment].slice(-4)); setUploadState("พร้อมส่ง"); setSheet(null);
    } catch (error) { setUploadState(error instanceof Error ? error.message : "แนบไฟล์ไม่สำเร็จ"); }
  }

  async function sendMessage() {
    const prompt = draft.trim();
    if ((!prompt && !attachments.length) || sending) return;
    const localUser: MemoryMessage = { id: crypto.randomUUID(), role: "user", text: prompt || "วิเคราะห์ไฟล์ที่แนบมา", created_at: Date.now() };
    setMessages((rows) => [...rows, localUser]); setDraft(""); setSending(true);
    try {
      const response = await fetch("/api/chat/model", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `mobile_${crypto.randomUUID()}` },
        body: JSON.stringify({ prompt, attachment_ids: attachments.map((item) => item.id), model: chatConfig.model, reasoning_effort: chatConfig.effort, token_boost: chatConfig.boost, mode: "mobile" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", text: body.text || "Done", model: body.model, created_at: Date.now() }]);
      setAttachments([]); setUploadState(""); void loadAll();
    } catch (error) {
      setMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "system", text: error instanceof Error ? error.message : "AI request failed", created_at: Date.now() }]);
    } finally { setSending(false); }
  }

  async function createTask() {
    const title = taskTitle.trim(); if (!title) return;
    setTaskState("Creating…");
    const response = await fetch("/api/tasks", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, capability: "agent_delegate", priority: 60, source: "ogenic-mobile" }) });
    if (response.ok) { setTaskTitle(""); setTaskState(""); setSheet(null); await loadAll(); }
    else { const body = await response.json().catch(() => ({})); setTaskState(body?.message || body?.code || `HTTP_${response.status}`); }
  }

  async function safeTestConnector(id: string) {
    setLiveState(`Testing ${id}…`);
    try {
      const response = await fetch("/api/connectors/test", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connector: id }) });
      const body = await response.json().catch(() => ({}));
      setLiveState(response.ok ? `${id} · verified` : body?.message || body?.code || "Test failed");
      if (response.ok) await loadAll();
    } catch { setLiveState("Connector test failed"); }
  }

  async function startBrowser() {
    setLiveState("Starting secure cloud browser…");
    try {
      const response = await fetch("/api/browser-session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://www.google.com" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setLiveState("Cloud Browser ready · Human Takeover available");
      if (body.live_view_url) window.open(body.live_view_url, "_blank", "noopener,noreferrer");
    } catch (error) { setLiveState(error instanceof Error ? error.message : "Browser session failed"); }
  }

  function openLink(url: string) { window.open(url, "_blank", "noopener,noreferrer"); }
  function setQuick(text: string) { setDraft(text); setTab("chat"); }

  if (session === null) return <main className="omSplash"><div className="omMark">✦</div><b>OGENIC AI</b><span>Loading your control plane…</span></main>;
  if (!session.authenticated) return <main className="omAuth">
    <section>
      <div className="omMark">✦</div><span className="omEyebrow">OWNER MOBILE</span><h1>OGENIC AI</h1><p>One private app for chat, tasks, tools, RAG and live execution.</p>
      <input type="password" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void signIn(); }} placeholder="Owner access key" />
      <button onClick={() => void signIn()}>Continue</button>{authError && <small>{authError}</small>}
    </section>
  </main>;

  return <main className="omShell">
    <input ref={fileInput} className="omHiddenInput" type="file" accept="image/*,.pdf,.txt,.md,.csv,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ""; }} />
    <input ref={cameraInput} className="omHiddenInput" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ""; }} />

    <header className="omTopbar"><button aria-label="Menu" onClick={() => setSheet("menu")}>☰</button><div><b>OGENIC AI</b><span><i /> STAGING</span></div><button aria-label="Theme" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀" : "☾"}</button></header>

    <section className="omBody">
      {tab === "chat" && <div className="omChatView">
        <div className="omHero"><div className="omAura"><i /></div><span className="omEyebrow">YOUR AI · MORE CAPABLE</span><h1>What are we building?</h1><p>Think, connect, create and execute from one place.</p></div>
        <section className="omComposerCard">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask anything…" rows={3} />
          {attachments.length > 0 && <div className="omAttachmentRow">{attachments.map((item) => <button key={item.id} onClick={() => setAttachments((rows) => rows.filter((row) => row.id !== item.id))}>📎 {item.filename} ×</button>)}</div>}
          <div className="omComposerBar"><button className="omCircle" onClick={() => setSheet("add")}>＋</button><button className="omModelPill" onClick={() => setSheet("model")}><span className={`omModelDot ${modelMeta.tone}`} /> <b>{modelMeta.label}</b><small>{EFFORTS.find((item) => item.id === chatConfig.effort)?.label} · ×{chatConfig.boost}</small>⌄</button><button className="omSend" disabled={sending || (!draft.trim() && !attachments.length)} onClick={() => void sendMessage()}>{sending ? "…" : "➤"}</button></div>
          {uploadState && <small className="omInlineState">{uploadState}</small>}
        </section>
        <div className="omQuickGrid"><button onClick={() => setQuick("ช่วยเขียนและปรับข้อความนี้ให้ดีขึ้น: ")}>✎<span>Write</span></button><button onClick={() => setQuick("สอนเรื่องนี้แบบเข้าใจง่ายและเป็นขั้นตอน: ")}>⌂<span>Learn</span></button><button onClick={() => setQuick("ช่วยวิเคราะห์และลงมือแก้โค้ดเรื่องนี้: ")}>‹/›<span>Code</span></button><button onClick={() => setQuick("ช่วยคิดเรื่องชีวิต/งานนี้ให้หน่อย: ")}>☕<span>Life</span></button></div>
        {messages.length > 0 && <section className="omConversation"><div className="omSectionHead"><h2>Recent</h2><span>SAME MIND</span></div>{messages.slice(-8).map((message, index) => <article key={message.id || index} className={`omMessage ${message.role || "assistant"}`}><div>{message.role === "user" ? "YOU" : message.role === "system" ? "SYSTEM" : "OGENIC"}</div><p>{message.text}</p><small>{message.model || ""}{message.created_at ? ` · ${ago(message.created_at)}` : ""}</small></article>)}{sending && <article className="omMessage assistant"><div>OGENIC</div><p className="omThinking">Thinking<span>•••</span></p></article>}<div ref={chatEnd} /></section>}
      </div>}

      {tab === "tasks" && <div className="omPage"><div className="omPageTitle"><div><span className="omEyebrow">EXECUTION QUEUE</span><h1>Tasks</h1></div><button onClick={() => setSheet("task")}>＋ New</button></div>
        <button className="omActionHero" onClick={() => setSheet("task")}><div><span>✦</span><b>Create a new task</b><small>Describe what you want to automate. OGENIC will track it.</small></div><em>→</em></button>
        <section className="omTaskSection"><div className="omSectionHead"><h2>Running</h2><span>{activeTasks.length}</span></div>{activeTasks.length ? activeTasks.map((task) => <article className="omTask" key={task.id}><div className={`omStatusDot ${stateTone(task.status)}`} /><div><b>{task.title}</b><small>{task.capability || "agent"} · {task.status}</small></div><span>{task.priority || 0}</span></article>) : <div className="omEmpty">No active tasks.</div>}</section>
        <section className="omTaskSection"><div className="omSectionHead"><h2>Completed</h2><span>{completedTasks.length}</span></div>{completedTasks.slice(0, 6).map((task) => <article className="omTask" key={task.id}><div className="omStatusDot good" /><div><b>{task.title}</b><small>{task.status}</small></div><span>✓</span></article>)}</section>
      </div>}

      {tab === "live" && <div className="omPage"><div className="omPageTitle"><div><span className="omEyebrow">LIVE EXECUTION</span><h1>Live</h1></div><button onClick={() => void loadAll()}>{syncing ? "…" : "↻"}</button></div>
        <section className="omRuntimeCard"><div><span className="omPulse" /><div><b>Control plane online</b><small>{dashboard.runtime?.provider || "Cloudflare"} · Human approval protected</small></div></div><span>{liveTools.length} tools live</span></section>
        <section className="omLiveGrid">
          {liveTools.map((tool) => <article key={tool.id}><span>⌘</span><b>{tool.label}</b><small>{tool.summary || "Live execution surface"}</small><em className="good">LIVE</em></article>)}
          {browser?.state === "READY" && <article><span>◫</span><b>Cloud Browser</b><small>Human takeover · uses Browser Run quota</small><button onClick={() => void startBrowser()}>Open</button></article>}
          {manus?.configured && <article><span>◉</span><b>Manus</b><small>External agent workspace</small><button onClick={() => openLink("https://manus.im/app")}>Open</button></article>}
        </section>
        {liveState && <div className="omNotice">{liveState}</div>}
      </div>}

      {tab === "connect" && <div className="omPage"><div className="omPageTitle"><div><span className="omEyebrow">PLATFORM + CONNECTORS</span><h1>Connect</h1></div><button onClick={() => void loadAll()}>{syncing ? "…" : "↻"}</button></div>
        {platform && <section className="omPlatformCard"><div className="omPlatformHead"><div><span className="omEyebrow">OPENAI PLATFORM</span><h2>Platform Hub</h2></div><span className={stateTone(platform.api_key_state || "")}>API {platform.api_key_state || "—"}</span></div><div className="omMetricRow"><div><small>Models</small><b>{platform.models?.count ?? 0}</b></div><div><small>Files</small><b>{platform.files?.count ?? 0}</b></div><div><small>RAG stores</small><b>{platform.vector_stores?.count ?? 0}</b></div></div></section>}
        <div className="omSectionHead"><h2>Connected now</h2><span>{readyConnectors.length}</span></div><section className="omConnectorList">{readyConnectors.map((item) => <article key={item.id}><div className="omConnectorIcon">{item.label.slice(0, 2).toUpperCase()}</div><div><b>{item.label}</b><small>{item.summary || item.route_mode || item.kind}</small></div><em className="good">{item.state}</em><button onClick={() => void safeTestConnector(item.id)}>Test</button></article>)}</section>
        {liveState && <div className="omNotice">{liveState}</div>}
        <div className="omSectionHead"><h2>Apps</h2><span>shortcuts</span></div><section className="omAppGrid">{APP_LINKS.map((app) => <button key={app.label} onClick={() => openLink(app.url)}><img src={favicon(app.domain)} alt="" /><span><b>{app.label}</b><small>{app.sub}</small></span><em>↗</em></button>)}</section>
      </div>}

      {tab === "rag" && <div className="omPage"><div className="omPageTitle"><div><span className="omEyebrow">KNOWLEDGE + MEMORY</span><h1>RAG</h1></div><button onClick={() => void loadAll()}>{syncing ? "…" : "↻"}</button></div>
        <section className="omKnowledgeHero"><div className="omKnowledgeOrb">◎</div><div><span className="omEyebrow">OGENIC KNOWLEDGE</span><h2>{platform?.vector_stores?.knowledge_store_id ? "Knowledge Store ready" : "SAME MIND ready"}</h2><p>Long-term retrieval + recent owner conversation in one private surface.</p></div><span className="good">LIVE</span></section>
        <div className="omMetricRow omRagMetrics"><div><small>Vector stores</small><b>{platform?.vector_stores?.count ?? 0}</b></div><div><small>Memory</small><b>{memory.length}</b></div><div><small>Files</small><b>{platform?.files?.count ?? 0}</b></div></div>
        <div className="omSectionHead"><h2>Recent memory</h2><span>D1 SAME MIND</span></div><section className="omMemoryList">{memory.slice(-16).reverse().map((item, index) => <article key={item.id || index}><span>{(item.role || "M").slice(0, 1).toUpperCase()}</span><div><b>{item.role === "user" ? "You" : item.role === "assistant" ? "OGENIC" : "System"}</b><p>{item.text || "—"}</p></div><small>{ago(item.created_at)}</small></article>)}</section>
      </div>}
    </section>

    <nav className="omBottomNav">
      {([ ["chat", "◉", "Chat"], ["tasks", "☑", "Tasks"], ["live", "✦", "Live"], ["connect", "⌘", "Connect"], ["rag", "◎", "RAG"] ] as Array<[Tab,string,string]>).map(([id, icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setSheet(null); }}><span>{icon}</span><small>{label}</small></button>)}
    </nav>

    {sheet && <div className="omSheetBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}><section className="omSheet"><div className="omGrab" />
      {sheet === "menu" && <><div className="omSheetTitle"><h2>OGENIC AI</h2><button onClick={() => setSheet(null)}>×</button></div><button className="omMenuRow" onClick={() => { setTab("chat"); setSheet(null); }}>✦<span><b>New chat</b><small>SAME MIND</small></span>›</button><button className="omMenuRow" onClick={() => { setTab("tasks"); setSheet(null); }}>☑<span><b>Tasks</b><small>Execution queue</small></span>›</button><button className="omMenuRow" onClick={() => { setTab("rag"); setSheet(null); }}>◎<span><b>RAG</b><small>Knowledge + memory</small></span>›</button><button className="omMenuRow" onClick={() => setSheet("settings")}>⚙<span><b>Settings</b><small>Theme · web control plane</small></span>›</button></>}
      {sheet === "settings" && <><div className="omSheetTitle"><button className="omBack" onClick={() => setSheet("menu")}>←</button><h2>Settings</h2><button onClick={() => setSheet(null)}>×</button></div><div className="omSettingRow"><span><b>Appearance</b><small>Use a clean light or dark interface</small></span><button onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>{theme === "dark" ? "Dark" : "Light"}</button></div><div className="omSettingRow"><span><b>Web control plane</b><small>Advanced admin, debug and disabled surfaces stay on web</small></span><button onClick={() => openLink("/developer")}>Open ↗</button></div><div className="omSettingRow"><span><b>Owner session</b><small>{session.user?.label || "OGENIC Owner"}</small></span><button onClick={() => void signOut()}>Sign out</button></div></>}
      {sheet === "add" && <><div className="omSheetTitle"><h2>Add to chat</h2><button onClick={() => setSheet(null)}>×</button></div><div className="omAddGrid"><button onClick={() => cameraInput.current?.click()}>⌁<b>Camera</b><small>Take a photo</small></button><button onClick={() => fileInput.current?.click()}>▧<b>Photos & files</b><small>Up to 4 MB</small></button></div><button className="omMenuRow" onClick={() => { setQuick("ค้นและอ้างอิงฐานความจำ RAG เกี่ยวกับ: "); setSheet(null); }}>◎<span><b>RAG memory</b><small>Ask with SAME MIND context</small></span>›</button></>}
      {sheet === "model" && <><div className="omSheetTitle"><h2>Model</h2><button onClick={() => setSheet(null)}>×</button></div><div className="omModelList">{MODELS.map((item) => <button key={item.id} className={chatConfig.model === item.id ? "active" : ""} onClick={() => setChatConfig((value) => ({ ...value, model: item.id }))}><span className={`omModelDot ${item.tone}`} /><span><b>{item.label}</b><small>{item.sub}</small></span>{chatConfig.model === item.id ? "✓" : ""}</button>)}</div><h3 className="omSheetSub">Reasoning effort</h3><div className="omSegment">{EFFORTS.map((item) => <button key={item.id} disabled={chatConfig.model === "gpt-4.1-mini"} className={chatConfig.effort === item.id ? "active" : ""} onClick={() => setChatConfig((value) => ({ ...value, effort: item.id }))}>{item.label}</button>)}</div><h3 className="omSheetSub">Output ceiling</h3><div className="omSegment three">{([1,10,20] as Boost[]).map((value) => <button key={value} className={chatConfig.boost === value ? "active" : ""} onClick={() => setChatConfig((row) => ({ ...row, boost: value }))}>×{value}</button>)}</div><p className="omCostNote">Uses the bound OpenAI API key. ×10/×20 raises the output ceiling; billing follows actual API usage.</p></>}
      {sheet === "task" && <><div className="omSheetTitle"><h2>Create task</h2><button onClick={() => setSheet(null)}>×</button></div><textarea className="omTaskInput" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="งานที่ต้องการให้ agent ทำ…" rows={5} /><button className="omPrimary" disabled={!taskTitle.trim()} onClick={() => void createTask()}>{taskState || "Add to execution queue"}</button></>}
    </section></div>}
  </main>;
}
