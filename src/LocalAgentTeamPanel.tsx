import { FormEvent, useCallback, useEffect, useState } from "react";
import "./local-agent-team.css";

type TeamState = {
  room?: string;
  canonical_session?: string;
  state?: string;
  agents?: Array<{ agent_id: string; label?: string; provider?: string; state?: string; runtime?: string }>;
  providers?: Array<{ id: string; label: string; configuration: string; authentication: string; smoke_test: string; evidence: string; dispatchable?: boolean; room_adapter?: string; billing?: string }>;
  tasks?: Array<{ id: string; title: string; status: string; permission?: string; command_task_id?: string | null; runtime_receipt?: { status: string; result_ref?: string } | null; agent_state?: string; claimed_by?: string | null; updated_at?: string; latest_event?: string | null }>;
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
  const [quickPrompt, setQuickPrompt] = useState("");
  const [quickKey, setQuickKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
  const [selectedTask, setSelectedTask] = useState("");
  const [targetAgent, setTargetAgent] = useState("");
  const [resultRef, setResultRef] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const verifiedRoomAgents: Array<{ agent_id: string; label: string }> = [];
  // Only the existing, D1-proven Codex READ adapter can dispatch today.
  const codexReady = state.providers?.some((item) => item.id === "codex" &&
    item.dispatchable === true && item.smoke_test === "READONLY_E2E_PASS") === true;
  const roomTask = (state.tasks ?? []).find((item) => item.id === selectedTask);
  const readonlyEligible = codexReady && roomTask?.permission === "READ" &&
    roomTask.status === "QUEUED" && !roomTask.command_task_id;

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

  // One-prompt Owner command: existing D1 task + conversation + Yellow/Codex dispatch.
  // Keep the request key stable until successful dispatch for safe network retries.
  async function quickSendToCodex(event: FormEvent) {
    event.preventDefault();
    if (busy || !codexReady || !quickPrompt.trim()) return;
    setBusy(true); setMessage("");
    const prompt = quickPrompt.trim();
    try {
      const created = await fetch("/api/local-agent-team/tasks", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": quickKey },
        body: JSON.stringify({
          title: prompt.slice(0, 160), description: prompt.slice(0, 800),
          workspace_ref: "workspace:staging", permission: "READ",
        }),
      });
      const record = await created.json().catch(() => ({})) as { code?: string; task?: { id?: string } };
      const id = String(record.task?.id || "");
      if (!created.ok || !/^localteam_[a-f0-9]{64}$/.test(id)) {
        throw new Error(record.code || "ROOM_TASK_NOT_SAVED");
      }
      setSelectedTask(id);
      const response = await fetch("/api/local-agent-team/messages", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": quickKey + "-message" },
        body: JSON.stringify({ text: prompt.slice(0, 800), task_id: id }),
      });
      const roomMessage = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) throw new Error(roomMessage.code || "ROOM_MESSAGE_NOT_SAVED");
      const dispatched = await fetch("/api/local-agent-team/tasks/" + encodeURIComponent(id) + "/dispatch", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: "codex" }),
      });
      const receipt = await dispatched.json().catch(() => ({})) as { code?: string; command_task_id?: string };
      if (!dispatched.ok) throw new Error(receipt.code || "ROOM_CODEX_DISPATCH_FAILED");
      setMessage("Codex READ dispatched · " + (receipt.command_task_id || "pending") +
        " · awaiting verified Runner-1 / D1 receipt (not DONE)");
      setQuickPrompt("");
      setQuickKey(globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ROOM_QUICK_COMMAND_FAILED");
      await load();
    } finally {
      setBusy(false);
    }
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
      setMessage(response.ok ? "Owner-signed handoff recorded; a verified runtime adapter is still required" : String(payload.code ?? "HANDOFF_FAILED"));
      if (response.ok) await load();
    } finally { setBusy(false); }
  }

  async function runCodexReadOnly() {
    if (!selectedTask || !readonlyEligible || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/local-agent-team/tasks/" + encodeURIComponent(selectedTask) + "/dispatch", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: "codex" }),
      });
      const data = await response.json().catch(() => ({})) as {
        code?: string; command_task_id?: string; completion_url?: string;
      };
      if (!response.ok) {
        setMessage(data.code ?? `DISPATCH_HTTP_${response.status}`);
      } else {
        setMessage(`${data.code ?? "QUEUED"} · ${data.command_task_id ?? "pending"} · QUEUED ≠ DONE; await D1 receipt`);
        await load();
      }
    } catch { setMessage("ROOM_DISPATCH_UNAVAILABLE"); }
    finally { setBusy(false); }
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
    <p className="wnBody">Persistent tasks use the existing D1 agent queue and {state.canonical_session ?? "owner-main / 1LSS_OWNER_MAIN"}. Provider setup, launch, command execution, and verified results remain separate states; WRITE and EXECUTE requests use the signed Owner Session; execution still requires a verified adapter and real runner receipt.</p>
    <div className="localTeamLocation">Canonical data: <strong>{state.storage?.canonical ?? "Cloudflare D1 / agent_tasks, agent_events, agent_checkpoints"}</strong>. This is not local-only storage.</div>
    {roomOpen && <section id="waveLaunchRoom" className="localLaunchRoom" aria-label="OpenBot Launch Room">
      <div className="localRoomBar"><strong>Launch Room · owner-main / 1LSS_OWNER_MAIN</strong><button type="button" onClick={() => void load()} disabled={busy}>Refresh</button><a href="/chat">WAVE Chat</a></div>
      <form className="localRoomQuickRun" onSubmit={quickSendToCodex} aria-label="OpenBot one-prompt Codex read-only task">
        <label htmlFor="openbot-quick-task"><strong>Quick command · Codex on Runner-1</strong></label>
        <textarea id="openbot-quick-task" value={quickPrompt}
          onChange={(event) => setQuickPrompt(event.target.value)} maxLength={800} rows={3}
          placeholder="พิมพ์สิ่งที่ต้องการให้ Codex ตรวจบน Staging แล้วกดส่งได้เลย…" />
        <div className="localRoomQuickActions">
          <span>{codexReady ? "READ-only · Signed Owner Session · D1 checkpoint + real receipt"
            : "Codex Runtime ยังไม่ยืนยัน · ไม่เรียก API เสียเงินแทน"}</span>
          <button type="submit" className="wnPrimary" disabled={busy || !codexReady || !quickPrompt.trim()}>
            {busy ? "Sending…" : "Send to Codex →"}
          </button>
        </div>
      </form>
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
            <span>{provider.room_adapter === "CODEX_READONLY_EXISTING_WAVE" ? "Existing Codex CLI · read-only E2E receipt present" : "No room adapter execution verified"} · current task: {(state.tasks ?? []).find(task => task.claimed_by === provider.id)?.title ?? "none"}</span>
            </div><State value={provider.dispatchable ? "READ_READY" : "NOT_VERIFIED"}/></div>)}</div>
          <p className="localRoomNotice">Codex uses the existing Runner-1 CLI for READ-only tasks when a signed E2E receipt is found in D1. Claude, Gemini, Grok, OpenCode, Cursor, Cline, Ollama and LM Studio stay disabled until independently verified. No extra provider API purchase.</p>
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
          <div className="localRoomCodexAction">
              <strong>Codex · Runner-1 · Read-only</strong>
              <p>Runs the selected READ task title through the existing signed Owner → Yellow → GitHub Actions → Codex → D1 route. No host writes.</p>
              <button type="button" className="wnPrimary" onClick={() => void runCodexReadOnly()} disabled={busy || !readonlyEligible}>
                {busy ? "Dispatching…" : "Run Codex read-only →"}
              </button>
              <small>{!codexReady ? "Existing Codex runtime E2E receipt or dispatch credentials not confirmed." : !selectedTask ? "Select a READ task above." : roomTask?.permission !== "READ" ? "This task is not READ; no write/execute room adapter." : roomTask.command_task_id ? "Command already linked. Check its receipt below." : "Ready for bounded read-only dispatch."}</small>
              {roomTask?.command_task_id && <a href={"/command?task_id=" + encodeURIComponent(roomTask.command_task_id)}>Command {roomTask.command_task_id.slice(0, 23)}…</a>}
              {roomTask?.runtime_receipt?.result_ref?.startsWith("https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/") &&
                <a href={roomTask.runtime_receipt.result_ref} target="_blank" rel="noopener noreferrer">Verified Runner evidence</a>}
              {roomTask?.runtime_receipt && <State value={roomTask.runtime_receipt.status} />}
            </div>
            <p className="localRoomNotice">Other providers remain disabled until their own runtime adapters produce evidence. READ-only E2E proof for Codex does not mean every provider is ready.</p>
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
    <div className="wnRows">{(state.tasks ?? []).slice(0, 8).map((task) => <div className="wnRow" key={task.id}><div><strong>{task.title}</strong><span>{task.id} · {task.permission ?? "UNKNOWN"} · {task.claimed_by ?? "unassigned"} · {task.latest_event ?? "no event"}</span></div><State value={task.agent_state ?? task.status} /></div>)}{!state.tasks?.length && <div className="wnEmpty">No local team tasks yet.</div>}</div>
  </section>;
}
