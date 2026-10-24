import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import DiscordWorkspacePanel from "./DiscordWorkspacePanel";
import UnifiedOpsPanel from "./UnifiedOpsPanel";

type Session = { authenticated?: boolean; user?: { label?: string; role?: string } | null };
type Dashboard = {
  runtime?: { provider?: string; database?: string; branch?: string; git_sha?: string };
  tasks?: Array<{ id: string; title?: string; status?: string; capability?: string | null; updated_at?: string | number | null }>;
  runs?: Array<{ id: string; workflow_id?: string; status?: string; current_node_id?: string | null; updated_at?: string | number | null }>;
  incentives?: { policy_state?: string; routing_mode?: string; pools?: Array<{ id: string; label?: string; state?: string; percent?: number | null }> };
};
type Connector = { id: string; label: string; state: string; summary?: string; kind?: string };
type Bridge = { ok?: boolean; cross_surface_ready?: boolean; latest_sequence?: number; checked_at?: number };
type Actor = {
  actor_id: string;
  label: string;
  provider: string;
  actor_class: string;
  maturity: string;
  state: string;
  agent_eligible: boolean;
  capabilities?: string[];
};
type Registry = { ok?: boolean; actors?: Actor[]; agent_count?: number; tool_or_runtime_count?: number };
type Violet = { ok?: boolean; agents?: Array<{ agent_id: string; visible_identity?: string; status?: string; availability_state?: string }> };

function upper(value: unknown, fallback = "NOT_MEASURED") {
  const text = String(value ?? "").trim().toUpperCase();
  return text || fallback;
}

function stateClass(value: unknown) {
  const state = upper(value);
  if (["LIVE", "READY", "VERIFIED", "ACTIVE", "BOUND", "OPERATIONAL"].includes(state)) return "isLive";
  if (["DEGRADED", "BRIDGE_ONLY", "BLOCKED", "CONFIGURATION_REQUIRED", "WAITING"].includes(state)) return "isWarn";
  if (["FAILED", "ERROR", "OFFLINE"].includes(state)) return "isBad";
  return "isQuiet";
}

