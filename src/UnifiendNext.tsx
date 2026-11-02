import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import McpConfigCenter from "./McpConfigCenter";
import WhiteDiamondPanel from "./WhiteDiamondPanel";
import VioletDistributionPanel from "./VioletDistributionPanel";
import StoneRulePanel from "./StoneRulePanel";
import LocalAgentTeamPanel from "./LocalAgentTeamPanel";

type SessionState = { authenticated?: boolean; user?: { label?: string; role?: string } | null };
type IncentivePool = {
  id: string;
  label: string;
  used: number;
  cap: number | null;
  remaining: number | null;
  percent: number | null;
  state: string;
  telemetry: string;
};
type JobRow = {
  id: string;
  title?: string;
  capability?: string | null;
  status?: string;
  priority?: number;
  claimed_by?: string | null;
  source_ref?: string | null;
  updated_at?: number | string | null;
  created_at?: number | string | null;
};
type RunRow = {
  id: string;
  workflow_id?: string | null;
  workflow_version?: number | string | null;
  status?: string;
  current_node_id?: string | null;
  error_json?: string | null;
  updated_at?: number | string | null;
  created_at?: number | string | null;
};
type EventRow = {
  id: string;
  task_id?: string | null;
  event_type?: string;
  actor?: string | null;
  external_ref?: string | null;
  created_at?: number | string | null;
};
type Dashboard = {
  runtime?: { provider?: string; branch?: string };
  incentives?: { policy_state?: string; reset_at?: string; pools?: IncentivePool[] };
  tasks?: JobRow[];
  runs?: RunRow[];
  events?: EventRow[];
};
type AgentTelemetry = {
  agent_id: string;
  visible_identity?: string;
  app?: string;
  rank?: string;
  availability_state?: string;
  status?: string;
  stats?: {
    jobs_assigned?: number;
    completed?: number;
    failed?: number;
    blocked?: number;
    success_rate?: number | null;
    accuracy?: number | null;
    accuracy_state?: string;
    accuracy_sample_size?: number;
  };
};
type VioletStatus = { ok?: boolean; agents?: AgentTelemetry[]; evidence?: string };
type Connector = { id: string; label: string; state: string; summary?: string; route_mode?: string; kind?: string };
type SelfHost = {
  ok?: boolean;
  machine?: { id?: string; display_name?: string; physical_hostname?: string; runner_registration?: string; runner_count?: number };
  runner_registration?: string;
  branch?: string;
  openai_app_key?: string;
  github_dispatch?: string;
  d1?: string;
  executor_workflow?: string;
  executor_environment_key?: string;
  policy?: string;
};
type BridgeStatus = { ok?: boolean; cross_surface_ready?: boolean; latest_sequence?: number; checked_at?: number };
type SessionRef = { id: string; source_surface: string; session_ref: string; label?: string | null; last_sequence?: number | null; last_seen_at?: number };
type RuntimeSignal = {
  id: string;
  kind: "NEW" | "APPROVAL" | "BLOCKED" | "RESULT" | "SYNCED" | "DEGRADED_PROVIDER";
  title: string;
  detail: string;
  source: string;
};

type CommandResult = {
  ok?: boolean;
  code?: string;
  run_id?: string;
  task?: { id?: string; status?: string };
  dispatch?: { workflow_url?: string; branch?: string; task_id?: string; automatic_dispatch_error?: string };
  evidence?: { result_sha256?: string | null; git_sha?: string | null; evidence_ref?: string | null };
  execution?: { status?: string; consumer_proven?: boolean };
  command_plan?: { capability?: string; provider?: string };
  policy?: string;
  verification?: { status?: string; reason?: string };
  approval?: { required?: boolean; approval_id?: string; permission_class?: string; capability_id?: string; provider_id?: string; environment?: string | null };
  resolver?: { status?: string; descriptor?: { capability_id?: string; provider_id?: string; permission_class?: string } };
  result?: { path?: string; sha?: string; content_excerpt?: string; content_redacted?: boolean };
  canonical?: { conversation_id?: string; session_line?: string; sequence?: number; replayed?: boolean };
  command_handoff?: { admission?: string; actor_id?: string; execution_authority?: string; yellow_stone_route?: string; direct_execution_bypass?: boolean };
};

type CertificateStatus = {
  ok?: boolean; code?: string; certificate_id?: string; integrity?: string;
  runtime_e2e_verified?: boolean; canonical_source?: { url?: string };
  plugins?: { total?: number; historical_verified_read_api?: number };
  owner_identity_labels?: {
    github_first?: { label?: string };
    github_second?: { label?: string };
    codex_ts?: { historical_execution_result?: string };
  };
};
type Tab = "run" | "agent" | "rules" | "session" | "connections" | "approvals" | "history";
type Surface = "operate" | "command" | "agents";
type Props = { initialTab?: Tab; surface?: Surface };

