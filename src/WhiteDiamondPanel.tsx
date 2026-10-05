import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type WhiteAgent = {
  agent_id: string;
  label: string;
  provider: string;
  kind: string;
  state: string;
  capabilities: string[];
  runtime: string;
};

type VioletStats = {
  jobs_assigned: number;
  completed: number;
  failed: number;
  blocked: number;
  success_rate: number | null;
  accuracy: number | null;
  accuracy_state: "MEASURED" | "NOT_MEASURED";
  accuracy_sample_size: number;
  average_duration_seconds: number | null;
  median_duration_seconds: number | null;
  approval_waits: number;
  retries: number;
  handoffs: number;
  verified_outcomes: number;
  capability_usage: Record<string, number>;
};

type VioletAgent = {
  agent_id: string;
  source_agent_id: string;
  app: string;
  rank: string;
  position: string;
  availability_state: string;
  runtime: string;
  visible_identity: string;
  status: string;
  stats: VioletStats;
};

type Executor = {
  id: string;
  display_name: string;
  provider: string;
  role: string;
  execution_mode: string;
  status: string;
  current_task_id?: string | null;
  last_heartbeat_at?: string | null;
};

type VioletStatusResponse = {
  ok?: boolean;
  runtime?: string;
  agents?: VioletAgent[];
  executors?: Executor[];
  canonical?: { latest_sequence?: number | null };
  policy?: string;
};

type VioletPlanResponse = {
  ok?: boolean;
  code?: string;
  run_id?: string;
  team_id?: string;
  mode?: string;
  strategy?: string;
  formed_size?: number;
  requested_size?: number;
  coverage_limited?: boolean;
  team?: Array<VioletAgent & { status: string }>;
  graph?: Array<{ node_id?: string; agent_id?: string; role?: string; status?: string; depends_on?: string[] }>;
  yellow_stone_required?: boolean;
};

type WhiteRegistryResponse = {
  ok?: boolean;
  agents?: WhiteAgent[];
  policy?: string;
};

const EXECUTIVE_SOURCE_IDS = new Set(["white-diamond-manager", "codex-left-arm", "manus-specialist"]);

function tone(value: string) {
  const state = String(value || "CONFIGURATION_REQUIRED").toUpperCase();
  if (["LIVE", "RUNNING", "COMPLETED", "READY", "MEASURED"].includes(state)) return "is-live";
  if (["DEGRADED", "SIMULATED", "BRIDGE_ONLY", "PLANNING", "WAITING_APPROVAL", "QUEUED"].includes(state)) return "is-warn";
  if (["OFFLINE", "FAILED", "CANCELED"].includes(state)) return "is-offline";
  return "is-config";
}

function metric(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "N/A" : `${value}${suffix}`;
}

function duration(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (value < 60) return `${value.toFixed(1)}s`;
  return `${(value / 60).toFixed(1)}m`;
}

