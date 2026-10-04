import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SessionState = { authenticated?: boolean; user?: { label?: string; role?: string } | null };
type Dashboard = { runtime?: { provider?: string; branch?: string }; incentives?: { policy_state?: string } };
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

type Tab = "run" | "agent" | "session" | "connections" | "approvals" | "history";

const HANDOFF_DRAFT_KEY = "ogenic.wave-next.handoff.v1";
const HANDOFF_MODE_KEY = "ogenic.wave-next.mode.v1";
const SSH_HOST = "165.232.174.32";
const SSH_USER = "wave";

function upper(value: unknown, fallback = "OFFLINE") {
  const text = String(value ?? "").trim().toUpperCase();
  return text || fallback;
}

function stateTone(value: unknown) {
  const state = upper(value);
  if (["LIVE", "READY", "BOUND", "CONFIGURED", "OPERATIONAL"].includes(state)) return "is-live";
  if (["DEGRADED", "HUMAN_APPROVAL_REQUIRED", "APPROVAL_REQUIRED"].includes(state)) return "is-warn";
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

function State({ value }: { value: unknown }) {
  const state = upper(value);
  return <span className={`wnState ${stateTone(state)}`}>{state}</span>;
}

export default function WaveNext() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("run");
  const [command, setCommand] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selfHost, setSelfHost] = useState<SelfHost | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [sessions, setSessions] = useState<SessionRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runtimeState = useMemo(() => {
    if (!session?.authenticated) return "OFFLINE";
    if (dashboard.runtime?.provider) return "LIVE";
    return "DEGRADED";
  }, [dashboard.runtime?.provider, session?.authenticated]);

  const load = useCallback(async () => {
    if (!session?.authenticated) return;
    setLoading(true);
    setError("");
    try {
      const [dashR, connectorR, selfHostR, bridgeR, sessionsR] = await Promise.all([
        fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/connectors", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/openai/selfhost/readiness", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/status", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/1lss/sessions?limit=12", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [dashB, connectorB, selfHostB, bridgeB, sessionsB] = await Promise.all([
        dashR.json().catch(() => ({})),
        connectorR.json().catch(() => ({})),
        selfHostR.json().catch(() => ({})),
        bridgeR.json().catch(() => ({})),
        sessionsR.json().catch(() => ({})),
      ]);
      if (dashR.ok) setDashboard(dashB as Dashboard);
      if (connectorR.ok && Array.isArray(connectorB.connectors)) setConnectors(connectorB.connectors as Connector[]);
      if (selfHostR.ok) setSelfHost(selfHostB as SelfHost);
      else setSelfHost({ ok: false, policy: String(selfHostB?.code || `HTTP_${selfHostR.status}`) });
      if (bridgeR.ok) setBridge(bridgeB as BridgeStatus);
      if (sessionsR.ok && Array.isArray(sessionsB.sessions)) setSessions(sessionsB.sessions as SessionRef[]);
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

  function handoff(mode: "chat-api" | "agent-ai") {
    try {
      sessionStorage.setItem(HANDOFF_DRAFT_KEY, command.trim());
      sessionStorage.setItem(HANDOFF_MODE_KEY, mode);
    } catch { /* no-op */ }
    window.location.assign("/chat");
  }

  if (session === null) {
    return <main className="wnRoot"><div className="wnLoading">Loading WAVE…</div></main>;
  }

  if (!session.authenticated) {
    return <main className="wnRoot">
      <section className="wnAuth">
        <div className="wnKicker">WAVE · OWNER ACCESS</div>
        <h1>Run-first control surface</h1>
        <p>Owner authentication is required before operational state is shown.</p>
        <form onSubmit={signIn} className="wnAuthForm">
          <input type="password" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} placeholder="Owner key" autoComplete="current-password" />
          <button type="submit">Sign in</button>
        </form>
        {authError && <div className="wnError">{authError}</div>}
        <a className="wnTextLink" href="/overview/legacy">Open legacy overview</a>
      </section>
    </main>;
  }

  return <main className="wnRoot">
    <div className="wnFrame">
      <header className="wnHeader">
        <div>
          <div className="wnKicker">OGENIC / WAVE</div>
          <h1>Harness Capability</h1>
          <p>owner-main · 1LSS_OWNER_MAIN</p>
        </div>
        <div className="wnHeaderState"><State value={runtimeState} /><button onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button></div>
      </header>

      <section className="wnHero">
        <div className="wnHeroCopy">
          <span className="wnKicker">RUN / COMMAND</span>
          <h2>What should WAVE do?</h2>
          <p>Command here, then hand it to the existing WAVE Chat or Agent lane. Canonical memory stays on 1LSS.</p>
        </div>
        <textarea value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Tell WAVE what to do…" rows={5} />
        <div className="wnRunActions">
          <button className="wnPrimary" onClick={() => handoff("chat-api")}>Run with WAVE Chat</button>
          <button onClick={() => handoff("agent-ai")}>Run with Agent AI</button>
        </div>
      </section>

      <nav className="wnTabs" aria-label="WAVE NEXT sections">
        {(["run", "agent", "session", "connections", "approvals", "history"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
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
      </section>}

      {tab === "agent" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">WHITE DIAMOND</span><h3>Agent command lane</h3></div><State value={selfHost?.openai_app_key || "CONFIGURATION_REQUIRED"} /></div>
        <p className="wnBody">Agent execution remains behind Yellow Stone policy. No direct execution bypass is exposed here.</p>
        <div className="wnActionRow"><button className="wnPrimary" onClick={() => handoff("agent-ai")}>Open Agent AI</button><a className="wnButtonLink" href="/chat">Open WAVE Chat</a></div>
        <div className="wnPolicy">{selfHost?.policy || "Policy status unavailable"}</div>
      </section>}

      {tab === "session" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">GREEN STONE</span><h3>Session continuity</h3></div><State value={bridge?.cross_surface_ready ? "READY" : "DEGRADED"} /></div>
        <p className="wnBody">owner-main / 1LSS_OWNER_MAIN remains canonical. These are observed session references, not new memory stores.</p>
        <div className="wnRows">{sessions.slice(0, 6).map((row) => <div className="wnRow" key={row.id}><div><strong>{row.label || row.source_surface}</strong><span>{row.session_ref}</span></div><div className="wnRowMeta">seq {row.last_sequence ?? "—"}<br />{timeAgo(row.last_seen_at)}</div></div>)}{!sessions.length && <div className="wnEmpty">No session references returned.</div>}</div>
      </section>}

      {tab === "connections" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">YELLOW STONE</span><h3>Connections</h3></div><span className="wnCount">{connectors.length}</span></div>
        <p className="wnBody">States below come from the existing connector runtime. No fake LIVE state is added.</p>
        <div className="wnRows">{connectors.map((row) => <div className="wnRow" key={row.id}><div><strong>{row.label}</strong><span>{row.kind || "connector"} · {row.route_mode || "—"}{row.summary ? ` · ${row.summary}` : ""}</span></div><State value={row.state} /></div>)}{!connectors.length && <div className="wnEmpty">No connector state returned.</div>}</div>
      </section>}

      {tab === "approvals" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">POLICY</span><h3>Approvals</h3></div><State value="HUMAN_APPROVAL_REQUIRED" /></div>
        <p className="wnBody">Consequential execution stays approval-gated. This view does not auto-approve SSH, deploy, delete, secret, billing, or production actions.</p>
        <dl className="wnFacts"><div><dt>Self-host policy</dt><dd>{selfHost?.policy || "—"}</dd></div><div><dt>Executor workflow</dt><dd>{selfHost?.executor_workflow || "—"}</dd></div></dl>
      </section>}

      {tab === "history" && <section className="wnCard">
        <div className="wnCardHead"><div><span className="wnKicker">HISTORY</span><h3>Recent 1LSS sessions</h3></div><State value={bridge?.ok ? "READY" : "DEGRADED"} /></div>
        <div className="wnRows">{sessions.map((row) => <div className="wnRow" key={row.id}><div><strong>{row.label || row.source_surface}</strong><span>{row.source_surface}</span></div><div className="wnRowMeta">#{row.last_sequence ?? "—"}<br />{timeAgo(row.last_seen_at)}</div></div>)}{!sessions.length && <div className="wnEmpty">No history returned.</div>}</div>
      </section>}

      <footer className="wnFooter">
        <a href="/chat">Chat</a><a href="/overview/legacy">Legacy overview</a><span>Private keys stay local</span>
      </footer>
    </div>
  </main>;
}