const HANDOFF_DRAFT_KEY = "ogenic.wave-next.handoff.v1";
const COMMAND_VIEW_KEY = "ogenic.wave.command.view.v1";
const MENTION_PRESETS = [
  { label: "ATHENA", detail: "วางแผนและส่งต่อคำสั่ง" },
  { label: "Codex-TS", detail: "ตัวตน Codex TS ที่ Ocian-S-Host" },
  { label: "Codex-GS", detail: "ตัวตน Codex GS ที่ Ocian-S-Host" },
  { label: "VIOLET", detail: "จัดทีมและงานหลายเอเจ้น" },
  { label: "Yellow-Stone", detail: "ตรวจสิทธิ์และอนุมัติ" },
  { label: "GitHub", detail: "Repository และ Actions" },
  { label: "Ocian-S-Host", detail: "Self-hosted execution host" },
  { label: "skills", detail: "แนะนำสกิลที่เกี่ยวข้อง" },
];
const SSH_HOST = "165.232.174.32";
const SSH_USER = "wave";

function upper(value: unknown, fallback = "OFFLINE") {
  const text = String(value ?? "").trim().toUpperCase();
  return text || fallback;
}

function stateTone(value: unknown) {
  const state = upper(value);
  if (["LIVE", "READY", "BOUND", "CONFIGURED", "OPERATIONAL", "VERIFIED"].includes(state)) return "is-live";
  if (["DEGRADED", "HUMAN_APPROVAL_REQUIRED", "APPROVAL_REQUIRED", "BLOCKED", "PARTIALLY_VERIFIED"].includes(state)) return "is-warn";
  if (["ERROR", "FAILED", "OFFLINE"].includes(state)) return "is-offline";
  return "is-config";
}

function timeAgo(ts?: number | null) {
  if (!ts) return "—";
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

function timestampAgo(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return timeAgo(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? timeAgo(parsed) : "—";
}

function safeExternalHref(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function buildRuntimeSignals(
  dashboard: Dashboard,
  connectors: Connector[],
  bridge: BridgeStatus | null,
): RuntimeSignal[] {
  const out: RuntimeSignal[] = [];
  const seen = new Set<string>();
  const push = (signal: RuntimeSignal) => {
    const key = `${signal.kind}:${signal.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(signal);
  };

  for (const task of dashboard.tasks ?? []) {
    const state = upper(task.status, "");
    if (["QUEUED", "NEW"].includes(state)) push({
      id: task.id, kind: "NEW", title: task.title || "New task",
      detail: task.capability || state, source: "D1 agent_tasks",
    });
    if (state === "BLOCKED") push({
      id: task.id, kind: "BLOCKED", title: task.title || "Blocked task",
      detail: task.capability || state, source: "D1 agent_tasks",
    });
    if (["DONE", "COMPLETE", "COMPLETED", "SUCCESS", "SUCCEEDED"].includes(state)) push({
      id: task.id, kind: "RESULT", title: task.title || "Task result",
      detail: state, source: "D1 agent_tasks",
    });
  }

  for (const event of dashboard.events ?? []) {
    const eventType = upper(event.event_type, "");
    if (!eventType) continue;
    if (eventType.includes("APPROVAL")) push({
      id: event.id, kind: "APPROVAL", title: "Approval required",
      detail: event.task_id || eventType, source: "D1 agent_events",
    });
    else if (eventType.includes("BLOCK")) push({
      id: event.id, kind: "BLOCKED", title: "Runtime blocked",
      detail: event.task_id || eventType, source: "D1 agent_events",
    });
    else if (eventType.includes("RESULT") || eventType.includes("COMPLETE") || eventType.includes("SUCCESS")) push({
      id: event.id, kind: "RESULT", title: "New result",
      detail: event.task_id || eventType, source: "D1 agent_events",
    });
    else if (eventType.includes("TASK_CREATED") || eventType === "NEW") push({
      id: event.id, kind: "NEW", title: "New task event",
      detail: event.task_id || eventType, source: "D1 agent_events",
    });
  }

  if (bridge?.cross_surface_ready === true) push({
    id: "1lss-cross-surface", kind: "SYNCED", title: "1LSS cross-surface synced",
    detail: bridge.latest_sequence ? `latest #${bridge.latest_sequence}` : "canonical surfaces caught up",
    source: "/api/1lss/status",
  });

  for (const connector of connectors) {
    const state = upper(connector.state, "");
    if (["DEGRADED", "OFFLINE", "ERROR", "FAILED"].includes(state)) push({
      id: connector.id, kind: "DEGRADED_PROVIDER", title: `${connector.label} · ${state}`,
      detail: connector.summary || connector.route_mode || "provider state degraded",
      source: "/api/connectors",
    });
  }

  return out.slice(0, 20);
}

function State({ value }: { value: unknown }) {
  const state = upper(value);
  return <span className={`wnState ${stateTone(state)}`}>{state}</span>;
}

function percentValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function formatCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)).toLocaleString() : "—";
}

function MetricBar({ label, value, detail }: { label: string; value: unknown; detail?: string }) {
  const percent = percentValue(value);
  return <div className="wnMetric">
    <div className="wnMetricHead">
      <span>{label}</span>
      <strong>{percent === null ? "NOT_MEASURED" : `${percent.toFixed(1)}%`}</strong>
    </div>
    {percent !== null && <div className="wnMeter" aria-label={`${label} ${percent.toFixed(1)}%`}>
      <span className="wnMeterFill" style={{ width: `${percent}%` }} />
    </div>}
    {detail && <small>{detail}</small>}
  </div>;
}