export default function WhiteDiamondPanel() {
  const [violet, setViolet] = useState<VioletStatusResponse>({});
  const [white, setWhite] = useState<WhiteRegistryResponse>({});
  const [intent, setIntent] = useState("");
  const [mode, setMode] = useState("TEAM_3");
  const [strategy, setStrategy] = useState("parallel");
  const [plan, setPlan] = useState<VioletPlanResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const supportRegistry = useMemo(
    () => (white.agents || []).filter((agent) => !EXECUTIVE_SOURCE_IDS.has(agent.agent_id)),
    [white.agents],
  );

  const load = useCallback(async () => {
    setError("");
    const [violetR, whiteR] = await Promise.all([
      fetch("/api/violet/status", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/white-diamond/registry", { credentials: "same-origin", cache: "no-store" }),
    ]);
    const [violetB, whiteB] = await Promise.all([
      violetR.json().catch(() => ({})),
      whiteR.json().catch(() => ({})),
    ]);
    if (violetR.ok && violetB?.ok) setViolet(violetB as VioletStatusResponse);
    else setError(violetB?.code || `VIOLET_HTTP_${violetR.status}`);
    if (whiteR.ok && whiteB?.ok) setWhite(whiteB as WhiteRegistryResponse);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!intent.trim()) return;
    setBusy(true);
    setError("");
    setPlan(null);
    try {
      const response = await fetch("/api/violet/plan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: intent.trim(),
          mode,
          strategy,
          permission_class: "READ",
        }),
      });
      const body = await response.json().catch(() => ({}));
      setPlan(body as VioletPlanResponse);
      if (!response.ok) setError(body?.code || `HTTP_${response.status}`);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="wnCard">
      <div className="wnCardHead">
        <div><span className="wnKicker">VIOLET STONE</span><h3>Agent Command Line</h3></div>
        <span className="wnCount">{violet.agents?.length || 0}/3</span>
      </div>
      <p className="wnBody">Interactive Agents are shown separately from executors. Status and statistics come from the Violet runtime and existing D1 operational evidence.</p>
      {error && <div className="wnError">{error}</div>}

      <div className="wnRows">
        {(violet.agents || []).map((agent) => <div className="wnRow" key={agent.agent_id}>
          <div>
            <strong>{agent.visible_identity}</strong>
            <span>
              {agent.position.replaceAll("_", " ")} · Accuracy {metric(agent.stats.accuracy, "%")} (n={agent.stats.accuracy_sample_size}) · Success {metric(agent.stats.success_rate, "%")}
            </span>
            <span>
              Jobs {agent.stats.jobs_assigned} · Done {agent.stats.completed} · Failed {agent.stats.failed} · Blocked {agent.stats.blocked} · Avg {duration(agent.stats.average_duration_seconds)} · Handoffs {agent.stats.handoffs}
            </span>
          </div>
          <span className={`wnState ${tone(agent.status)}`}>{agent.status}</span>
        </div>)}
        {!violet.agents?.length && <div className="wnEmpty">Violet Agent telemetry unavailable.</div>}
      </div>
      <div className="wnPolicy">Accuracy is evidence-backed only. Until Ruby Stone records evaluation samples it remains N/A / NOT_MEASURED.</div>
    </section>

    <section className="wnCard">
      <div className="wnCardHead"><div><span className="wnKicker">VIOLET ORCHESTRATOR</span><h3>Team plan</h3></div><span className="wnCount">max 3 real Agents</span></div>
      <p className="wnBody">Form a real Agent team and execution graph. Larger requested modes report coverage limits instead of inventing extra Agents. Consequential execution still belongs to Yellow Stone.</p>
      <form onSubmit={submit} className="wnAuthForm">
        <input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Planning intent…" required />
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Agent team mode">
          <option>SOLO</option><option>TEAM_3</option><option>TEAM_5</option><option>TEAM_10</option><option>FULL_15</option>
        </select>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} aria-label="Agent execution strategy">
          <option value="parallel">parallel</option><option value="sequential">sequential</option>
        </select>
        <button type="submit" disabled={busy}>{busy ? "Planning…" : "Plan agent team"}</button>
      </form>

      {plan && <div className="wnRows">
        <div className="wnRow"><div><strong>{plan.run_id || plan.code || "Plan"}</strong><span>{plan.mode || mode} · {plan.strategy || strategy} · team {plan.formed_size ?? 0}/{plan.requested_size ?? 0}{plan.coverage_limited ? " · COVERAGE LIMITED" : ""}</span></div><span className={`wnState ${plan.ok ? "is-live" : "is-warn"}`}>{plan.ok ? "PLAN READY" : String(plan.code || "BLOCKED")}</span></div>
        {(plan.team || []).map((agent) => <div className="wnRow" key={`plan:${agent.agent_id}`}><div><strong>{agent.visible_identity}</strong><span>{agent.position.replaceAll("_", " ")} · {agent.runtime}</span></div><span className={`wnState ${tone(agent.status)}`}>{agent.status}</span></div>)}
        {(plan.graph || []).map((node) => <div className="wnRow" key={`node:${node.node_id}`}><div><strong>{node.role || "node"}</strong><span>{node.agent_id || "—"} · depends {node.depends_on?.length ? node.depends_on.join(" + ") : "none"}</span></div><span className={`wnState ${tone(node.status || "queued")}`}>{node.status || "queued"}</span></div>)}
      </div>}
    </section>

    <section className="wnCard">
      <div className="wnCardHead"><div><span className="wnKicker">EXECUTOR / RUNTIME</span><h3>Backend lanes</h3></div><span className="wnCount">{violet.executors?.length || 0}</span></div>
      <p className="wnBody">These lanes can execute bounded work but are not presented as conversational Agents.</p>
      <div className="wnRows">
        {(violet.executors || []).map((lane) => <div className="wnRow" key={lane.id}><div><strong>{lane.display_name}</strong><span>{lane.role} · {lane.provider} · {lane.execution_mode}{lane.current_task_id ? ` · ${lane.current_task_id}` : ""}</span></div><span className={`wnState ${tone(lane.status)}`}>{lane.status}</span></div>)}
        {!violet.executors?.length && <div className="wnEmpty">No executor lanes returned.</div>}
      </div>
    </section>

    <section className="wnCard">
      <div className="wnCardHead"><div><span className="wnKicker">WHITE DIAMOND</span><h3>Support registry</h3></div><span className="wnCount">{supportRegistry.length}</span></div>
      <p className="wnBody">White Diamond retains specialist/tool/runtime registry information. These entries are not promoted to Agent identity unless they actually meet the interactive Agent contract.</p>
      <div className="wnRows">
        {supportRegistry.map((agent) => <div className="wnRow" key={agent.agent_id}><div><strong>{agent.label}</strong><span>{agent.kind} · {agent.provider} · {agent.capabilities.slice(0, 4).join(" · ")}</span></div><span className={`wnState ${tone(agent.state)}`}>{agent.state}</span></div>)}
        {!supportRegistry.length && <div className="wnEmpty">Support registry unavailable.</div>}
      </div>
      <div className="wnPolicy">owner-main / 1LSS_OWNER_MAIN · latest seq {violet.canonical?.latest_sequence ?? "—"} · {violet.policy || white.policy || "NO_DIRECT_EXECUTION_BYPASS"}</div>
    </section>
  </>;
}
