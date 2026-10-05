import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import McpConfigCenter from "./McpConfigCenter";
import WhiteDiamondPanel from "./WhiteDiamondPanel";

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

type Tab = "run" | "agent" | "session" | "connections" | "approvals" | "history";

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
  const [resourcePath, setResourcePath] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
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
          <p>Guarded Run enters through ATHENA admission and always delegates execution authority to Yellow Stone. Higher-risk actions stop at owner approval; no provider can execute directly from this surface.</p>
        </div>
        <textarea value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Tell WAVE what to do…" rows={5} />
        <input value={resourcePath} onChange={(e) => setResourcePath(e.target.value)} placeholder="Optional GitHub file path for verified READ, e.g. package.json" />
        <div className="wnRunActions">
          <button className="wnPrimary" onClick={() => void runGuardedCommand()} disabled={commandBusy || (!command.trim() && !resourcePath.trim())}>{commandBusy ? "Routing…" : "Run guarded command"}</button>
          <button onClick={handoff}>Open WAVE Chat with draft</button>
          <button onClick={() => { setTab("agent"); }}>Agent controls</button>
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

      {tab === "agent" && <>
        <WhiteDiamondPanel />
        <section className="wnCard">
          <div className="wnCardHead"><div><span className="wnKicker">EXECUTION</span><h3>Yellow Stone handoff</h3></div><State value={selfHost?.openai_app_key || "CONFIGURATION_REQUIRED"} /></div>
          <p className="wnBody">White Diamond may plan and select agents, but consequential execution remains behind Yellow Stone policy and owner approval.</p>
          <div className="wnActionRow"><button className="wnPrimary" onClick={() => void runGuardedCommand()} disabled={commandBusy || (!command.trim() && !resourcePath.trim())}>Run guarded command</button><button onClick={handoff}>Open Chat with draft</button><a className="wnButtonLink" href="/chat">Open WAVE Chat</a></div>
          <div className="wnPolicy">{selfHost?.policy || "Policy status unavailable"}</div>
        </section>
      </>}

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
