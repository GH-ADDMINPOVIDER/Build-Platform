import { useCallback, useEffect, useMemo, useState } from "react";

type Health = {
  ok: boolean;
  phase: string;
  runtime: string;
  database: "BOUND" | "UNBOUND";
  providers: number;
  toolkit_count?: number;
  operator_harness?: string;
  shared_state?: string;
  ops_api_auth?: string;
};

type PublicState = {
  ok: boolean;
  meta: Array<{ key: string; value: string }>;
};

type OpsTask = {
  id: string;
  title: string;
  capability?: string | null;
  status: string;
  priority: number;
  resource_key?: string | null;
  claimed_by?: string | null;
  correlation_id?: string | null;
  linear_issue_id?: string | null;
  github_repo?: string | null;
  source_ref?: string | null;
  updated_at?: string;
};

type OpsState = {
  ok: boolean;
  operator_harness: string;
  shared_state_version: string;
  status_counts: Array<{ status: string; count: number }>;
  locks: Array<{
    resource_key: string;
    task_id?: string | null;
    owner_agent?: string | null;
    expires_at?: string;
  }>;
  checkpoints: Array<{
    task_id: string;
    agent_id: string;
    checkpoint_ref: string;
    updated_at?: string;
  }>;
  recent_events: Array<{
    id: string;
    task_id?: string | null;
    event_type: string;
    actor: string;
    external_ref?: string | null;
    created_at?: string;
  }>;
};

type OpsTasksResponse = { ok: boolean; tasks: OpsTask[] };

type LoadState = "idle" | "loading" | "ready" | "error";

const publicEndpoints = [
  ["Health", "/api/health"],
  ["System", "/api/system"],
  ["State", "/api/state"],
  ["Providers", "/api/providers"],
  ["Capabilities", "/api/capabilities"],
] as const;

const lanes = [
  { name: "Ammonite", role: "Supervisor", state: "ACTIVE", note: "Harness—Ammonite-OC-Ops" },
  { name: "Codex", role: "Builder lane", state: "READY", note: "Code / patch / build" },
  { name: "Claude", role: "Review lane", state: "READY", note: "Architecture / review" },
  { name: "GitHub Actions", role: "Executor", state: "BOUND", note: "CI / smoke / staging" },
] as const;

