import { FormEvent, useCallback, useEffect, useState } from "react";

type Agent = {
  agent_id: string;
  label: string;
  provider: string;
  kind: string;
  state: string;
  capabilities: string[];
  runtime: string;
  model?: string | null;
};

type RegistryResponse = { ok?: boolean; agents?: Agent[]; canonical?: { latest_sequence?: number | null }; policy?: string };
type PlanResponse = {
  ok?: boolean;
  code?: string;
  run_id?: string;
  mode?: string;
  parallel?: boolean;
  selected_agents?: Agent[];
  yellow_stone_required?: boolean;
  direct_execution_rejected?: boolean;
};

function tone(value: string) {
  const state = String(value || "CONFIGURATION_REQUIRED").toUpperCase();
  if (state === "LIVE") return "is-live";
  if (state === "DEGRADED" || state === "SIMULATED") return "is-warn";
  if (state === "OFFLINE") return "is-offline";
  return "is-config";
}

export default function WhiteDiamondPanel() {
  const [registry, setRegistry] = useState<RegistryResponse>({});
  const [intent, setIntent] = useState("");
  const [mode, setMode] = useState("TEAM_3");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/white-diamond/registry", { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) {
      setError(body?.code || `HTTP_${response.status}`);
      return;
    }
    setRegistry(body as RegistryResponse);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!intent.trim()) return;
    setBusy(true); setError(""); setPlan(null);
    try {
      const response = await fetch("/api/white-diamond/plan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: intent.trim(), mode, permission_class: "READ", parallel: mode !== "SOLO", execute: false }),
      });
      const body = await response.json().catch(() => ({}));
      setPlan(body as PlanResponse);
      if (!response.ok) setError(body?.code || `HTTP_${response.status}`);
    } finally { setBusy(false); }
  }

  return <section className="wnCard">
    <div className="wnCardHead"><div><span className="wnKicker">WHITE DIAMOND</span><h3>Agent Registry + Commander</h3></div><span className="wnCount">{registry.agents?.length || 0}/15</span></div>
    <p className="wnBody">White Diamond plans and selects agents. Execution authority stays with Yellow Stone; this panel never bypasses approval or creates a second memory line.</p>
    {error && <div className="wnError">{error}</div>}

    <form onSubmit={submit} className="wnAuthForm">
      <input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Read-only planning intent…" required />
      <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Agent routing mode">
        <option>SOLO</option><option>TEAM_3</option><option>TEAM_5</option><option>TEAM_10</option><option>FULL_15</option>
      </select>
      <button type="submit" disabled={busy}>{busy ? "Planning…" : "Plan agent run"}</button>
    </form>

    {plan && <div className="wnRows">
      <div className="wnRow"><div><strong>{plan.run_id || plan.code || "Plan"}</strong><span>{plan.mode || mode} · Yellow Stone {plan.yellow_stone_required ? "required" : "status unknown"}</span></div><span className={`wnState ${plan.ok ? "is-live" : "is-warn"}`}>{plan.ok ? "PLAN READY" : String(plan.code || "BLOCKED")}</span></div>
      {(plan.selected_agents || []).map((agent) => <div className="wnRow" key={`plan:${agent.agent_id}`}><div><strong>{agent.label}</strong><span>{agent.kind} · {agent.provider} · {agent.runtime}</span></div><span className={`wnState ${tone(agent.state)}`}>{agent.state}</span></div>)}
    </div>}

    <div className="wnRows">
      {(registry.agents || []).map((agent) => <div className="wnRow" key={agent.agent_id}><div><strong>{agent.label}</strong><span>{agent.kind} · {agent.provider} · {agent.capabilities.slice(0, 4).join(" · ")}</span></div><span className={`wnState ${tone(agent.state)}`}>{agent.state}</span></div>)}
      {!registry.agents?.length && <div className="wnEmpty">Agent registry unavailable.</div>}
    </div>
    <div className="wnPolicy">owner-main / 1LSS_OWNER_MAIN · latest seq {registry.canonical?.latest_sequence ?? "—"} · {registry.policy || "NO_DIRECT_EXECUTION_BYPASS"}</div>
  </section>;
}
