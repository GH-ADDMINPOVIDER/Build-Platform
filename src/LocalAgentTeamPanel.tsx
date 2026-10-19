import { FormEvent, useCallback, useEffect, useState } from "react";
import "./local-agent-team.css";

type TeamState = {
  room?: string;
  canonical_session?: string;
  state?: string;
  agents?: Array<{ agent_id: string; label?: string; provider?: string; state?: string; runtime?: string }>;
  providers?: Array<{ id: string; label: string; configuration: string; authentication: string; smoke_test: string; evidence: string }>;
  tasks?: Array<{ id: string; title: string; status: string; agent_state?: string; claimed_by?: string | null; updated_at?: string; latest_event?: string | null }>;
  events?: Array<{ id: string; event_type: string; task_id?: string | null; created_at?: string }>;
  messages?: Array<{ id: string; actor: string; text: string; task_id?: string | null; created_at?: string }>;
  checkpoints?: Array<{ task_id: string; agent_id: string; checkpoint_ref: string; state_hash: string; updated_at?: string }>;
  storage?: { canonical?: string; local_only?: boolean };
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
  const [roomOpen, setRoomOpen] = useState(() => new URLSearchParams(window.location.search).get("room") === "launch");
  const [draft, setDraft] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const [targetAgent, setTargetAgent] = useState("");
  const [resultRef, setResultRef] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const verifiedRoomAgents: Array<{agent_id: string;label: string}> = []; // no room adapter proven at this time

  const load = useCallback(async () => {
    const response = await fetch("/api/local-agent-team/state", { credentials: "same-origin", cache: "no-store" });
    if (response.ok) setState(await response.json() as TeamState);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && roomOpen) void load();
    }, 25000);
    return () => window.clearInterval(timer);
  }, [load, roomOpen]);

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

  async function sendRoomMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/local-agent-team/messages", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": globalThis.crypto?.randomUUID?.() ?? String(Date.now()) },
        body: JSON.stringify({ text: draft, task_id: selectedTask || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Message persisted in canonical D1; provider NOT_STARTED" : String(payload.code ?? "MESSAGE_FAILED"));
      if (response.ok) { setDraft(""); await load(); }
    } finally { setBusy(false); }
  }

  async function requestHandoff(event: FormEvent) {
    event.preventDefault();
    if (!selectedTask || !verifiedRoomAgents.some(agent => agent.agent_id === targetAgent)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/local-agent-team/tasks/" + encodeURIComponent(selectedTask) + "/handoff", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": globalThis.crypto?.randomUUID?.() ?? String(Date.now()) },
        body: JSON.stringify({ agent_id: targetAgent }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Handoff requested; approval and real runner evidence still required" : String(payload.code ?? "HANDOFF_FAILED"));
      if (response.ok) await load();
    } finally { setBusy(false); }
  }

  async function recordBlockedResult(event: FormEvent) {
    event.preventDefault();
    if (!selectedTask || !resultRef.trim() || !resultSummary.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/local-agent-team/tasks/" + encodeURIComponent(selectedTask) + "/result", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": globalThis.crypto?.randomUUID?.() ?? String(Date.now()) },
        body: JSON.stringify({ status: "BLOCKED", result_ref: resultRef, summary: resultSummary }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Owner-reported BLOCKED result saved; not a verified DONE receipt" : String(payload.code ?? "RESULT_FAILED"));
      if (response.ok) { setResultRef(""); setResultSummary(""); await load(); }
    } finally { setBusy(false); }
  }

  return <section className="wnCard localTeamPanel">
    <div className="wnCardHead localRoomHeader"><div><span className="wnKicker">LOCAL AGENT TEAM · OPENBOT MODE</span><h3>{state.room ?? "launch"} room</h3></div><State value={state.state} />
      <button type="button" className="wnPrimary" aria-expanded={roomOpen} aria-controls="waveLaunchRoom" onClick={() => setRoomOpen(value => !value)}>{roomOpen ? "Close Launch Room" : "Launch Room →"}</button>
    </div>
    <p className="wnBody">Persistent tasks use the existing D1 agent queue and {state.canonical_session ?? "owner-main / 1LSS_OWNER_MAIN"}. Provider setup, launch, command execution, and verified results remain separate states; WRITE and EXECUTE tasks stay WAITING_APPROVAL until the existing owner gate is satisfied.</p>
    <div className="localTeamLocation">Canonical data: <strong>{state.storage?.canonical ?? "Cloudflare D1 / agent_tasks, agent_events, agent_checkpoints"}</strong>. This is not local-only storage.</div>
    {roomOpen && <section id="waveLaunchRoom" className="localLaunchRoom" aria-label="OpenBot Launch Room">
      <div className="localRoomBar"><strong>Launch Room · owner-main / 1LSS_OWNER_MAIN</strong><button type="button" onClick={() => void load()} disabled={busy}>Refresh</button><a href="/chat">WAVE Chat</a></div>
      <div className="localRoomColumns">
        <div className="localRoomConversation">
          <h4>Persistent conversation</h4>
          <div className="localRoomMessages" aria-live="polite">
            {(state.messages ?? []).map(item => <article key={item.id} className="localRoomMessage">
              <div><strong>{item.actor === "owner-main" ? "Owner" : item.actor}</strong><small>{item.created_at ?? ""}</small></div>
              <p>{item.text}</p><small>{item.task_id ? "Task " + item.task_id : "Launch Room"}</small>
            </article>)}
            {!state.messages?.length && <p className="wnEmpty">No messages yet. Notes are persisted in the existing D1 agent_events table.</p>}
          </div>
          <form className="localRoomMessageForm" onSubmit={sendRoomMessage}>
            <label>Room message<textarea maxLength={800} required value={draft} onChange={event => setDraft(event.target.value)} placeholder="Type a note or task decision…"/></label>
            <button type="submit" className="wnPrimary" disabled={busy || !draft.trim()}>Send message</button>
          </form>
        </div>
        <div className="localRoomTeammates">
          <h4>Agents · binding truth</h4>
          <div className="wnRows">{(state.providers ?? []).map(provider => <div className="wnRow" key={provider.id}><div>
            <strong>{provider.label}</strong><span>{provider.authentication} · {provider.smoke_test}</span>
            <span>No room adapter execution verified · current task: {(state.tasks ?? []).find(task => task.claimed_by === provider.id)?.title ?? "none"}</span>
            </div><State value="NOT_VERIFIED"/></div>)}</div>
          <p className="localRoomNotice">Providers including Codex, Claude, Gemini, Grok, OpenCode, Cursor, Cline, Ollama and LM Studio are displayed only as configured references until a real runner adapter and session is verified. No paid provider call is initiated by this room.</p>
        </div>
      </div>
      <div className="localRoomColumns">
        <div className="localRoomTeammates">
          <h4>Task handoff · no fabricated agent execution</h4>
          <label>Select persisted task<select value={selectedTask} onChange={event => setSelectedTask(event.target.value)}>
            <option value="">Select task</option>{(state.tasks ?? []).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select></label>
          <form className="localRoomMessageForm" onSubmit={requestHandoff}><label>Agent with verified adapter
            <select value={targetAgent} onChange={event => setTargetAgent(event.target.value)}>
              <option value="">No verified room adapter available</option>
              {verifiedRoomAgents.map(agent => <option key={agent.agent_id} value={agent.agent_id}>{agent.label}</option>)}
            </select></label>
            <button disabled={busy || !selectedTask || !targetAgent || !verifiedRoomAgents.length} type="submit">Request handoff</button>
          </form>
          <p className="localRoomNotice">Handoff is disabled until a verified room runtime adapter exists. Existing Codex CLI evidence is not a Launch Room binding.</p>
          {selectedTask && <form className="localRoomMessageForm" onSubmit={recordBlockedResult}>
            <label>Blocked-result evidence reference<input maxLength={240} required value={resultRef} onChange={event => setResultRef(event.target.value)}/></label>
            <label>Explanation<input maxLength={800} required value={resultSummary} onChange={event => setResultSummary(event.target.value)}/></label>
            <button type="submit" disabled={busy}>Record BLOCKED result</button>
          </form>}
        </div>
        <div className="localRoomTeammates">
          <h4>Handoffs, checkpoints & results</h4>
          <div className="localRoomEvents">
            {(state.events ?? []).slice(0,30).map(item => <p key={item.id}><strong>{item.event_type}</strong> · {item.task_id ?? "room"} <small>{item.created_at ?? ""}</small></p>)}
            {(state.checkpoints ?? []).slice(0,20).map(item => <p key={item.task_id + item.agent_id}><strong>CHECKPOINT</strong> · {item.agent_id} · {item.checkpoint_ref} <small>{item.updated_at ?? ""}</small></p>)}
            {!state.events?.length && !state.checkpoints?.length && <p className="wnEmpty">No lifecycle receipts yet.</p>}
          </div>
        </div>
      </div>
    </section>}
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