async function getJson<T>(url: string, key?: string): Promise<T> {
  const headers: HeadersInit = key ? { Authorization: `Bearer ${key}` } : {};
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function displayTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [publicState, setPublicState] = useState<PublicState | null>(null);
  const [opsState, setOpsState] = useState<OpsState | null>(null);
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [opsKey, setOpsKey] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState("Public telemetry ready. Unlock Ops API to load tasks and events.");

  const loadPublic = useCallback(async () => {
    try {
      const [nextHealth, nextState] = await Promise.all([
        getJson<Health>("/api/health"),
        getJson<PublicState>("/api/state"),
      ]);
      setHealth(nextHealth);
      setPublicState(nextState);
    } catch (error) {
      setMessage(`Public API error: ${(error as Error).message}`);
    }
  }, []);

  const loadOps = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) {
      setMessage("Enter OGENIC_OPS_KEY to unlock protected Ops telemetry.");
      return;
    }

    setLoadState("loading");
    try {
      const [nextOps, nextTasks] = await Promise.all([
        getJson<OpsState>("/api/ops/state", trimmed),
        getJson<OpsTasksResponse>("/api/ops/tasks?limit=30", trimmed),
      ]);
      setOpsState(nextOps);
      setTasks(nextTasks.tasks ?? []);
      sessionStorage.setItem("ogenic_ops_key", trimmed);
      setLoadState("ready");
      setMessage("Ops API unlocked for this browser session. Secret is not persisted by the app.");
    } catch (error) {
      setOpsState(null);
      setTasks([]);
      setLoadState("error");
      setMessage(`Ops API: ${(error as Error).message}. Check the session key or Worker binding.`);
    }
  }, []);

  useEffect(() => {
    void loadPublic();
    const saved = sessionStorage.getItem("ogenic_ops_key") ?? "";
    if (saved) {
      setOpsKey(saved);
      void loadOps(saved);
    }
  }, [loadOps, loadPublic]);

  const meta = useMemo(
    () => Object.fromEntries((publicState?.meta ?? []).map((item) => [item.key, item.value])),
    [publicState],
  );

  const counts = useMemo(
    () => Object.fromEntries((opsState?.status_counts ?? []).map((item) => [item.status, Number(item.count)])),
    [opsState],
  );

  const activeTasks = (counts.QUEUED ?? 0) + (counts.CLAIMED ?? 0) + (counts.RUNNING ?? 0) + (counts.VERIFYING ?? 0);

  const refresh = async () => {
    await loadPublic();
    if (opsKey.trim()) await loadOps(opsKey);
  };

  const clearSessionKey = () => {
    sessionStorage.removeItem("ogenic_ops_key");
    setOpsKey("");
    setOpsState(null);
    setTasks([]);
    setLoadState("idle");
    setMessage("Ops session key cleared from this browser session.");
  };

  return (
    <main className="shell">
      <header className="hero panel">
        <div>
          <p className="eyebrow">OGENIC CORE · OPERATOR CONSOLE</p>
          <h1>Phase VI</h1>
          <p className="subtitle">One toolkit · D1 shared state · Linear task control · GitHub evidence · Infisical secrets</p>
        </div>
        <div className="heroActions">
          <div className={`status ${health?.ok ? "good" : "pending"}`}>
            <span className="pulse" />
            {health?.ok ? "SYSTEM ONLINE" : "CHECKING"}
          </div>
          <button className="ghostButton" onClick={() => void refresh()}>Refresh</button>
        </div>
      </header>

      <section className="metrics">
        <article><span>Runtime</span><strong>{health?.runtime ?? "—"}</strong><small>Cloudflare Worker</small></article>
        <article><span>Shared State</span><strong>{health?.shared_state ?? health?.database ?? "—"}</strong><small>D1 canonical state</small></article>
        <article><span>Ops Auth</span><strong>{health?.ops_api_auth ?? "—"}</strong><small>Infisical-backed key</small></article>
        <article><span>Active Tasks</span><strong>{opsState ? activeTasks : "LOCKED"}</strong><small>{opsState ? `${counts.DONE ?? 0} done` : "Unlock Ops API"}</small></article>
      </section>

      <section className="controlGrid">
        <article className="panel unlockPanel">
          <div className="sectionHeader">
            <div>
              <p className="sectionKicker">PROTECTED CONTROL</p>
              <h2>Ops API Session</h2>
            </div>
            <span className={`miniBadge ${loadState === "ready" ? "success" : ""}`}>{loadState === "ready" ? "UNLOCKED" : "LOCKED"}</span>
          </div>
          <p className="muted">Enter <code>OGENIC_OPS_KEY</code>. The UI keeps it in sessionStorage only, so closing the browser session clears normal access.</p>
          <div className="keyRow">
            <input
              type="password"
              value={opsKey}
              onChange={(event) => setOpsKey(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void loadOps(opsKey); }}
              placeholder="OGENIC_OPS_KEY"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="primaryButton" onClick={() => void loadOps(opsKey)} disabled={loadState === "loading"}>
              {loadState === "loading" ? "Checking…" : "Unlock"}
            </button>
            <button className="ghostButton" onClick={clearSessionKey}>Clear</button>
          </div>
          <div className="notice">{message}</div>
        </article>

        <article className="panel architecturePanel">
          <div className="sectionHeader">
            <div>
              <p className="sectionKicker">CANONICAL ROUTING</p>
              <h2>Control Fabric</h2>
            </div>
            <span className="miniBadge success">v{opsState?.shared_state_version ?? "1"}</span>
          </div>
          <div className="fabricList">
            <div><span>Supervisor</span><strong>{health?.operator_harness ?? meta.operator_harness ?? "Harness—Ammonite-OC-Ops"}</strong></div>
            <div><span>Task Control</span><strong>{meta.agent_task_control_surface ?? "linear"}</strong></div>
            <div><span>Code Evidence</span><strong>{meta.agent_code_evidence_surface ?? "github"}</strong></div>
            <div><span>Secrets</span><strong>{meta.secret_source ?? "infisical"}</strong></div>
          </div>
        </article>
      </section>

      <section className="panel sectionPanel">
        <div className="sectionHeader">
          <div>
            <p className="sectionKicker">MULTI-AGENT FABRIC</p>
            <h2>Execution Lanes</h2>
          </div>
          <span className="miniBadge">STAGING</span>
        </div>
        <div className="laneGrid">
          {lanes.map((lane) => (
            <article className="lane" key={lane.name}>
              <div className="laneTop"><span className="agentDot" /><span className="miniBadge success">{lane.state}</span></div>
              <h3>{lane.name}</h3>
              <p>{lane.role}</p>
              <small>{lane.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboardGrid">
        <article className="panel sectionPanel taskPanel">
          <div className="sectionHeader">
            <div>
              <p className="sectionKicker">D1 SHARED STATE</p>
              <h2>Tasks</h2>
            </div>
            <span className="miniBadge">{tasks.length || 0}</span>
          </div>
          {tasks.length === 0 ? (
            <div className="emptyState">Unlock Ops API to view agent tasks.</div>
          ) : (
            <div className="taskList">
              {tasks.slice(0, 12).map((task) => (
                <article className="taskRow" key={task.id}>
                  <div>
                    <div className="taskTitle"><span className={`taskState state-${task.status.toLowerCase()}`}>{task.status}</span>{task.title}</div>
                    <p>{task.linear_issue_id ? `Linear ${task.linear_issue_id}` : task.capability ?? "Phase VI task"} · P{task.priority}</p>
                  </div>
                  <div className="taskMeta">
                    <code>{task.correlation_id ?? task.id}</code>
                    <small>{displayTime(task.updated_at)}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel sectionPanel eventPanel">
          <div className="sectionHeader">
            <div>
              <p className="sectionKicker">EVENT FABRIC</p>
              <h2>Recent Events</h2>
            </div>
            <span className="miniBadge">{opsState?.recent_events.length ?? 0}</span>
          </div>
          {!opsState ? (
            <div className="emptyState">Protected event stream.</div>
          ) : (
            <div className="eventList">
              {opsState.recent_events.slice(0, 10).map((event) => (
                <div className="eventRow" key={event.id}>
                  <span className="eventDot" />
                  <div><strong>{event.event_type}</strong><p>{event.actor}</p></div>
                  <small>{displayTime(event.created_at)}</small>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="panel sectionPanel">
        <div className="sectionHeader">
          <div>
            <p className="sectionKicker">API SURFACE</p>
            <h2>Quick Console</h2>
          </div>
          <span className="miniBadge success">LIVE</span>
        </div>
        <div className="endpointGrid">
          {publicEndpoints.map(([label, endpoint]) => (
            <a className="endpoint" href={endpoint} target="_blank" rel="noreferrer" key={endpoint}>
              <span>GET</span><strong>{label}</strong><code>{endpoint}</code>
            </a>
          ))}
          <div className="endpoint protectedEndpoint">
            <span>AUTH</span><strong>Ops State</strong><code>/api/ops/state</code>
          </div>
          <div className="endpoint protectedEndpoint">
            <span>AUTH</span><strong>Ops Tasks</strong><code>/api/ops/tasks</code>
          </div>
        </div>
      </section>

      <footer>
        <strong>Harness—Ammonite-OC-Ops</strong> · Production promotion remains explicit-approval only. Secrets stay outside Git/D1; this console never displays secret values.
      </footer>
    </main>
  );
}