function humanTime(value: unknown) {
  if (!value) return "—";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function Status({ value }: { value: unknown }) {
  const state = upper(value);
  return <span className={`wdStatus ${stateClass(state)}`}><i />{state}</span>;
}

const CHANNELS = [
  {
    id: "chat",
    eyebrow: "CHAT API",
    title: "WAVE Chat",
    description: "Same Mind · owner-main · 1LSS. งานคุยและบริบทต่อเนื่องเข้าทางนี้",
    href: "/chat",
  },
  {
    id: "command",
    eyebrow: "CHATGPT MAIN / ATHENA",
    title: "Command",
    description: "รับคำสั่ง → ATHENA admission → Yellow execution authority แบบ guarded",
    href: "/command",
  },
  {
    id: "agents",
    eyebrow: "AGENT AI",
    title: "Agents",
    description: "ดูและส่งงานให้ multi-agent roster, specialist lanes และ execution fabric",
    href: "/agents",
  },
] as const;

export default function WaveDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [registry, setRegistry] = useState<Registry>({});
  const [violet, setViolet] = useState<Violet>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!session?.authenticated) return;
    setLoading(true);
    setLoadError("");
    try {
      const [dashR, connectorR, bridgeR, registryR, violetR] = await Promise.all([
        fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/connectors", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/status", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/blue-diamond/registry", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/violet/status", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [dashB, connectorB, bridgeB, registryB, violetB] = await Promise.all([
        dashR.json().catch(() => ({})),
        connectorR.json().catch(() => ({})),
        bridgeR.json().catch(() => ({})),
        registryR.json().catch(() => ({})),
        violetR.json().catch(() => ({})),
      ]);
      if (dashR.ok) setDashboard(dashB as Dashboard);
      if (connectorR.ok && Array.isArray(connectorB.connectors)) setConnectors(connectorB.connectors as Connector[]);
      if (bridgeR.ok) setBridge(bridgeB as Bridge);
      if (registryR.ok) setRegistry(registryB as Registry);
      if (violetR.ok) setViolet(violetB as Violet);
      if (!dashR.ok && !registryR.ok) throw new Error("Dashboard runtime unavailable");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Dashboard runtime unavailable");
    } finally {
      setLoading(false);
    }
  }, [session?.authenticated]);

  useEffect(() => {
    void fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.json())
      .then((body: Session) => setSession(body))
      .catch(() => setSession({ authenticated: false, user: null }));
  }, []);

  useEffect(() => {
    if (session?.authenticated) void load();
  }, [session?.authenticated, load]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const key = ownerKey.trim();
    if (!key) return;
    setAuthError("");
    const response = await fetch("/api/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_key: key }),
    });
    const body = await response.json().catch(() => ({}));
    setOwnerKey("");
    if (!response.ok || !body?.authenticated) {
      setAuthError(body?.message || body?.code || "Sign in failed");
      return;
    }
    setSession(body);
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    setSession({ authenticated: false, user: null });
  }

  const actors = registry.actors ?? [];
  const athena = actors.find((actor) => actor.actor_id === "athena-command");
  const eligibleAgents = actors.filter((actor) => actor.agent_eligible);
  const usableAgents = eligibleAgents.filter((actor) => ["LIVE", "READY", "DEGRADED", "BRIDGE_ONLY"].includes(upper(actor.state)));
  const liveConnectors = connectors.filter((connector) => ["LIVE", "READY", "BOUND", "CONFIGURED", "OPERATIONAL"].includes(upper(connector.state)));
  const openTasks = (dashboard.tasks ?? []).filter((task) => !["DONE", "COMPLETE", "COMPLETED", "SUCCESS", "SUCCEEDED", "CANCELED"].includes(upper(task.status, "")));
  const activeRuns = (dashboard.runs ?? []).filter((run) => ["QUEUED", "RUNNING", "WAITING", "VERIFYING"].includes(upper(run.status, "")));

  const channelState = useMemo(() => ({
    chat: bridge?.cross_surface_ready ? "LIVE" : bridge?.ok ? "DEGRADED" : "NOT_MEASURED",
    command: athena?.state || "NOT_MEASURED",
    agents: usableAgents.length ? "READY" : registry.ok ? "DEGRADED" : "NOT_MEASURED",
  }), [athena?.state, bridge?.cross_surface_ready, bridge?.ok, registry.ok, usableAgents.length]);

  if (session === null) {
    return <main className="wdRoot"><div className="wdLoading">Loading WAVE…</div></main>;
  }

  if (!session.authenticated) {
    return <main className="wdRoot wdAuthRoot">
      <section className="wdAuth">
        <div className="wdLogo"><img src="/assets/wave-logo.webp" alt="" /><span><b>WAVE</b><small>OGENIC · PHASE II</small></span></div>
        <div className="wdAuthCopy">
          <span>OWNER WORKSPACE</span>
          <h1>One system.<br />Three channels.</h1>
          <p>Dashboard · Chat API · Command · Agent AI แยกหน้าที่ชัดเจน แต่ยังอยู่บน owner-main / 1LSS เดียวกัน</p>
        </div>
        <form onSubmit={signIn} className="wdAuthForm">
          <input type="password" value={ownerKey} onChange={(event) => setOwnerKey(event.target.value)} placeholder="Owner access key" autoComplete="current-password" />
          <button type="submit">Continue</button>
        </form>
        {authError && <div className="wdError">{authError}</div>}
      </section>
    </main>;
  }

  return <main className="wdRoot">
    <aside className="wdSidebar">
      <a className="wdBrand" href="/overview">
        <img src="/assets/wave-logo.webp" alt="" />
        <span><b>WAVE</b><small>OGENIC</small></span>
      </a>
      <nav>
        <a className="active" href="/overview"><span>⌂</span>Dashboard</a>
        <div className="wdNavLabel">CHANNELS</div>
        <a href="/chat"><span>◌</span>Chat API</a>
        <a href="/command"><span>⌘</span>Command</a>
        <a href="/agents"><span>◇</span>Agent AI</a>
        <div className="wdNavLabel">SYSTEM</div>
        <a href="/overview/next?tab=connections"><span>↔</span>Connections</a>
        <a href="/maop"><span>◫</span>MA-OP Lab</a>
      </nav>
      <div className="wdSidebarFoot">
        <Status value={dashboard.runtime?.provider ? "LIVE" : "DEGRADED"} />
        <button onClick={() => void signOut()}>Sign out</button>
      </div>
    </aside>

    <section className="wdWorkspace">
      <header className="wdTopbar">
        <div>
          <span className="wdBreadcrumb">WAVE / Dashboard</span>
          <h1>System overview</h1>
        </div>
        <div className="wdTopActions">
          <span className="wdBranch">{dashboard.runtime?.branch || "phase-vi-provider-incentive-metering"}</span>
          <button onClick={() => void load()} disabled={loading}>{loading ? "Syncing…" : "Refresh"}</button>
        </div>
      </header>

      {loadError && <div className="wdError wdInlineError">{loadError}</div>}

      <section className="wdHero">
        <div>
          <span>WAVE PHASE II</span>
          <h2>Operate the whole stack<br />from one clean surface.</h2>
          <p>Cloudflare runtime · D1 / 1LSS · Yellow authority · Blue roster · Violet execution · GitHub audit · Ruby verify.</p>
        </div>
        <div className="wdHeroState">
          <small>CANONICAL LINE</small>
          <strong>#{String(bridge?.latest_sequence ?? 0).padStart(4, "0")}</strong>
          <Status value={bridge?.cross_surface_ready ? "SYNCED" : bridge?.ok ? "DEGRADED" : "NOT_MEASURED"} />
        </div>
      </section>

      <section className="wdMetricGrid">
        <article><span>Runtime</span><strong>{dashboard.runtime?.provider || "—"}</strong><small>{dashboard.runtime?.database || "D1"} · {dashboard.runtime?.git_sha?.slice(0, 8) || "staging"}</small></article>
        <article><span>Agents ready</span><strong>{usableAgents.length}<em>/{eligibleAgents.length || "—"}</em></strong><small>Blue Diamond roster</small></article>
        <article><span>Open tasks</span><strong>{openTasks.length}</strong><small>{activeRuns.length} active workflow runs</small></article>
        <article><span>Connections</span><strong>{liveConnectors.length}<em>/{connectors.length || "—"}</em></strong><small>live / measured connectors</small></article>
      </section>

      <section className="wdSection">
        <div className="wdSectionHead">
          <div><span>EXECUTION SURFACES</span><h3>Three channels</h3></div>
          <small>แยกหน้าที่ · ใช้ canonical state เดียวกัน</small>
        </div>
        <div className="wdChannelGrid">
          {CHANNELS.map((channel, index) => <a href={channel.href} className="wdChannel" key={channel.id}>
            <div className="wdChannelTop"><span className="wdIndex">0{index + 1}</span><Status value={channelState[channel.id]} /></div>
            <small>{channel.eyebrow}</small>
            <h4>{channel.title}</h4>
            <p>{channel.description}</p>
            <div className="wdChannelFoot"><span>Open channel</span><b>↗</b></div>
          </a>)}
        </div>
      </section>

      <section className="wdTwoCol">
        <article className="wdPanel">
          <div className="wdPanelHead"><div><span>SYSTEM STACK</span><h3>Control plane</h3></div><a href="/maop">MA-OP ↗</a></div>
          <div className="wdStack">
            {[
              ["Green / 1LSS", bridge?.cross_surface_ready ? "LIVE" : bridge?.ok ? "DEGRADED" : "NOT_MEASURED", "Canonical verified retention"],
              ["Blue / ATHENA", athena?.state || "NOT_MEASURED", "Admission · agent selection · handoff"],
              ["Yellow / MA-OP", "ACTIVE", "Sole execution authority"],
              ["Violet / n8n", violet.ok ? "READY" : "NOT_MEASURED", "Fan-out · fan-in · mechanical preverify"],
              ["GitHub + Ruby", "ACTIVE", "Deterministic audit → semantic verify"],
            ].map(([name, state, detail]) => <div className="wdStackRow" key={name}>
              <div><b>{name}</b><small>{detail}</small></div><Status value={state} />
            </div>)}
          </div>
        </article>

        <article className="wdPanel">
          <div className="wdPanelHead"><div><span>AGENT ROSTER</span><h3>Active placement</h3></div><a href="/agents">All agents ↗</a></div>
          <div className="wdAgentList">
            {eligibleAgents.slice(0, 7).map((actor) => <div className="wdAgentRow" key={actor.actor_id}>
              <div className="wdAgentIcon">{actor.label.slice(0, 1).toUpperCase()}</div>
              <div><b>{actor.label}</b><small>{actor.provider} · {actor.actor_class.replaceAll("_", " ")}</small></div>
              <Status value={actor.state} />
            </div>)}
            {!eligibleAgents.length && <div className="wdEmpty">Agent roster not measured.</div>}
          </div>
        </article>
      </section>

      <section className="wdTwoCol">
        <article className="wdPanel">
          <div className="wdPanelHead"><div><span>WORK</span><h3>Recent tasks</h3></div><a href="/overview/next?tab=history">History ↗</a></div>
          <div className="wdTable">
            {(dashboard.tasks ?? []).slice(0, 6).map((task) => <div className="wdTableRow" key={task.id}>
              <div><b>{task.title || task.id}</b><small>{task.capability || task.id}</small></div>
              <span>{humanTime(task.updated_at)}</span>
              <Status value={task.status || "NOT_MEASURED"} />
            </div>)}
            {!(dashboard.tasks ?? []).length && <div className="wdEmpty">No recent task data.</div>}
          </div>
        </article>

        <article className="wdPanel">
          <div className="wdPanelHead"><div><span>CONNECTIONS</span><h3>External arms</h3></div><a href="/overview/next?tab=connections">Manage ↗</a></div>
          <div className="wdTable">
            {connectors.slice(0, 7).map((connector) => <div className="wdTableRow" key={connector.id}>
              <div><b>{connector.label}</b><small>{connector.kind || connector.summary || connector.id}</small></div>
              <span>{connector.id}</span>
              <Status value={connector.state} />
            </div>)}
            {!connectors.length && <div className="wdEmpty">Connector state not measured.</div>}
          </div>
        </article>
      </section>

      <UnifiedOpsPanel />

      <DiscordWorkspacePanel />

      <footer className="wdFooter">
        <span>WAVE · OGENIC HARNESS · owner-main · 1LSS_OWNER_MAIN</span>
        <span>Cloudflare primary runtime · staging only</span>
      </footer>
    </section>
  </main>;
}