function initialDashboardTab(fallback: Tab) {
  try {
    const requested = new URLSearchParams(window.location.search).get("tab");
    return (["run", "agent", "rules", "session", "connections", "approvals", "history"] as Tab[]).includes(requested as Tab)
      ? requested as Tab
      : fallback;
  } catch {
    return fallback;
  }
}

function surfaceTitle(surface: Surface) {
  if (surface === "command") return "Command Center";
  if (surface === "agents") return "Agent Deck";
  return "Operations Dashboard";
}

export default function UnifiendNext({ initialTab = "run", surface = "operate" }: Props) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>(() => initialDashboardTab(initialTab));
  const [command, setCommand] = useState("");
  const [resourcePath, setResourcePath] = useState("");
  const [advanced, setAdvanced] = useState(() => {
    try { return localStorage.getItem(COMMAND_VIEW_KEY) === "advanced"; } catch { return false; }
  });
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  useEffect(() => {
    const taskId = commandResult?.task?.id;
    const state = commandResult?.execution?.status;
    if (!taskId || !["DISPATCHED", "AWAITING_DISPATCH", "QUEUED", "RUNNING"].includes(String(state))) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/unifiend/command/status?task_id=" + encodeURIComponent(taskId), {
          credentials: "same-origin", cache: "no-store",
        });
        if (response.status === 401) {
          if (!cancelled) setCommandResult(old => old?.task?.id === taskId
            ? { ...old, execution: { status: "REAUTH_REQUIRED", consumer_proven: false } } : old);
          return;
        }
        if (!response.ok) return;
        const body = await response.json() as Pick<CommandResult, "task" | "execution" | "evidence">;
        if (!cancelled && body.task?.id === taskId) setCommandResult(old =>
          old?.task?.id === taskId ? { ...old, task: body.task, execution: body.execution, evidence: body.evidence } : old);
      } catch { /* keep last observed status */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [commandResult?.task?.id, commandResult?.execution?.status]);

  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selfHost, setSelfHost] = useState<SelfHost | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [violet, setViolet] = useState<VioletStatus>({ agents: [] });
  const [sessions, setSessions] = useState<SessionRef[]>([]);
  const [certificate, setCertificate] = useState<CertificateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runtimeState = useMemo(() => {
    if (!session?.authenticated) return "OFFLINE";
    if (dashboard.runtime?.provider) return "LIVE";
    return "DEGRADED";
  }, [dashboard.runtime?.provider, session?.authenticated]);

  const mentionChoices = useMemo(() => {
    const registered = (violet.agents ?? [])
      .filter((agent) => agent.agent_id && /^[a-z0-9_.-]+$/i.test(agent.agent_id))
      .slice(0, 30)
      .map((agent) => ({ label: agent.agent_id, detail: agent.visible_identity || agent.app || "Registered agent" }));
    return [...MENTION_PRESETS, ...registered.filter((agent) => !MENTION_PRESETS.some((known) => known.label.toLowerCase() === agent.label.toLowerCase()))];
  }, [violet.agents]);
  const activeMention = command.match(/(?:^|\s)@([a-z0-9_.-]*)$/i)?.[1];
  const mentionMatches = activeMention === undefined ? [] : mentionChoices
    .filter((item) => item.label.toLowerCase().includes(activeMention.toLowerCase()))
    .slice(0, 8);
  function chooseMention(label: string) {
    setCommand((prev) => prev.replace(/@([a-z0-9_.-]*)$/i, `@${label} `));
  }
  function toggleAdvanced() {
    setAdvanced((previous) => {
      const next = !previous;
      try { localStorage.setItem(COMMAND_VIEW_KEY, next ? "advanced" : "simple"); } catch { /* storage not required */ }
      return next;
    });
  }

  const runtimeSignals = useMemo(
    () => buildRuntimeSignals(dashboard, connectors, bridge),
    [dashboard, connectors, bridge],
  );

  const load = useCallback(async () => {
    if (!session?.authenticated) return;
    setLoading(true);
    setError("");
    try {
      const [dashR, connectorR, selfHostR, bridgeR, sessionsR, violetR, certificateR] = await Promise.all([
        fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/connectors", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/openai/selfhost/readiness", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/status", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/sessions?limit=12", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/violet/status", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/system/certificate-lincenc", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [dashB, connectorB, selfHostB, bridgeB, sessionsB, violetB, certificateB] = await Promise.all([
        dashR.json().catch(() => ({})),
        connectorR.json().catch(() => ({})),
        selfHostR.json().catch(() => ({})),
        bridgeR.json().catch(() => ({})),
        sessionsR.json().catch(() => ({})),
        violetR.json().catch(() => ({})),
        certificateR.json().catch(() => ({})),
      ]);
      if (dashR.ok) setDashboard(dashB as Dashboard);
      if (connectorR.ok && Array.isArray(connectorB.connectors)) setConnectors(connectorB.connectors as Connector[]);
      if (selfHostR.ok) setSelfHost(selfHostB as SelfHost);
      else setSelfHost({ ok: false, policy: String(selfHostB?.code || `HTTP_${selfHostR.status}`) });
      if (bridgeR.ok) setBridge(bridgeB as BridgeStatus);
      if (sessionsR.ok && Array.isArray(sessionsB.sessions)) setSessions(sessionsB.sessions as SessionRef[]);
      if (violetR.ok && Array.isArray(violetB.agents)) setViolet(violetB as VioletStatus);
      else setViolet({ agents: [] });
      setCertificate(certificateR.ok ? (certificateB as CertificateStatus) : {ok:false,code:String(certificateB?.code ?? ("HTTP_" + certificateR.status))});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Runtime status unavailable");
    } finally {
      setLoading(false);
    }
  }, [session?.authenticated]);

  useEffect(() => {
    void fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.json())
      .then((body: SessionState) => setSession(body))
      .catch(() => setSession({ authenticated: false, user: null }));
  }, []);

  useEffect(() => {
    if (session?.authenticated) void load();
  }, [session?.authenticated, load]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!ownerKey.trim()) return;
    setAuthError("");
    const response = await fetch("/api/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_key: ownerKey.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    setOwnerKey("");
    if (!response.ok || !body?.authenticated) {
      setAuthError(body?.message || body?.code || "Sign in failed");
      return;
    }
    setSession(body);
  }

  function handoff() {
    try {
      const text = command.trim();
      if (text) sessionStorage.setItem(HANDOFF_DRAFT_KEY, text);
    } catch { /* no-op */ }
    window.location.assign("/chat");
  }

  async function runGuardedCommand() {
    const intent = command.trim();
    const path = advanced ? resourcePath.trim() : "";
    if (!intent && !path) return;
    setCommandBusy(true);
    setCommandResult(null);
    try {
      // Simple mode routes natural language to the existing guarded Codex queue.
      // Advanced explicit path is the existing Yellow Stone verified READ lane.
      const requestBody: Record<string, unknown> = {
        intent: intent || `read file ${path}`,
        environment: "staging",
      };
      if (path) {
        requestBody.capability = "read_file";
        requestBody.provider = "github";
        requestBody.input = { path };
      } else {
        requestBody.capability = "codex_selfhost";
        requestBody.provider = "openai";
        requestBody.mode = "autonomous";
      }
      const response = await fetch("/api/unifiend/command", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(requestBody),
      });
      const body = await response.json().catch(() => ({ ok: false, code: `HTTP_${response.status}` })) as CommandResult;
      setCommandResult(body);
      if (body.canonical?.sequence) void load();
    } catch (cause) {
      setCommandResult({ ok: false, code: cause instanceof Error ? cause.message : "COMMAND_UNAVAILABLE" });
    } finally {
      setCommandBusy(false);
    }
  }

  if (session === null) {
    return <main className="wnRoot"><div className="wnLoading">Loading Unifiend…</div></main>;
  }

  if (!session.authenticated) {
    return <main className="wnRoot">
      <section className="wnAuth">
        <div className="wnKicker">Unifiend · OWNER ACCESS</div>
        <h1>{surfaceTitle(surface)}</h1>
        <p>Owner authentication is required before operational state is shown.</p>
        <form onSubmit={signIn} className="wnAuthForm">
          <input type="password" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} placeholder="Owner key" autoComplete="current-password" />
          <button type="submit">Sign in</button>
        </form>
        {authError && <div className="wnError">{authError}</div>}
        <div className="wnActionRow"><a className="wnButtonLink" href="/">Web</a><a className="wnButtonLink" href="/chat">Chat</a><a className="wnButtonLink" href="/command">Command</a></div>
      </section>
    </main>;
  }

  return <main className="wnRoot">
    <div className="wnFrame">
      <header className="wnHeader">
        <div>
          <div className="wnKicker">OGENIC / Unifiend</div>
          <h1>{surfaceTitle(surface)}</h1>
          <p>owner-main · 1LSS_OWNER_MAIN</p>
        </div>
        <div className="wnHeaderState"><State value={runtimeState} /><button onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button></div>
      </header>

      <nav className="wnTabs" aria-label="Unifiend surfaces">
        <a className={surface === "operate" ? "active" : ""} href="/">WEB</a>
        <a href="/chat">CHAT</a>
        <a className={surface === "command" ? "active" : ""} href="/command">COMMAND</a>
        <a className={surface === "agents" ? "active" : ""} href="/agents">AGENTS</a>
        <a className={surface === "operate" ? "active" : ""} href="/overview">OPERATE</a>
      </nav>

      {surface === "command" && <section className="wnHero wnCommandGlass">
        <div className="wnCommandHeading">
          <div className="wnHeroCopy">
            <span className="wnKicker">Unifiend COMMAND · SIGNED OWNER SESSION → RUN</span>
            <h2>สั่งงาน Unifiend ได้เลย</h2>
            <p>Owner ที่ล็อกอินแล้วส่งคำสั่งได้ทันที → Yellow Stone ตรวจสิทธิ์และ Adapter → Ocian-S-Host ทำงาน → Ruby / D1 เก็บหลักฐาน · ไม่ต้องกดยืนยันซ้ำ</p>
          </div>
          <button type="button" className="wnModeSwitch" aria-pressed={advanced} onClick={toggleAdvanced}>
            {advanced ? "Advanced · ON" : "Simple · ON"} <span aria-hidden="true">⌄</span>
          </button>
        </div>
        <label className="wnComposerLabel" htmlFor="unifiend-natural-command">ส่งคำสั่ง</label>
        <div className="wnComposerField">
          <textarea id="unifiend-natural-command" value={command}
            maxLength={1200} rows={4}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && activeMention !== undefined) { event.preventDefault(); setCommand((prev) => prev.replace(/@([a-z0-9_.-]*)$/i, "")); }
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void runGuardedCommand(); }
            }}
            placeholder="เช่น ตรวจหน้า Unifiend และแก้ปุ่มที่กดไม่ทำงาน จากนั้นทดสอบ Staging…" />
          {mentionMatches.length > 0 && <div className="wnMentionMenu" role="listbox" aria-label="แนะนำเอเจ้น ทีม และสกิล">
            {mentionMatches.map((option) => <button type="button" role="option" aria-selected={false} key={option.label}
              onClick={() => chooseMention(option.label)}>
              <strong>@{option.label}</strong><small>{option.detail}</small>
            </button>)}
          </div>}
        </div>
        <div className="wnMentionHint"><span>พิมพ์ <b>@</b> เพื่อเลือกเอเจ้น ทีม สกิล หรือเครื่องมือ</span><span>Signed Owner Session คือสิทธิ์สั่งงาน · ไม่ต้องยืนยันซ้ำ</span></div>
        {advanced && <section className="wnAdvancedOptions" aria-label="Advanced command options">
          <span className="wnKicker">ADVANCED OPTIONS · OPTIONAL</span>
          <p>เลือกเฉพาะเมื่อจำเป็น เช่น อ่านไฟล์ GitHub แบบเจาะจง โดยไม่ต้องส่งงานให้ Codex</p>
          <label htmlFor="unifiend-resource-path">GitHub file path (optional)</label>
          <input id="unifiend-resource-path" value={resourcePath} onChange={(event) => setResourcePath(event.target.value)}
            placeholder="Optional GitHub file path for verified READ, e.g. package.json" />
          <small>ระบุ Path เพื่อใช้โหมด Verified READ เท่านั้น · การเลือก @ เป็นคำใบ้ ไม่ได้ข้ามการจัดเส้นทางของ Yellow Stone</small>
        </section>}
        <div className="wnRunActions">
          <button type="button" className="wnPrimary" onClick={() => void runGuardedCommand()}
            disabled={commandBusy || (!command.trim() && !(advanced && resourcePath.trim()))}>
            {commandBusy ? "กำลังส่ง…" : "Sign & Run →"}
          </button>
          <button type="button" onClick={handoff}>เปิดใน Unifiend Chat</button>
          {advanced && <a className="wnButtonLink" href="/agents">Agent controls</a>}
          {advanced && <span className="wnAdvancedAlias">Run guarded command</span>}
        </div>
        {commandResult && <article className="wnCard wnCommandReceipt">
          <div className="wnCardHead">
            <div><span className="wnKicker">COMMAND RECEIPT</span>
              <h3>{commandResult.ok ? "ระบบรับคำสั่งแล้ว" : "ไม่สามารถดำเนินคำสั่งได้"}</h3>
            </div>
            <State value={commandResult.execution?.status || commandResult.verification?.status || commandResult.code || "PENDING"} />
          </div>
          <dl className="wnFacts">
            <div><dt>Authority</dt><dd>{commandResult.command_handoff?.execution_authority || "YELLOW_STONE_ONLY"}</dd></div>
            <div><dt>Capability</dt><dd>{commandResult.command_plan?.capability || commandResult.approval?.capability_id || commandResult.resolver?.descriptor?.capability_id || "—"}</dd></div>
            <div><dt>Provider</dt><dd>{commandResult.command_plan?.provider || commandResult.approval?.provider_id || commandResult.resolver?.descriptor?.provider_id || "—"}</dd></div>
            <div><dt>Task / Run</dt><dd>{commandResult.task?.id || commandResult.run_id || "—"}</dd></div>
            <div><dt>1LSS</dt><dd>{commandResult.canonical?.sequence ? `#${commandResult.canonical.sequence}` : commandResult.code || commandResult.verification?.reason || "no new evidence"}</dd></div>
          </dl>
          {commandResult.code === "ADAPTER_NOT_IMPLEMENTED" && <div className="wnPolicy">ไม่มี Adapter สำหรับคำสั่งนี้ · ไม่ต้องขออนุมัติใหม่</div>}
          {commandResult.code === "COMMAND_MANUAL_DISPATCH_REQUIRED" && commandResult.dispatch && <div className="wnPolicy">
            <strong>ส่งงานเก็บใน D1 แล้ว · GitHub Actions API ยังไม่มีสิทธิ์ Dispatch</strong>
            <p>เปิด Workflow ด้วยบัญชี GitHub Owner → เลือก Staging → Run workflow → วาง Task ID ด้านล่าง ระบบจะส่งผลกลับ D1 โดยอัตโนมัติ</p>
            <div className="wnRunActions">
              <a className="wnButtonLink" href={commandResult.dispatch.workflow_url} target="_blank" rel="noreferrer">เปิด Workflow บน GitHub →</a>
              <button type="button" onClick={() => {
                void navigator.clipboard?.writeText(commandResult.dispatch?.task_id || "").catch(() => {});
              }}>Copy Task ID</button>
            </div>
            <code>{commandResult.dispatch.task_id}</code>
          </div>}
          {commandResult.execution?.consumer_proven && <div className="wnPolicy">COMMAND_RESULT_DONE · Ocian-S-Host ส่ง SHA-256 กลับ D1 สำเร็จ</div>}
          {commandResult.evidence?.evidence_ref && <a href={commandResult.evidence.evidence_ref} target="_blank" rel="noreferrer">ดูหลักฐาน Ocian-S-Host</a>}
          {commandResult.execution?.status === "QUEUED" && <div className="wnPolicy">ยังไม่มีผลการทำงานจาก Ocian-S-Host · ตรวจการเชื่อมต่อและผลคำสั่ง</div>}
          {commandResult.result?.path && <div className="wnPolicy">Verified READ · {commandResult.result.path} · {commandResult.result.sha || "sha unavailable"}</div>}
        </article>}
      </section>}

      <nav className="wnTabs" aria-label="Unifiend dashboard sections">
        {(["run", "agent", "rules", "session", "connections", "approvals", "history"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {error && <div className="wnError">{error}</div>}

      {tab === "run" && <section className="wnGrid wnGrid2">
        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">RUNTIME</span><h3>Canonical staging</h3></div><State value={runtimeState} /></div>
          <dl className="wnFacts">
            <div><dt>Provider</dt><dd>{dashboard.runtime?.provider || "—"}</dd></div>
            <div><dt>Branch</dt><dd>{dashboard.runtime?.branch || selfHost?.branch || "Unified-on-Progress"}</dd></div>
            <div><dt>1LSS</dt><dd>{bridge?.cross_surface_ready ? "cross-surface ready" : "status pending"}</dd></div>
            <div><dt>Latest sequence</dt><dd>{bridge?.latest_sequence ?? "—"}</dd></div>
          </dl>
        </article>

        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">OGENIC · CANONICAL D1 EVIDENCE</span><h3>Certificate lincenc</h3></div><State value={certificate?.ok ? "VERIFIED" : "NOT_VERIFIED"} /></div>
          <p className="wnBody">Owner authorization evidence, not SSL/TLS or present-day execution authority.</p>
          <dl className="wnFacts">
            <div><dt>Certificate</dt><dd>{certificate?.certificate_id || certificate?.code || "NOT_READ"}</dd></div>
            <div><dt>D1 integrity</dt><dd>{certificate?.integrity || "NOT_VERIFIED"}</dd></div>
            <div><dt>Plugins</dt><dd>{certificate?.plugins ? String(certificate.plugins.total ?? 0) + " groups / " + String(certificate.plugins.historical_verified_read_api ?? 0) + " historical read-API proofs" : "—"}</dd></div>
            <div><dt>GitHub identities</dt><dd>{certificate?.owner_identity_labels?.github_first?.label || "Tawatchai"} / {certificate?.owner_identity_labels?.github_second?.label || "Tomload21"}</dd></div>
            <div><dt>Codex TS historical</dt><dd>{certificate?.owner_identity_labels?.codex_ts?.historical_execution_result || "NOT_VERIFIED"}</dd></div>
            <div><dt>Current E2E</dt><dd>{certificate?.runtime_e2e_verified ? "VERIFIED" : "NOT_PROVEN_BY_CERTIFICATE"}</dd></div>
          </dl>
          <p className="wnBody"><a href={certificate?.canonical_source?.url || "https://github.com/GH-ADDMINPOVIDER/Build-Platform/blob/task/oge-128-runtime-certificate-20261018/.ogenic/proofs/oge-128-wave-runner-01-certificate-baseline.json"} target="_blank" rel="noreferrer">Original Certificate in GitHub ↗</a></p>
        </article>

        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">SSH-Unifiend</span><h3>Manual fallback</h3></div><State value={selfHost?.github_dispatch || "CONFIGURATION_REQUIRED"} /></div>
          <p className="wnBody">Use any iOS SSH client. The private key stays on the phone; Unifiend never stores or renders it.</p>
          <dl className="wnFacts">
            <div><dt>Host</dt><dd>{SSH_HOST}</dd></div>
            <div><dt>User</dt><dd>{SSH_USER}</dd></div>
            <div><dt>Port</dt><dd>use host SSH config</dd></div>
            <div><dt>Machine</dt><dd>{selfHost?.machine?.display_name || "SELF HOST_MACHINE"}</dd></div>
            <div><dt>Physical host</dt><dd>{selfHost?.machine?.physical_hostname || "Ocian-S-Host"}</dd></div>
          </dl>
        </article>

        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">JOBS</span><h3>Current task queue</h3></div><span className="wnCount">{dashboard.tasks?.length ?? 0}</span></div>
          <div className="wnRows">
            {(dashboard.tasks ?? []).slice(0, 6).map((job) => <div className="wnRow" key={job.id}>
              <div><strong>{job.title || job.id}</strong><span>{job.capability || "capability not set"} · {job.claimed_by || "unclaimed"}</span></div>
              <div className="wnRowMeta"><State value={job.status || "NOT_MEASURED"} /><br />{timestampAgo(job.updated_at ?? job.created_at)}</div>
            </div>)}
            {!dashboard.tasks?.length && <div className="wnEmpty">No task rows returned by canonical D1.</div>}
          </div>
        </article>

        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">RUNS</span><h3>Recent execution</h3></div><span className="wnCount">{dashboard.runs?.length ?? 0}</span></div>
          <div className="wnRows">
            {(dashboard.runs ?? []).slice(0, 6).map((run) => <div className="wnRow" key={run.id}>
              <div><strong>{run.workflow_id || run.id}</strong><span>{run.current_node_id || "node —"}{run.error_json ? " · redacted error available" : ""}</span></div>
              <div className="wnRowMeta"><State value={run.status || "NOT_MEASURED"} /><br />{timestampAgo(run.updated_at ?? run.created_at)}</div>
            </div>)}
            {!dashboard.runs?.length && <div className="wnEmpty">No execution rows returned by canonical D1.</div>}
          </div>
        </article>

        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">SIGNALS</span><h3>Real runtime notifications</h3></div><span className="wnCount">{runtimeSignals.length}</span></div>
          <p className="wnBody">Only evidence-backed state is shown. No fake notification dots or synthetic counts.</p>
          <div className="wnRows">
            {runtimeSignals.slice(0, 8).map((signal) => <div className="wnRow" key={`${signal.kind}:${signal.id}`}>
              <div><strong>{signal.title}</strong><span>{signal.detail} · {signal.source}</span></div>
              <State value={signal.kind} />
            </div>)}
            {!runtimeSignals.length && <div className="wnEmpty">No current runtime signals.</div>}
          </div>
        </article>
      </section>}

      {tab === "agent" && <>
        <LocalAgentTeamPanel />
        <WhiteDiamondPanel />
        <VioletDistributionPanel />

        <section className="wnStatusSection">
          <div className="wnStatusTitle">
            <div><span className="wnKicker">CAPACITY / QUOTA</span><h3>Evidence-backed capacity</h3></div>
            <State value={dashboard.incentives?.policy_state || "NOT_MEASURED"} />
          </div>
          <div className="wnStatusGrid">
            {(dashboard.incentives?.pools ?? []).map((pool) => <article className="wnStatusCard" key={pool.id}>
              <div className="wnCardHead"><div><strong>{pool.label}</strong><span>{pool.telemetry || "NOT_MEASURED"}</span></div><State value={pool.state} /></div>
              <MetricBar
                label="Used"
                value={pool.percent}
                detail={pool.cap === null ? "Cap NOT_MEASURED" : `${formatCount(pool.remaining)} remaining / ${formatCount(pool.cap)} cap`}
              />
              <small className="wnStatusFoot">Reset {dashboard.incentives?.reset_at || "NOT_MEASURED"}</small>
            </article>)}
            {!dashboard.incentives?.pools?.length && <article className="wnStatusCard">
              <div className="wnCardHead"><div><strong>Provider capacity</strong><span>Telemetry unavailable</span></div><State value="NOT_MEASURED" /></div>
              <MetricBar label="Used" value={null} />
            </article>}

            <article className="wnStatusCard">
              <div className="wnCardHead"><div><strong>Codex quota</strong><span>Separate from runtime readiness</span></div><State value="NOT_MEASURED" /></div>
              <MetricBar label="Quota used" value={null} detail="No verified measurable quota source is bound." />
            </article>

            <article className="wnStatusCard">
              <div className="wnCardHead"><div><strong>Self-host runtime</strong><span>Availability only · not token quota</span></div><State value={selfHost?.openai_app_key || selfHost?.github_dispatch || "CONFIGURATION_REQUIRED"} /></div>
              <div className="wnStatusFacts"><span>Executor</span><strong>{selfHost?.executor_workflow || "NOT_MEASURED"}</strong></div>
            </article>
          </div>
        </section>

        <section className="wnStatusSection">
          <div className="wnStatusTitle">
            <div><span className="wnKicker">AGENT STATUS</span><h3>Violet / Ruby telemetry</h3></div>
            <span className="wnCount">{violet.agents?.length ?? 0}</span>
          </div>
          <div className="wnStatusGrid">
            {(violet.agents ?? []).map((agent) => <article className="wnStatusCard" key={agent.agent_id}>
              <div className="wnCardHead">
                <div><strong>{agent.visible_identity || `${agent.app || agent.agent_id} • Agent • ${agent.rank || "—"}`}</strong><span>{agent.agent_id}</span></div>
                <State value={agent.status || agent.availability_state || "NOT_MEASURED"} />
              </div>
              <MetricBar label="Success" value={agent.stats?.success_rate} />
              <MetricBar
                label="Accuracy"
                value={agent.stats?.accuracy}
                detail={agent.stats?.accuracy_state === "MEASURED" ? `n=${formatCount(agent.stats?.accuracy_sample_size)}` : "Ruby evidence NOT_MEASURED"}
              />
              <div className="wnStatusFacts">
                <span>Jobs {formatCount(agent.stats?.jobs_assigned)}</span>
                <span>Done {formatCount(agent.stats?.completed)}</span>
                <span>Failed {formatCount(agent.stats?.failed)}</span>
                <span>Blocked {formatCount(agent.stats?.blocked)}</span>
              </div>
            </article>)}
            {!violet.agents?.length && <article className="wnStatusCard">
              <div className="wnCardHead"><div><strong>Agent telemetry</strong><span>Only verified Violet Agents are rendered.</span></div><State value="NOT_MEASURED" /></div>
              <MetricBar label="Success" value={null} />
              <MetricBar label="Accuracy" value={null} />
            </article>}
          </div>
        </section>

        <section className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">EXECUTION</span><h3>Yellow Stone handoff</h3></div><State value={selfHost?.openai_app_key || "CONFIGURATION_REQUIRED"} /></div>
          <p className="wnBody">White Diamond may plan and select agents, but consequential execution remains behind Yellow Stone policy and owner approval.</p>
          <div className="wnActionRow"><a className="wnButtonLink wnPrimary" href="/command">Open Command</a><a className="wnButtonLink" href="/chat">Open Unifiend Chat</a><a className="wnButtonLink" href="/overview">Open Operate</a></div>
          <div className="wnPolicy">{selfHost?.policy || "Policy status unavailable"}</div>
        </section>
      </>}

      {tab === "rules" && <StoneRulePanel />}

      {tab === "session" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">GREEN STONE</span><h3>Session continuity</h3></div><State value={bridge?.cross_surface_ready ? "READY" : "DEGRADED"} /></div>
        <p className="wnBody">owner-main / 1LSS_OWNER_MAIN remains canonical. These are observed session references, not new memory stores.</p>
        <div className="wnRows">{sessions.slice(0, 6).map((row) => <div className="wnRow" key={row.id}><div><strong>{row.label || row.source_surface}</strong><span>{row.session_ref}</span></div><div className="wnRowMeta">seq {row.last_sequence ?? "—"}<br />{timeAgo(row.last_seen_at)}</div></div>)}{!sessions.length && <div className="wnEmpty">No session references returned.</div>}</div>
      </section>}

      {tab === "connections" && <>
        <section className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">YELLOW STONE</span><h3>Connections</h3></div><span className="wnCount">{connectors.length}</span></div>
          <p className="wnBody">States below come from the existing connector runtime. No fake LIVE state is added.</p>
          <div className="wnRows">{connectors.map((row) => <div className="wnRow" key={row.id}><div><strong>{row.label}</strong><span>{row.kind || "connector"} · {row.route_mode || "—"}{row.summary ? ` · ${row.summary}` : ""}</span></div><State value={row.state} /></div>)}{!connectors.length && <div className="wnEmpty">No connector state returned.</div>}</div>
        </section>
        <McpConfigCenter />
      </>}

      {tab === "approvals" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">POLICY</span><h3>Owner authority</h3></div><State value="OWNER_SESSION_REQUIRED" /></div>
        <p className="wnBody">Signed Owner Session is final authorization for staging commands. Missing adapters, invalid credentials, unsupported destinations and Production remain blocked.</p>
        <dl className="wnFacts"><div><dt>Self-host policy</dt><dd>{selfHost?.policy || "—"}</dd></div><div><dt>Executor workflow</dt><dd>{selfHost?.executor_workflow || "—"}</dd></div></dl>
      </section>}

      {tab === "history" && <>
        <section className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">HISTORY</span><h3>Recent 1LSS sessions</h3></div><State value={bridge?.ok ? "READY" : "DEGRADED"} /></div>
          <div className="wnRows">{sessions.map((row) => <div className="wnRow" key={row.id}><div><strong>{row.label || row.source_surface}</strong><span>{row.source_surface}</span></div><div className="wnRowMeta">#{row.last_sequence ?? "—"}<br />{timeAgo(row.last_seen_at)}</div></div>)}{!sessions.length && <div className="wnEmpty">No session history returned.</div>}</div>
        </section>

        <section className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">EXECUTION HISTORY</span><h3>Canonical D1 runs</h3></div><span className="wnCount">{dashboard.runs?.length ?? 0}</span></div>
          <div className="wnRows">{(dashboard.runs ?? []).map((run) => <div className="wnRow" key={run.id}><div><strong>{run.workflow_id || run.id}</strong><span>{run.id} · {run.current_node_id || "node —"}</span></div><div className="wnRowMeta"><State value={run.status || "NOT_MEASURED"} /><br />{timestampAgo(run.updated_at ?? run.created_at)}</div></div>)}{!dashboard.runs?.length && <div className="wnEmpty">No execution history returned.</div>}</div>
        </section>

        <section className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">EVIDENCE / REFERENCES</span><h3>Recent runtime events</h3></div><span className="wnCount">{dashboard.events?.length ?? 0}</span></div>
          <p className="wnBody">References come from canonical event rows. Unifiend only creates a link when the stored reference is an actual http(s) URL.</p>
          <div className="wnRows">{(dashboard.events ?? []).map((event) => {
            const href = safeExternalHref(event.external_ref);
            return <div className="wnRow" key={event.id}><div><strong>{event.event_type || "EVENT"}</strong><span>{event.actor || "actor —"} · {event.task_id || "task —"}</span>{event.external_ref && (href ? <a className="wnEvidenceLink" href={href} target="_blank" rel="noreferrer">Open reference ↗</a> : <small className="wnEvidenceRef">{event.external_ref}</small>)}</div><div className="wnRowMeta">{timestampAgo(event.created_at)}</div></div>;
          })}{!dashboard.events?.length && <div className="wnEmpty">No event/evidence references returned.</div>}</div>
        </section>
      </>}

      <footer className="wnFooter">
        <a href="/">Web</a><a href="/chat">Chat</a><a href="/command">Command</a><a href="/agents">Agents</a><a href="/overview">Operate</a><span>Private keys stay local</span>
      </footer>
    </div>
  </main>;
}
