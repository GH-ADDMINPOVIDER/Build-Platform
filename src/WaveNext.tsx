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
  policy?: string;
  verification?: { status?: string; reason?: string };
  approval?: { required?: boolean; permission_class?: string; capability_id?: string; provider_id?: string; environment?: string | null };
  resolver?: { status?: string; descriptor?: { capability_id?: string; provider_id?: string; permission_class?: string } };
  result?: { path?: string; sha?: string; content_excerpt?: string; content_redacted?: boolean };
  canonical?: { conversation_id?: string; session_line?: string; sequence?: number; replayed?: boolean };
  command_handoff?: { admission?: string; actor_id?: string; execution_authority?: string; yellow_stone_route?: string; direct_execution_bypass?: boolean };
};

type Tab = "run" | "agent" | "rules" | "session" | "connections" | "approvals" | "history";
type Surface = "operate" | "command" | "agents";
type Props = { initialTab?: Tab; surface?: Surface };

const HANDOFF_DRAFT_KEY = "ogenic.wave-next.handoff.v1";
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

export default function WaveNext({ initialTab = "run", surface = "operate" }: Props) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>(() => initialDashboardTab(initialTab));
  const [command, setCommand] = useState("");
  const [resourcePath, setResourcePath] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selfHost, setSelfHost] = useState<SelfHost | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [violet, setViolet] = useState<VioletStatus>({ agents: [] });
  const [sessions, setSessions] = useState<SessionRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runtimeState = useMemo(() => {
    if (!session?.authenticated) return "OFFLINE";
    if (dashboard.runtime?.provider) return "LIVE";
    return "DEGRADED";
  }, [dashboard.runtime?.provider, session?.authenticated]);

  const runtimeSignals = useMemo(
    () => buildRuntimeSignals(dashboard, connectors, bridge),
    [dashboard, connectors, bridge],
  );

  const load = useCallback(async () => {
    if (!session?.authenticated) return;
    setLoading(true);
    setError("");
    try {
      const [dashR, connectorR, selfHostR, bridgeR, sessionsR, violetR] = await Promise.all([
        fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/connectors", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/openai/selfhost/readiness", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/status", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/sessions?limit=12", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/violet/status", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [dashB, connectorB, selfHostB, bridgeB, sessionsB, violetB] = await Promise.all([
        dashR.json().catch(() => ({})),
        connectorR.json().catch(() => ({})),
        selfHostR.json().catch(() => ({})),
        bridgeR.json().catch(() => ({})),
        sessionsR.json().catch(() => ({})),
        violetR.json().catch(() => ({})),
      ]);
      if (dashR.ok) setDashboard(dashB as Dashboard);
      if (connectorR.ok && Array.isArray(connectorB.connectors)) setConnectors(connectorB.connectors as Connector[]);
      if (selfHostR.ok) setSelfHost(selfHostB as SelfHost);
      else setSelfHost({ ok: false, policy: String(selfHostB?.code || `HTTP_${selfHostR.status}`) });
      if (bridgeR.ok) setBridge(bridgeB as BridgeStatus);
      if (sessionsR.ok && Array.isArray(sessionsB.sessions)) setSessions(sessionsB.sessions as SessionRef[]);
      if (violetR.ok && Array.isArray(violetB.agents)) setViolet(violetB as VioletStatus);
      else setViolet({ agents: [] });
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
    const path = resourcePath.trim();
    if (!intent && !path) return;
    setCommandBusy(true);
    setCommandResult(null);
    try {
      const requestBody: Record<string, unknown> = {
        intent: intent || `read file ${path}`,
        environment: "staging",
      };
      if (path) {
        requestBody.capability = "read_file";
        requestBody.provider = "github";
        requestBody.input = { path };
      }
      const response = await fetch("/api/wave/command", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const body = await response.json().catch(() => ({ ok: false, code: `HTTP_${response.status}` }));
      setCommandResult(body as CommandResult);
      if (body?.canonical?.sequence) void load();
    } catch (cause) {
      setCommandResult({ ok: false, code: cause instanceof Error ? cause.message : "COMMAND_UNAVAILABLE" });
    } finally {
      setCommandBusy(false);
    }
  }

  if (session === null) {
    return <main className="wnRoot"><div className="wnLoading">Loading WAVE…</div></main>;
  }

  if (!session.authenticated) {
    return <main className="wnRoot">
      <section className="wnAuth">
        <div className="wnKicker">WAVE · OWNER ACCESS</div>
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
          <div className="wnKicker">OGENIC / WAVE</div>
          <h1>{surfaceTitle(surface)}</h1>
          <p>owner-main · 1LSS_OWNER_MAIN</p>
        </div>
        <div className="wnHeaderState"><State value={runtimeState} /><button onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button></div>
      </header>

      <nav className="wnTabs" aria-label="WAVE surfaces">
        <a className={surface === "operate" ? "active" : ""} href="/">WEB</a>
        <a href="/chat">CHAT</a>
        <a className={surface === "command" ? "active" : ""} href="/command">COMMAND</a>
        <a className={surface === "agents" ? "active" : ""} href="/agents">AGENTS</a>
        <a className={surface === "operate" ? "active" : ""} href="/overview">OPERATE</a>
      </nav>

      {surface === "command" && <section className="wnHero">
        <div className="wnHeroCopy">
          <span className="wnKicker">RUN / COMMAND</span>
          <h2>What should WAVE do?</h2>
          <p>Guarded Run enters through ATHENA admission and always delegates execution authority to Yellow Stone. Higher-risk actions stop at owner approval; no provider can execute directly from this surface.</p>
        </div>
        <textarea value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Tell WAVE what to do…" rows={5} />
        <input value={resourcePath} onChange={(e) => setResourcePath(e.target.value)} placeholder="Optional GitHub file path for verified READ, e.g. package.json" />
        <div className="wnRunActions">
          <button className="wnPrimary" onClick={() => void runGuardedCommand()} disabled={commandBusy || (!command.trim() && !resourcePath.trim())}>{commandBusy ? "Routing…" : "Run guarded command"}</button>
          <button onClick={handoff}>Open WAVE Chat with draft</button>
          <a className="wnButtonLink" href="/agents">Agent controls</a>
        </div>
        {commandResult && <article className="wnCard">
          <div className="wnCardHead">
            <div><span className="wnKicker">COMMAND RESULT</span><h3>{commandResult.ok ? "Yellow Stone result" : "Guarded stop"}</h3></div>
            <State value={commandResult.verification?.status || commandResult.code || (commandResult.ok ? "VERIFIED" : "BLOCKED")} />
          </div>
          <dl className="wnFacts">
            <div><dt>Admission</dt><dd>{commandResult.command_handoff?.admission || "—"}</dd></div>
            <div><dt>Authority</dt><dd>{commandResult.command_handoff?.execution_authority || "YELLOW_STONE_ONLY"}</dd></div>
            <div><dt>Capability</dt><dd>{commandResult.approval?.capability_id || commandResult.resolver?.descriptor?.capability_id || "—"}</dd></div>
            <div><dt>Provider</dt><dd>{commandResult.approval?.provider_id || commandResult.resolver?.descriptor?.provider_id || "—"}</dd></div>
            <div><dt>Run</dt><dd>{commandResult.run_id || "—"}</dd></div>
            <div><dt>1LSS</dt><dd>{commandResult.canonical?.sequence ? `#${commandResult.canonical.sequence}` : commandResult.code || commandResult.verification?.reason || "no new evidence"}</dd></div>
          </dl>
          {commandResult.approval?.required && <div className="wnPolicy">Owner approval required · {commandResult.approval.permission_class || "NON_READ"}. No side effect executed.</div>}
          {commandResult.result?.path && <div className="wnPolicy">Verified READ · {commandResult.result.path} · {commandResult.result.sha || "sha unavailable"}</div>}
        </article>}
      </section>}

      <nav className="wnTabs" aria-label="WAVE dashboard sections">
        {(["run", "agent", "rules", "session", "connections", "approvals", "history"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {error && <div className="wnError">{error}</div>}

      {tab === "run" && <section className="wnGrid wnGrid2">
        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">RUNTIME</span><h3>Canonical staging</h3></div><State value={runtimeState} /></div>
          <dl className="wnFacts">
            <div><dt>Provider</dt><dd>{dashboard.runtime?.provider || "—"}</dd></div>
            <div><dt>Branch</dt><dd>{dashboard.runtime?.branch || selfHost?.branch || "phase-vi-provider-incentive-metering"}</dd></div>
            <div><dt>1LSS</dt><dd>{bridge?.cross_surface_ready ? "cross-surface ready" : "status pending"}</dd></div>
            <div><dt>Latest sequence</dt><dd>{bridge?.latest_sequence ?? "—"}</dd></div>
          </dl>
        </article>

        <article className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">SSH-WAVE</span><h3>Manual fallback</h3></div><State value={selfHost?.github_dispatch || "CONFIGURATION_REQUIRED"} /></div>
          <p className="wnBody">Use any iOS SSH client. The private key stays on the phone; WAVE never stores or renders it.</p>
          <dl className="wnFacts">
            <div><dt>Host</dt><dd>{SSH_HOST}</dd></div>
            <div><dt>User</dt><dd>{SSH_USER}</dd></div>
            <div><dt>Port</dt><dd>use host SSH config</dd></div>
            <div><dt>Runner</dt><dd>wave-runner-01</dd></div>
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
          <div className="wnActionRow"><a className="wnButtonLink wnPrimary" href="/command">Open Command</a><a className="wnButtonLink" href="/chat">Open WAVE Chat</a><a className="wnButtonLink" href="/overview">Open Operate</a></div>
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
        <div className="wnCardHead"><div><span className="wnKicker">POLICY</span><h3>Approvals</h3></div><State value="HUMAN_APPROVAL_REQUIRED" /></div>
        <p className="wnBody">Consequential execution stays approval-gated. This view does not auto-approve SSH, deploy, delete, secret, billing, or production actions.</p>
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
          <p className="wnBody">References come from canonical event rows. WAVE only creates a link when the stored reference is an actual http(s) URL.</p>
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
