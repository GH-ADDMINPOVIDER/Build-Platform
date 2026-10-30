import { useCallback, useEffect, useRef, useState } from "react";

type View = "overview" | "chat" | "openai" | "tools" | "workflows" | "tasks" | "cashflow" | "gm" | "usage" | "apps" | "candy";
type ChatMode = "fast" | "balanced" | "power";
type CashType = "income" | "expense" | "obligation" | "repayment";

type Session = { authenticated: boolean; user: { id: string; role: "owner"; label: string } | null };
type Tool = { id: string; label: string; state: string; latency_ms?: number; summary?: string; checked_at?: string; records?: Array<Record<string, unknown>> };
type Pool = { id: string; label: string; used: number; cap: number | null; remaining: number | null; percent: number | null; state: string; telemetry?: string };
type Dashboard = {
  app?: { name?: string; version?: string; phase?: string };
  runtime?: { provider?: string; database?: string; git_sha?: string; branch?: string };
  tasks?: Array<{ id: string; title: string; status: string; priority: number; capability?: string | null }>;
  task_counts?: Array<{ status: string; count: number }>;
  runs?: Array<{ id: string; workflow_id: string; workflow_version: number; status: string; current_node_id?: string | null; updated_at?: number }>;
  run_counts?: Array<{ status: string; count: number }>;
  workflows?: Array<{ workflow_id: string; version: number; created_at: number }>;
  incentives?: { policy_state: string; usage_tier?: number | null; routing_mode?: string; paid_fallback?: boolean; reset_at?: string; source?: string; pools: Pool[] };
  tools?: Tool[];
};
type CashRow = { id: string; type: CashType; amount: number; note: string; category: string; date: string };
type ChatMessage = { id: string; role: "assistant" | "user" | "system"; text: string; meta?: string };
type PersistedChatMessage = { id?: unknown; role?: unknown; text?: unknown; model?: unknown; created_at?: unknown };
type AppLink = { id: string; label: string; sub: string; url: string; icon: string; internal?: View };

const nav: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "chat", label: "AI Chat", icon: "✦" },
  { id: "openai", label: "OpenAI", icon: "◎" },
  { id: "tools", label: "Live Tools", icon: "⌘" },
  { id: "workflows", label: "Workflows", icon: "◇" },
  { id: "tasks", label: "Tasks", icon: "✓" },
  { id: "cashflow", label: "Cashflow", icon: "฿" },
  { id: "gm", label: "GM Limit", icon: "▥" },
  { id: "usage", label: "Usage", icon: "◫" },
  { id: "apps", label: "Apps", icon: "▦" },
  { id: "candy", label: "Candy", icon: "♥" },
];

const apps: AppLink[] = [
  { id: "github", label: "GitHub", sub: "Build-Platform", icon: "GH", url: "https://github.com/Wave-Runner-2/Build-Platform" },
  { id: "linear", label: "Linear", sub: "Ogenic-Sio", icon: "LI", url: "https://linear.app/ogenic-sio" },
  { id: "openai", label: "OpenAI", sub: "Platform", icon: "AI", url: "https://platform.openai.com", internal: "openai" },
  { id: "cloudflare", label: "Cloudflare", sub: "Workers · D1", icon: "CF", url: "https://dash.cloudflare.com" },
  { id: "vercel", label: "Vercel", sub: "Deployments", icon: "▲", url: "https://vercel.com/dashboard" },
  { id: "infisical", label: "Infisical", sub: "Secrets", icon: "IF", url: "https://app.infisical.com" },
  { id: "notion", label: "Notion", sub: "Knowledge", icon: "N", url: "https://www.notion.so" },
  { id: "drive", label: "Google Drive", sub: "Files", icon: "GD", url: "https://drive.google.com" },
  { id: "figma", label: "Figma", sub: "Design", icon: "FG", url: "https://www.figma.com" },
  { id: "shopify", label: "Shopify", sub: "Store", icon: "SH", url: "https://admin.shopify.com" },
  { id: "magnific", label: "Magnific", sub: "Creative", icon: "MG", url: "https://magnific.ai" },
  { id: "candy", label: "Candy", sub: "Baked Factory", icon: "♥", url: "https://candybaked.ogenicchocolate.com", internal: "candy" },
];

