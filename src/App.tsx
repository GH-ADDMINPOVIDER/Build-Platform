import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "overview" | "chat" | "tools" | "workflows" | "tasks";
type AuthState = "checking" | "signed_out" | "signing_in" | "ready" | "error";

type Session = {
  authenticated: boolean;
  user: { id: string; role: "owner"; label: string } | null;
  method?: string | null;
};

type Health = {
  ok: boolean;
  phase?: string;
  runtime?: string;
  database?: string;
  providers?: number;
  shared_state?: string;
};

type ToolRecord = Record<string, string | number | boolean | null>;
type ToolSnapshot = {
  id: "github" | "linear" | "n8n";
  label: string;
  state: "LIVE" | "CONFIGURATION_REQUIRED" | "ERROR";
  latency_ms: number;
  summary: string;
  checked_at: string;
  records: ToolRecord[];
};

type Task = {
  id: string;
  title: string;
  capability?: string | null;
  status: string;
  priority: number;
  claimed_by?: string | null;
  source_ref?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type Workflow = { workflow_id: string; version: number; created_at: number };
type Run = {
  id: string;
  workflow_id: string;
  workflow_version: number;
  status: string;
  current_node_id?: string | null;
  updated_at: number;
};

type Pool = {
  id: string;
  label: string;
  used: number;
  cap: number | null;
  remaining: number | null;
  percent: number | null;
  state: string;
};

type Dashboard = {
  app: { name: string; version: string; phase: string };
  runtime: { provider: string; database: string; git_sha: string; branch: string };
  tasks: Task[];
  task_counts: Array<{ status: string; count: number }>;
  runs: Run[];
  run_counts: Array<{ status: string; count: number }>;
  workflows: Workflow[];
  events: Array<{ id: string; task_id?: string; event_type: string; actor: string; created_at: string }>;
  incentives: { policy_state: string; usage_tier: number | null; pools: Pool[] };
  tools: ToolSnapshot[];
};

type ChatMessage = { id: string; role: "assistant" | "user" | "system"; text: string; meta?: string };
type ChatMode = "fast" | "balanced" | "power";

const nav: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "chat", label: "AI Chat", icon: "✦" },
  { id: "tools", label: "Live Tools", icon: "⌘" },
  { id: "workflows", label: "Workflows", icon: "◇" },
  { id: "tasks", label: "Tasks", icon: "✓" },
];

const welcome: ChatMessage[] = [{
  id: "welcome",
  role: "assistant",
  text: "OGENIC AI v0.2 พร้อมแล้ว เลือกโหมดแล้วส่งงานได้เลย ระบบจะรันผ่าน workflow engine บน staging เท่านั้น",
  meta: "Phase VI · owner session",
}];

function statusTone(status: string) {
  if (["LIVE", "DONE", "SUCCEEDED", "ACTIVE", "NORMAL"].includes(status.toUpperCase())) return "good";
  if (["ERROR", "FAILED", "BLOCKED", "CRITICAL", "EXHAUSTED"].includes(status.toUpperCase())) return "bad";
  if (["RUNNING", "CLAIMED", "VERIFYING", "WAITING", "WATCH", "THROTTLE"].includes(status.toUpperCase())) return "warn";
  return "quiet";
}

