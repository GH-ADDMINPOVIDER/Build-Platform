import { FormEvent, useCallback, useEffect, useState } from "react";

type TeamState = {
  room?: string;
  canonical_session?: string;
  state?: string;
  agents?: Array<{ agent_id: string; label?: string; provider?: string; state?: string; runtime?: string }>;
  providers?: Array<{ id: string; label: string; configuration: string; authentication: string; smoke_test: string; evidence: string }>;
  tasks?: Array<{ id: string; title: string; status: string; agent_state?: string; claimed_by?: string | null; updated_at?: string; latest_event?: string | null }>;
  events?: Array<{ id: string; event_type: string; task_id?: string | null; created_at?: string }>;
};

function tone(value?: string) {
  const state = String(value ?? "NOT_MEASURED").toUpperCase();
  return ["READY", "DONE", "LIVE", "DETECTED"].includes(state) ? "is-live" : ["FAILED", "BLOCKED"].includes(state) ? "is-offline" : "is-config";
}

function State({ value }: { value?: string }) {
  return <span className={`wnState ${tone(value)}`}>{String(value ?? "NOT_MEASURED").toUpperCase()}</span>;
}

export default function LocalAgentTeamPanel() {
  const [state, setState] = useState<TeamState>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workspace, setWorkspace] = useState("workspace:staging");
  const [permission, setPermission] = useState("READ");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/local-agent-team/state", { credentials: "same-origin", cache: "no-store" });
    if (response.ok) setState(await response.json() as TeamState);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const key = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${title}`;
      const response = await fetch("/api/local-agent-team/tasks", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ title, description, workspace_ref: workspace, permission }),
      });
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? `Task ${body.task?.id ?? "queued"} · ${body.execution?.state ?? "READY"}` : String(body.code ?? "REQUEST_FAILED"));
      if (response.ok) { setTitle(""); setDescription(""); await load(); }
    } finally { setBusy(false); }
  }

  return <section className="wnCard localTeamPanel">
    <div className="wnCardHead"><div><span className="wnKicker">LOCAL AGENT TEAM</span><h3>{state.room ?? "launch"} room</h3></div><State value={state.state} /></div>
    <p className="wnBody">Persistent tasks use the existing D1 agent queue and {state.canonical_session ?? "owner-main / 1LSS_OWNER_MAIN"}. Provider setup, launch, command execution, and verified results remain separate states; WRITE and EXECUTE tasks stay WAITING_APPROVAL until the existing owner gate is satisfied.</p>
    <div className="localTeamGrid">
      <div><strong>Teammates</strong><div className="wnRows">{(state.agents ?? []).slice(0, 8).map((agent) => <div className="wnRow" key={agent.agent_id}><div><strong>{agent.label ?? agent.agent_id}</strong><span>{agent.provider} · {agent.runtime ?? "existing lane"}</span></div><State value={agent.state} /></div>)}{!state.agents?.length && <div className="wnEmpty">No agent registry rows returned.</div>}</div></div>
      <div><strong>Provider readiness</strong><div className="wnRows">{(state.providers ?? []).map((provider) => <div className="wnRow" key={provider.id}><div><strong>{provider.label}</strong><span>{provider.authentication} · {provider.smoke_test}</span></div><State value={provider.configuration} /></div>)}</div></div>
    </div>
    <form className="localTeamForm" onSubmit={submit}>
      <label>Task title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required /></label>
      <label>Bounded task brief<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={800} required /></label>
      <div className="localTeamFormRow"><label>Workspace<input value={workspace} onChange={(event) => setWorkspace(event.target.value)} maxLength={180} /></label><label>Permission<select value={permission} onChange={(event) => setPermission(event.target.value)}><option>READ</option><option>WRITE</option><option>EXECUTE</option></select></label><button className="wnPrimary" disabled={busy}>{busy ? "Queueing…" : "Create task"}</button></div>
    </form>
    {message && <div className="wnPolicy" role="status">{message}</div>}
    <div className="wnCardHead localTeamTimelineHead"><div><span className="wnKicker">TASK TIMELINE</span><h3>Resumable queue</h3></div><span className="wnCount">{state.tasks?.length ?? 0}</span></div>
    <div className="wnRows">{(state.tasks ?? []).slice(0, 8).map((task) => <div className="wnRow" key={task.id}><div><strong>{task.title}</strong><span>{task.id} · {task.claimed_by ?? "unassigned"} · {task.latest_event ?? "no event"}</span></div><State value={task.agent_state ?? task.status} /></div>)}{!state.tasks?.length && <div className="wnEmpty">No local team tasks yet.</div>}</div>
  </section>;
}