const cashKey = "ogenic.webdev.cashflow.v1";
const WELCOME_MESSAGES: ChatMessage[] = [
  { id: "welcome", role: "assistant", text: "OGENIC HARNESS พร้อมแล้ว · owner-main / 1LSS", meta: "Owner session" },
];

function count(rows: Array<{ status: string; count: number }> | undefined, wanted: string[]) {
  const set = new Set(wanted.map((s) => s.toUpperCase()));
  return (rows ?? []).reduce((sum, row) => sum + (set.has(row.status.toUpperCase()) ? Number(row.count) : 0), 0);
}
function tone(value = "") {
  const v = value.toUpperCase();
  if (["LIVE", "DONE", "ACTIVE", "NORMAL", "ONLINE", "OPERATIONAL"].includes(v)) return "good";
  if (["ERROR", "FAILED", "BLOCKED", "CRITICAL", "EXHAUSTED"].includes(v)) return "bad";
  return "quiet";
}
function baht(n: number) { return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(n); }
function persistedRole(value: unknown): ChatMessage["role"] {
  return value === "user" || value === "system" ? value : "assistant";
}
function persistedMeta(message: PersistedChatMessage) {
  const model = typeof message.model === "string" && message.model ? message.model : "SAME MIND";
  const timestamp = Number(message.created_at);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return model;
  return `${model} · ${new Date(timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
}

export default function ControlPlaneV2() {
  const [session, setSession] = useState<Session | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<ChatMode>("balanced");
  const [messages, setMessages] = useState<ChatMessage[]>(WELCOME_MESSAGES);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [cash, setCash] = useState<CashRow[]>([]);
  const [cashType, setCashType] = useState<CashType>("expense");
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [cashCategory, setCashCategory] = useState("ทั่วไป");
  const [openAIStatus, setOpenAIStatus] = useState<any>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setCash(JSON.parse(localStorage.getItem(cashKey) || "[]")); } catch { setCash([]); }
  }, []);
  useEffect(() => { localStorage.setItem(cashKey, JSON.stringify(cash)); }, [cash]);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 401) { setSession({ authenticated: false, user: null }); return; }
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message || body?.code || `HTTP_${r.status}`);
      setDashboard(body);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Dashboard unavailable"); }
    finally { setLoading(false); }
  }, []);

  const loadChatHistory = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/history", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 401) return;
      const body = await r.json().catch(() => ({})) as { messages?: PersistedChatMessage[] };
      if (!r.ok || !Array.isArray(body.messages)) return;
      const hydrated = body.messages.slice(-60).map((message, index): ChatMessage => ({
        id: typeof message.id === "string" && message.id ? message.id : `same_mind_${index}`,
        role: persistedRole(message.role),
        text: String(message.text ?? ""),
        meta: persistedMeta(message),
      })).filter((message) => message.text.trim().length > 0);
      setMessages(hydrated.length ? hydrated : WELCOME_MESSAGES);
    } catch {
      // Keep current UI messages if history hydration is temporarily unavailable.
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
      const body = await r.json() as Session;
      setSession(body);
      if (body.authenticated) await Promise.all([loadDashboard(), loadChatHistory()]);
    } catch { setSession({ authenticated: false, user: null }); }
  }, [loadDashboard, loadChatHistory]);

  useEffect(() => { void checkSession(); }, [checkSession]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, sending]);
  useEffect(() => {
    if (view === "chat" && session?.authenticated) void loadChatHistory();
  }, [view, session?.authenticated, loadChatHistory]);
  useEffect(() => {
    if (view !== "openai") return;
    void fetch("/api/openai-status", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => r.ok ? await r.json() : null).then(setOpenAIStatus).catch(() => setOpenAIStatus(null));
  }, [view]);

  async function signIn() {
    const key = ownerKey.trim(); if (!key) return;
    setAuthError("");
    const r = await fetch("/api/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_key: key }) });
    const body = await r.json().catch(() => ({})); setOwnerKey("");
    if (!r.ok || !body.authenticated) { setAuthError(body?.message || body?.code || "Sign in failed"); return; }
    setSession(body); await Promise.all([loadDashboard(), loadChatHistory()]);
  }
  async function signOut() {
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    setSession({ authenticated: false, user: null }); setDashboard(null); setMessages(WELCOME_MESSAGES);
  }

  async function sendMessage() {
    const prompt = draft.trim(); if (!prompt || sending) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: prompt, meta: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    setDraft(""); setSending(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": `ui_${crypto.randomUUID()}` }, body: JSON.stringify({ prompt, mode }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${r.status}`);
      await loadChatHistory();
      void loadDashboard();
    } catch (e) { setMessages((m) => [...m, { id: crypto.randomUUID(), role: "system", text: e instanceof Error ? e.message : "AI request failed", meta: "Runtime" }]); }
    finally { setSending(false); }
  }

  async function createTask() {
    const title = taskTitle.trim(); if (!title) return;
    const r = await fetch("/api/tasks", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, capability: "agent_delegate", priority: 60 }) });
    if (r.ok) { setTaskTitle(""); void loadDashboard(); }
  }

  function addCash() {
    const amount = Number(cashAmount); if (!Number.isFinite(amount) || amount <= 0 || !cashNote.trim()) return;
    setCash((rows) => [{ id: crypto.randomUUID(), type: cashType, amount, note: cashNote.trim(), category: cashCategory.trim() || "ทั่วไป", date: new Date().toISOString() }, ...rows]);
    setCashAmount(""); setCashNote("");
  }

  const liveTools = dashboard?.tools?.filter((t) => t.state === "LIVE").length ?? 0;
  const activeRuns = count(dashboard?.run_counts, ["queued", "running", "waiting"]);
  const openTasks = count(dashboard?.task_counts, ["QUEUED", "CLAIMED", "RUNNING", "VERIFYING"]);
  const income = cash.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expense = cash.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const repayments = cash.filter((r) => r.type === "repayment").reduce((s, r) => s + r.amount, 0);
  const obligations = cash.filter((r) => r.type === "obligation").reduce((s, r) => s + r.amount, 0);
  const usagePools = dashboard?.incentives?.pools ?? [];
  const usageTotal = usagePools.reduce((sum, pool) => sum + Math.max(0, Number(pool.used) || 0), 0);
  const usageKnownCap = usagePools.reduce((sum, pool) => sum + (pool.cap === null ? 0 : Math.max(0, Number(pool.cap) || 0)), 0);
  const usagePercent = usageKnownCap > 0 ? Math.min(100, (usageTotal / usageKnownCap) * 100) : null;

  if (!session?.authenticated) return (
    <main className="cpAuth"><section className="cpAuthCard">
      <div className="cpBrand"><img className="cpLogo" src="/assets/ogenic-harness-mark.svg" alt="OGENIC HARNESS" /><div><strong>OGENIC HARNESS</strong><small>ONE LINE · MANY KEYS</small></div></div>
      <span className="eyebrow">OWNER HARNESS</span><h1>One Line. Many Keys.</h1>
      <p>คีย์ถูกตรวจที่ Worker และไม่บันทึกลง browser storage</p>
      <div className="cpAuthForm"><input type="password" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void signIn(); }} placeholder="Owner access key" /><button onClick={() => void signIn()}>Enter</button></div>
      {authError && <div className="cpError">{authError}</div>}
    </section></main>
  );

  return <main className="cpShell">
    <aside className="cpSide">
      <div className="cpBrand"><img className="cpLogo" src="/assets/ogenic-harness-mark.svg" alt="OGENIC HARNESS" /><div><strong>OGENIC HARNESS</strong><small>ONE LINE · MANY KEYS</small></div></div>
      <nav>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="cpSideFoot"><span><i className="cpOnlineDot" /> Owner session</span><button onClick={() => void signOut()}>Sign out</button></div>
    </aside>
    <section className="cpWorkspace">
      <header className="cpHeader"><div><span className="eyebrow">OGENIC HARNESS</span><h1>{nav.find((n) => n.id === view)?.label}</h1></div><div className="cpHeaderActions"><span className="cpStage">STAGING ONLY</span><button onClick={() => { window.location.href = "/chat"; }}>Unifiend Chat ↗</button><button onClick={() => void loadDashboard()}>{loading ? "Syncing…" : "↻ Sync"}</button></div></header>
      {loadError && <div className="cpError">{loadError}</div>}

      {view === "overview" && <>
        <section className="metricGrid cpMetrics">
          <article className="cpStatusChip"><span>Runtime</span><strong>Online</strong><small>Cloudflare · D1</small></article>
          <article><span>Live tools</span><strong>{liveTools}/3</strong><small>GitHub · Linear · n8n</small></article>
          <article><span>Active runs</span><strong>{activeRuns}</strong><small>{dashboard?.workflows?.length ?? 0} workflows</small></article>
          <article><span>Open tasks</span><strong>{openTasks}</strong><small>Agent queue</small></article>
        </section>
        <section className="cpHero"><img src="/assets/ogenic-ai-ops.webp" alt="OGENIC AI operations system" /><div className="cpHeroCopy"><span className="eyebrow">AI OPERATIONS</span><h2>OGENIC HARNESS พร้อมทำงาน</h2><p>Chat · Tools · Workflows · Finance · Apps บน HARNESS เส้นเดียว</p><div><button onClick={() => setView("chat")}>Open AI Chat</button><button onClick={() => setView("apps")}>Open Apps</button></div></div></section>
        <section className="cpGrid2">
          <article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">PROVIDERS</span><h2>Live tools</h2></div><button onClick={() => setView("tools")}>Open →</button></div>{(dashboard?.tools ?? []).map((tool) => <div className="cpRow" key={tool.id}><b>{tool.label}</b><small>{tool.summary || "—"}</small><span className={`cpStatus ${tone(tool.state)}`}>{tool.state}</span></div>)}</article>
          <article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">QUICK APPS</span><h2>Workspace</h2></div><button onClick={() => setView("apps")}>All →</button></div><div className="cpQuickApps">{apps.slice(0, 6).map((app) => <button key={app.id} onClick={() => app.internal ? setView(app.internal) : window.open(app.url, "_blank", "noopener,noreferrer")}><i>{app.icon}</i><span><b>{app.label}</b><small>{app.sub}</small></span></button>)}</div></article>
        </section>
      </>}

      {view === "chat" && <section className="chatPanel cpPanel cpChat"><div className="panelHead chatPanelHead"><div><span className="eyebrow">SAME MIND</span><h2>OGENIC AI</h2></div><div className="modeSwitch">{(["fast", "balanced", "power"] as ChatMode[]).map((m) => <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>{m}</button>)}</div></div><div className="chatStream">{messages.map((m) => <div key={m.id} className={`message ${m.role}`}><div>{m.text}</div>{m.meta && <small>{m.meta}</small>}</div>)}{sending && <div className="message assistant">Working…</div>}<div ref={chatEnd} /></div><div className="composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder="สั่งงาน OGENIC AI…" rows={2} /><button onClick={() => void sendMessage()} disabled={!draft.trim() || sending}>Send</button></div></section>}

      {view === "openai" && <section className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">OPENAI PLATFORM</span><h2>OpenAI Control Center</h2></div><button onClick={() => window.open("https://platform.openai.com", "_blank", "noopener,noreferrer")}>Platform ↗</button></div><div className="cpCards"><article><span>Status</span><strong>{openAIStatus?.overall || "Unknown"}</strong><small>{openAIStatus?.indicator || "status feed"}</small></article><article><span>Models</span><strong>API</strong><small>Live inventory / routing</small></article><article><span>Usage & Cost</span><strong>Admin</strong><small>Requires OPENAI_ADMIN_KEY</small></article><article><span>Tools / MCP</span><strong>Registry</strong><small>Responses tools</small></article><article><span>Vector Stores</span><strong>Files</strong><small>Free-first storage guard</small></article><article><span>Webhooks</span><strong>Hooks</strong><small>Signature + replay protection</small></article></div></section>}

      {view === "tools" && <section className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">SERVER ADAPTERS</span><h2>Live Tools</h2></div><button onClick={() => void loadDashboard()}>Refresh</button></div>{(dashboard?.tools ?? []).map((tool) => <div className="cpTool" key={tool.id}><div><b>{tool.label}</b><small>{tool.summary || "—"}</small></div><span className={`cpStatus ${tone(tool.state)}`}>{tool.state}</span></div>)}</section>}

      {view === "workflows" && <section className="cpGrid2"><article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">DEFINITIONS</span><h2>Workflows</h2></div></div>{(dashboard?.workflows ?? []).map((w) => <div className="cpRow" key={w.workflow_id}><b>{w.workflow_id}</b><small>Immutable definition</small><span>v{w.version}</span></div>)}</article><article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">EXECUTION</span><h2>Runs</h2></div></div>{(dashboard?.runs ?? []).map((r) => <div className="cpRow" key={r.id}><b>{r.workflow_id}</b><small>{r.current_node_id || "complete"}</small><span className={`cpStatus ${tone(r.status)}`}>{r.status}</span></div>)}</article></section>}

      {view === "tasks" && <section className="cpGrid2"><article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">OWNER ACTION</span><h2>Create task</h2></div></div><textarea className="cpInput cpTextarea" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="งานที่ต้องการให้ agent ทำ" /><button className="cpPrimary" onClick={() => void createTask()}>Add to queue</button></article><article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">QUEUE</span><h2>Tasks</h2></div></div>{(dashboard?.tasks ?? []).map((t) => <div className="cpRow" key={t.id}><b>{t.title}</b><small>{t.capability || "task"}</small><span className={`cpStatus ${tone(t.status)}`}>{t.status}</span></div>)}</article></section>}

      {view === "cashflow" && <><section className="cpCashSummary"><article><span>รายรับ</span><strong>{baht(income)}</strong></article><article><span>รายจ่าย</span><strong>{baht(expense)}</strong></article><article><span>ภาระ/หนี้</span><strong>{baht(obligations)}</strong></article><article><span>ชำระแล้ว</span><strong>{baht(repayments)}</strong></article></section><section className="cpGrid2"><article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">QUICK ENTRY</span><h2>คีย์เงินรายรับรายจ่าย</h2></div><span className="cpStage">DEVICE LOCAL · STAGING</span></div><select className="cpInput" value={cashType} onChange={(e) => setCashType(e.target.value as CashType)}><option value="income">รายรับ</option><option value="expense">รายจ่าย</option><option value="obligation">ภาระ/หนี้</option><option value="repayment">ชำระหนี้</option></select><input className="cpInput" inputMode="decimal" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="จำนวนเงิน" /><input className="cpInput" value={cashCategory} onChange={(e) => setCashCategory(e.target.value)} placeholder="หมวด" /><input className="cpInput" value={cashNote} onChange={(e) => setCashNote(e.target.value)} placeholder="รายละเอียด เช่น ค่าห้อง / สาลี่" /><button className="cpPrimary" onClick={addCash}>บันทึก</button><p className="cpHint">ยังไม่พบ ledger ชำระหนี้ “สาลี่” ที่ยืนยันแล้วใน web dev จึงไม่ import อัตโนมัติ</p></article><article className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">LEDGER</span><h2>รายการล่าสุด</h2></div></div>{cash.map((r) => <div className="cpCashRow" key={r.id}><div><b>{r.note}</b><small>{r.category} · {new Date(r.date).toLocaleString("th-TH")}</small></div><strong className={r.type === "income" ? "plus" : "minus"}>{r.type === "income" ? "+" : "-"}{baht(r.amount)}</strong><button onClick={() => setCash((rows) => rows.filter((x) => x.id !== r.id))}>×</button></div>)}{!cash.length && <div className="cpEmpty">ยังไม่มีรายการ</div>}</article></section></>}

      {view === "gm" && <section className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">GM METERING</span><h2>Provider pools</h2></div><button onClick={() => void loadDashboard()}>Refresh</button></div><div className="cpGmGrid">{(dashboard?.incentives?.pools ?? []).map((p) => <article key={p.id}><div><b>{p.label}</b><span className={`cpStatus ${tone(p.state)}`}>{p.state}</span></div><strong>{p.remaining ?? "—"} left</strong><div className="cpMeter"><i style={{ width: `${Math.max(2, Math.min(100, p.percent ?? 0))}%` }} /></div><small>{p.used} used · cap {p.cap ?? "pending"}</small></article>)}</div>{!(dashboard?.incentives?.pools?.length) && <div className="cpEmpty">GM data unavailable</div>}</section>}

      {view === "usage" && <section className="cpUsage">
        <div className="cpUsageHead"><div><span className="eyebrow">OPENAI · USAGE</span><h2>{usageTotal.toLocaleString()} tokens</h2><p>Today · canonical harness telemetry</p></div><button onClick={() => void loadDashboard()}>Refresh</button></div>
        <div className="cpUsageOverview"><div><span>Daily usage</span><strong>{usagePercent === null ? "Metering" : `${usagePercent.toFixed(1)}%`}</strong></div><div className="cpUsageMeter"><i style={{ width: `${Math.max(usagePercent === null ? 0 : 2, usagePercent ?? 0)}%` }} /></div><small>{usageKnownCap > 0 ? `${usageTotal.toLocaleString()} of ${usageKnownCap.toLocaleString()} tokens` : `${usageTotal.toLocaleString()} metered tokens · cap pending`}</small></div>
        <div className="cpUsageGrid">{usagePools.map((pool) => <article key={pool.id}><div><span>{pool.label}</span><em className={`cpStatus ${tone(pool.state)}`}>{pool.state}</em></div><strong>{pool.used.toLocaleString()}</strong><small>{pool.cap === null ? "Cap pending" : `${pool.remaining?.toLocaleString() ?? "0"} remaining`} · {pool.telemetry === "HARNESS_METERED" ? "Live metering" : "Awaiting telemetry"}</small><div className="cpMeter"><i style={{ width: `${Math.max(2, Math.min(100, pool.percent ?? 0))}%` }} /></div></article>)}</div>
        <div className="cpUsageMeta"><span><b>Route</b>{dashboard?.incentives?.routing_mode || "quota-first"}</span><span><b>Paid fallback</b>{dashboard?.incentives?.paid_fallback ? "Enabled" : "Guarded"}</span><span><b>Reset</b>{dashboard?.incentives?.reset_at ? new Date(dashboard.incentives.reset_at).toLocaleString() : "Pending"}</span><span><b>Source</b>{dashboard?.incentives?.source || "HARNESS_D1"}</span></div>
      </section>}

      {view === "apps" && <section className="cpPanel"><div className="cpPanelHead"><div><span className="eyebrow">APP HUB</span><h2>Applications</h2></div></div><div className="cpAppGrid">{apps.map((app) => <button key={app.id} onClick={() => app.internal ? setView(app.internal) : window.open(app.url, "_blank", "noopener,noreferrer")}><i>{app.icon}</i><span><b>{app.label}</b><small>{app.sub}</small></span><em>↗</em></button>)}</div></section>}

      {view === "candy" && <section className="cpPanel cpCandy"><div className="cpPanelHead"><div><span className="eyebrow">CANDY BAKED FACTORY</span><h2>Candy Website</h2></div><button onClick={() => window.open("https://candybaked.ogenicchocolate.com", "_blank", "noopener,noreferrer")}>Open website ↗</button></div><iframe title="Candy Baked Factory" src="https://candybaked.ogenicchocolate.com" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" /><p className="cpHint">ถ้า provider บล็อก iframe ให้กด Open website ด้านบน</p></section>}
    </section>
  </main>;
}