function readableDate(value: string | number | null | undefined) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" ? value : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function countOf(rows: Array<{ status: string; count: number }>, statuses: string[]) {
  const accepted = new Set(statuses.map((status) => status.toUpperCase()));
  return rows.reduce((total, row) => total + (accepted.has(row.status.toUpperCase()) ? Number(row.count) : 0), 0);
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCapability, setTaskCapability] = useState("agent_delegate");
  const [savingTask, setSavingTask] = useState(false);
  const [mode, setMode] = useState<ChatMode>("balanced");
  const [messages, setMessages] = useState<ChatMessage[]>(welcome);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setHealth(response.ok ? await response.json() as Health : { ok: false });
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        setSession({ authenticated: false, user: null });
        setAuthState("signed_out");
        return;
      }
      const body = await response.json().catch(() => ({})) as Dashboard & { message?: string; code?: string };
      if (!response.ok) throw new Error(body.message || body.code || `HTTP_${response.status}`);
      setDashboard(body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Dashboard unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setAuthState("checking");
    try {
      const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Session;
      setSession(body);
      setAuthState(body.authenticated ? "ready" : "signed_out");
      if (body.authenticated) await loadDashboard();
    } catch {
      setSession({ authenticated: false, user: null });
      setAuthState("signed_out");
    }
  }, [loadDashboard]);

  useEffect(() => {
    void loadHealth();
    void checkSession();
  }, [checkSession, loadHealth]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending]);

  const signIn = async () => {
    const key = ownerKey.trim();
    if (!key) return;
    setAuthState("signing_in");
    setAuthError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_key: key }),
      });
      const body = await response.json().catch(() => ({})) as Session & { message?: string; code?: string };
      setOwnerKey("");
      if (!response.ok || !body.authenticated) throw new Error(body.message || body.code || "Sign in failed");
      setSession(body);
      setAuthState("ready");
      await loadDashboard();
    } catch (error) {
      setOwnerKey("");
      setAuthState("error");
      setAuthError(error instanceof Error ? error.message : "Sign in failed");
    }
  };

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    setDashboard(null);
    setSession({ authenticated: false, user: null });
    setAuthState("signed_out");
  };

  const refreshTools = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/tools", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as { tools?: ToolSnapshot[]; code?: string };
      if (!response.ok || !body.tools) throw new Error(body.code || `HTTP_${response.status}`);
      setDashboard((current) => current ? { ...current, tools: body.tools! } : current);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Tool refresh failed");
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    const title = taskTitle.trim();
    if (!title || savingTask) return;
    setSavingTask(true);
    setLoadError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, capability: taskCapability, priority: 60 }),
      });
      const body = await response.json().catch(() => ({})) as { task?: Task; code?: string };
      if (!response.ok || !body.task) throw new Error(body.code || `HTTP_${response.status}`);
      setTaskTitle("");
      await loadDashboard();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Task creation failed");
    } finally {
      setSavingTask(false);
    }
  };

  const sendMessage = async () => {
    const prompt = draft.trim();
    if (!prompt || sending) return;
    setMessages((current) => [...current, {
      id: `u_${crypto.randomUUID()}`,
      role: "user",
      text: prompt,
      meta: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
    setDraft("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `ui_${crypto.randomUUID()}` },
        body: JSON.stringify({ prompt, mode }),
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean; text?: string; model?: string; incentive_pool?: string; code?: string; message?: string;
      };
      if (!response.ok || !body.ok || !body.text) throw new Error(body.message || body.code || `HTTP_${response.status}`);
      setMessages((current) => [...current, {
        id: `a_${crypto.randomUUID()}`,
        role: "assistant",
        text: body.text!,
        meta: `${body.model ?? "OGENIC AI"}${body.incentive_pool ? ` · ${body.incentive_pool}` : ""}`,
      }]);
      void loadDashboard();
    } catch (error) {
      setMessages((current) => [...current, {
        id: `e_${crypto.randomUUID()}`,
        role: "system",
        text: error instanceof Error ? error.message : "AI request failed",
        meta: "Runtime",
      }]);
    } finally {
      setSending(false);
    }
  };

  const taskOpen = useMemo(
    () => countOf(dashboard?.task_counts ?? [], ["QUEUED", "CLAIMED", "RUNNING", "VERIFYING"]),
    [dashboard],
  );
  const runsActive = useMemo(
    () => countOf(dashboard?.run_counts ?? [], ["queued", "running", "waiting"]),
    [dashboard],
  );
  const liveTools = dashboard?.tools.filter((tool) => tool.state === "LIVE").length ?? 0;

  if (authState !== "ready" || !session?.authenticated) {
    return (
      <main className="authShell">
        <section className="authCard">
          <div className="brand">
            <span className="brandMark" aria-hidden="true"><i /></span>
            <div><strong>OGENIC AI</strong><small>PHASE VI · v0.2 STAGING</small></div>
          </div>
          <div className="authCopy">
            <span className="eyebrow">OWNER-ONLY CONTROL PLANE</span>
            <h1>Your AI operations, in one live workspace.</h1>
            <p>เข้าสู่ระบบเพื่อเปิด Live Tools, Workflow Engine และ Task Dashboard โดยคีย์จะถูกตรวจสอบที่ Worker และไม่ถูกบันทึกใน browser storage</p>
          </div>
          <label className="fieldLabel" htmlFor="owner-key">Owner access key</label>
          <div className="authForm">
            <input
              id="owner-key"
              type="password"
              value={ownerKey}
              onChange={(event) => setOwnerKey(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void signIn(); }}
              placeholder="Enter access key"
              autoComplete="current-password"
              disabled={authState === "checking" || authState === "signing_in"}
            />
            <button onClick={() => void signIn()} disabled={!ownerKey.trim() || authState === "signing_in"}>
              {authState === "checking" ? "Checking…" : authState === "signing_in" ? "Signing in…" : "Enter OGENIC"}
            </button>
          </div>
          {authError && <p className="formError">{authError}</p>}
          <div className="authFacts">
            <span><i className={health?.ok ? "dot goodDot" : "dot"} /> Worker {health?.ok ? "online" : "checking"}</span>
            <span>D1 {health?.database ?? "checking"}</span>
            <span>No frontend secrets</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="appShell">
      <aside className="sideNav">
        <div className="brand compactBrand">
          <span className="brandMark" aria-hidden="true"><i /></span>
          <div><strong>OGENIC AI</strong><small>v0.2 · STAGING</small></div>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sideFoot">
          <span className="sessionPill"><i className="dot goodDot" /> Owner session</span>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspaceHeader">
          <div>
            <span className="eyebrow">OGENIC CONTROL PLANE</span>
            <h1>{nav.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="headerActions">
            <span className="stagingPill">STAGING ONLY</span>
            <button className="refreshButton" onClick={() => void loadDashboard()} disabled={loading}>
              {loading ? "Syncing…" : "↻ Sync"}
            </button>
          </div>
        </header>

        {loadError && <div className="notice badNotice">{loadError}</div>}

        {view === "overview" && (
          <>
            <section className="metricGrid">
              <article><span>Runtime</span><strong>{health?.ok ? "Online" : "Checking"}</strong><small>Cloudflare Worker · D1</small></article>
              <article><span>Live tools</span><strong>{liveTools}/3</strong><small>GitHub · Linear · n8n</small></article>
              <article><span>Active runs</span><strong>{runsActive}</strong><small>{dashboard?.workflows.length ?? 0} immutable workflows</small></article>
              <article><span>Open tasks</span><strong>{taskOpen}</strong><small>Shared agent queue</small></article>
            </section>

            <section className="twoColumn">
              <article className="panel">
                <div className="panelHead"><div><span className="eyebrow">PROVIDERS</span><h2>Live tools</h2></div><button onClick={() => setView("tools")}>Open tools →</button></div>
                <div className="toolList compactList">
                  {(dashboard?.tools ?? []).map((tool) => (
                    <div className="toolRow" key={tool.id}>
                      <span className="toolIcon">{tool.id === "github" ? "GH" : tool.id === "linear" ? "LI" : "N8"}</span>
                      <div><strong>{tool.label}</strong><small>{tool.summary}</small></div>
                      <span className={`status ${statusTone(tool.state)}`}>{tool.state}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panelHead"><div><span className="eyebrow">EXECUTION</span><h2>Recent workflow runs</h2></div><button onClick={() => setView("workflows")}>All runs →</button></div>
                <div className="runList">
                  {(dashboard?.runs ?? []).slice(0, 6).map((run) => (
                    <div className="dataRow" key={run.id}>
                      <div><strong>{run.workflow_id}</strong><small>{run.current_node_id ?? `version ${run.workflow_version}`}</small></div>
                      <span className={`status ${statusTone(run.status)}`}>{run.status}</span>
                    </div>
                  ))}
                  {!dashboard?.runs.length && <div className="emptyState">No runs yet. Start with AI Chat or a workflow trigger.</div>}
                </div>
              </article>
            </section>

            <section className="panel">
              <div className="panelHead"><div><span className="eyebrow">GM METERING</span><h2>Provider incentive pools</h2></div><span className={`status ${statusTone(dashboard?.incentives.policy_state ?? "")}`}>{dashboard?.incentives.policy_state ?? "LOADING"}</span></div>
              <div className="meterGrid">
                {(dashboard?.incentives.pools ?? []).map((pool) => {
                  const percent = Math.max(0, Math.min(100, pool.percent ?? 0));
                  return (
                    <div className="meterCard" key={pool.id}>
                      <div><strong>{pool.label}</strong><span>{pool.remaining ?? "—"} remaining</span></div>
                      <div className="meter"><i style={{ width: `${Math.max(2, percent)}%` }} /></div>
                      <small>{pool.used} used · {pool.cap ?? "cap pending"} · {pool.state}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {view === "chat" && (
          <section className="chatPanel panel">
            <div className="panelHead chatPanelHead">
              <div><span className="eyebrow">LIVE WORKFLOW CHAT</span><h2>OGENIC AI</h2></div>
              <div className="modeSwitch" aria-label="AI mode">
                {(["fast", "balanced", "power"] as ChatMode[]).map((item) => (
                  <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item}</button>
                ))}
              </div>
            </div>
            <div className="chatStream">
              {messages.map((message) => (
                <div className={`message ${message.role}`} key={message.id}>
                  <div>{message.text}</div>
                  {message.meta && <small>{message.meta}</small>}
                </div>
              ))}
              {sending && <div className="message assistant typing">Working through the durable engine…</div>}
              <div ref={chatEnd} />
            </div>
            <div className="composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="สั่งงาน OGENIC AI…"
                rows={2}
              />
              <button onClick={() => void sendMessage()} disabled={!draft.trim() || sending}>Send</button>
            </div>
          </section>
        )}

        {view === "tools" && (
          <section className="panel">
            <div className="panelHead">
              <div><span className="eyebrow">SERVER-SIDE ADAPTERS</span><h2>Live Tools</h2></div>
              <button className="primarySmall" onClick={() => void refreshTools()} disabled={loading}>Refresh all</button>
            </div>
            <p className="panelIntro">Credentials stay inside the Worker runtime. The browser receives only sanitized status and records.</p>
            <div className="toolCards">
              {(dashboard?.tools ?? []).map((tool) => (
                <article className="toolCard" key={tool.id}>
                  <div className="toolCardTop">
                    <span className="toolIcon large">{tool.id === "github" ? "GH" : tool.id === "linear" ? "LI" : "N8"}</span>
                    <div><strong>{tool.label}</strong><small>{tool.latency_ms} ms · {readableDate(tool.checked_at)}</small></div>
                    <span className={`status ${statusTone(tool.state)}`}>{tool.state}</span>
                  </div>
                  <p>{tool.summary}</p>
                  <div className="recordList">
                    {tool.records.slice(0, 5).map((record, index) => (
                      <div className="recordRow" key={String(record.id ?? index)}>
                        <strong>{String(record.name ?? record.title ?? record.key ?? record.id ?? "Record")}</strong>
                        <small>{String(record.status ?? record.conclusion ?? (record.active === true ? "active" : record.active === false ? "inactive" : ""))}</small>
                      </div>
                    ))}
                    {!tool.records.length && <div className="emptyState">No live records returned.</div>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "workflows" && (
          <section className="twoColumn workflowLayout">
            <article className="panel">
              <div className="panelHead"><div><span className="eyebrow">VERSIONED DEFINITIONS</span><h2>Workflows</h2></div><span>{dashboard?.workflows.length ?? 0}</span></div>
              <div className="dataList">
                {(dashboard?.workflows ?? []).map((workflow) => (
                  <div className="dataRow" key={workflow.workflow_id}>
                    <div><strong>{workflow.workflow_id}</strong><small>Immutable version pinned in D1</small></div>
                    <span className="versionPill">v{workflow.version}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="panelHead"><div><span className="eyebrow">DURABLE EXECUTION</span><h2>Runs</h2></div><span>{dashboard?.runs.length ?? 0}</span></div>
              <div className="dataList">
                {(dashboard?.runs ?? []).map((run) => (
                  <div className="dataRow runDetail" key={run.id}>
                    <div><strong>{run.workflow_id}</strong><small>{run.id} · {run.current_node_id ?? "complete"} · {readableDate(run.updated_at)}</small></div>
                    <span className={`status ${statusTone(run.status)}`}>{run.status}</span>
                  </div>
                ))}
                {!dashboard?.runs.length && <div className="emptyState">No workflow runs in D1.</div>}
              </div>
            </article>
          </section>
        )}

        {view === "tasks" && (
          <section className="twoColumn taskLayout">
            <article className="panel taskCreate">
              <div><span className="eyebrow">OWNER ACTION</span><h2>Create task</h2></div>
              <label className="fieldLabel" htmlFor="task-title">Task</label>
              <textarea id="task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="งานที่ต้องการให้ agent รับไปทำ" rows={4} />
              <label className="fieldLabel" htmlFor="task-capability">Capability</label>
              <select id="task-capability" value={taskCapability} onChange={(event) => setTaskCapability(event.target.value)}>
                <option value="agent_delegate">Agent delegate</option>
                <option value="workflow_run">Workflow run</option>
                <option value="code_search">GitHub / code</option>
                <option value="deploy_preview">Staging deploy</option>
                <option value="runtime_verify">Runtime verify</option>
              </select>
              <button className="primaryButton" onClick={() => void createTask()} disabled={!taskTitle.trim() || savingTask}>
                {savingTask ? "Creating…" : "Add to D1 queue"}
              </button>
            </article>
            <article className="panel">
              <div className="panelHead"><div><span className="eyebrow">SHARED AGENT STATE</span><h2>Task dashboard</h2></div><span>{dashboard?.tasks.length ?? 0}</span></div>
              <div className="dataList taskList">
                {(dashboard?.tasks ?? []).map((task) => (
                  <div className="taskRow" key={task.id}>
                    <div className="priority">{task.priority}</div>
                    <div><strong>{task.title}</strong><small>{task.capability ?? "unassigned"} · {task.claimed_by ?? "queue"} · {readableDate(task.updated_at)}</small></div>
                    <span className={`status ${statusTone(task.status)}`}>{task.status}</span>
                  </div>
                ))}
                {!dashboard?.tasks.length && <div className="emptyState">No agent tasks in D1.</div>}
              </div>
            </article>
          </section>
        )}

        <footer className="workspaceFooter">
          <span><i className={`dot ${health?.ok ? "goodDot" : ""}`} /> {health?.runtime ?? "Cloudflare"} · {health?.shared_state ?? health?.database ?? "D1"}</span>
          <span>{dashboard?.runtime.branch}</span>
          <span>{dashboard?.runtime.git_sha.slice(0, 8)}</span>
        </footer>
      </section>
    </main>
  );
}
