import { useCallback, useEffect, useState } from "react";

type Connector = {
  id: string;
  label: string;
  kind: string;
  state: string;
  route_mode: string;
  summary: string;
  last_error?: string | null;
  checked_at: string;
};
type HookEvent = {
  id?: string;
  provider?: string;
  event_type?: string;
  state?: string;
  external_id?: string | null;
  created_at?: number;
};

function stateClass(state = "") {
  const value = state.toUpperCase();
  if (["LIVE", "CONFIGURED", "OK"].includes(value)) return "good";
  if (["QUOTA_BLOCKED", "ERROR", "REJECTED_SIGNATURE"].includes(value)) return "bad";
  if (["DEGRADED", "HUMAN_APPROVAL_REQUIRED"].includes(value)) return "warn";
  return "quiet";
}

export default function ConnectorPanel() {
  const [open, setOpen] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [prompt, setPrompt] = useState("เช็กสถานะ LINE, Meta และ n8n ให้หน่อย แล้วบอกว่าตัวไหนพร้อมใช้");
  const [model, setModel] = useState("gpt-5.6-sol");
  const [functionResult, setFunctionResult] = useState("");
  const [functionMeta, setFunctionMeta] = useState("");
  const [runningFunction, setRunningFunction] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [connectorResponse, eventResponse] = await Promise.all([
        fetch("/api/connectors", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/connectors/events?limit=20", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const connectorBody = await connectorResponse.json().catch(() => ({}));
      const eventBody = await eventResponse.json().catch(() => ({}));
      if (!connectorResponse.ok) throw new Error(connectorBody?.message || connectorBody?.code || `HTTP_${connectorResponse.status}`);
      setConnectors(Array.isArray(connectorBody.connectors) ? connectorBody.connectors : []);
      setEvents(eventResponse.ok && Array.isArray(eventBody.events) ? eventBody.events : []);
    } catch (e) { setError(e instanceof Error ? e.message : "Connector status unavailable"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const wire = () => {
      const nav = document.querySelector<HTMLElement>(".cpSide nav");
      if (!nav || nav.querySelector(".connectorNavButton")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "connectorNavButton";
      button.innerHTML = "<span>↯</span>Connectors";
      button.onclick = () => setOpen(true);
      nav.append(button);
    };
    wire();
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.querySelector(".connectorNavButton")?.classList.toggle("active", open);
    if (open) void load();
  }, [open, load]);

  async function test(id: string) {
    setTesting(id); setError("");
    try {
      const response = await fetch("/api/connectors/test", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connector: id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setFunctionResult(`Test ${id}: ${JSON.stringify(body.test, null, 2)}`);
      setFunctionMeta("Safe read-only connector test");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Connector test failed"); }
    finally { setTesting(""); }
  }

  async function askFunctions() {
    const text = prompt.trim(); if (!text || runningFunction) return;
    setRunningFunction(true); setError(""); setFunctionResult(""); setFunctionMeta("");
    try {
      const response = await fetch("/api/chat/functions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `connector_${crypto.randomUUID()}` },
        body: JSON.stringify({ prompt: text, model }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setFunctionResult(body.text || "Function inspection completed");
      const calls = Array.isArray(body.function_calls) ? body.function_calls.map((call: any) => `${call.name}:${call.state}`).join(" · ") : "no tool call";
      setFunctionMeta(`${body.model || model} · ${calls} · ${body.policy || ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Function calling failed"); }
    finally { setRunningFunction(false); }
  }

  if (!open) return null;

  return <section className="connectorPanelShell" aria-label="OGENIC Connectors and Hooks">
    <header className="connectorPanelHeader">
      <div><span className="eyebrow">OGENIC CONNECTOR FABRIC</span><h1>Connectors & Hooks</h1><p>Function calling · verified webhooks · direct HTTP · n8n failover</p></div>
      <div><button onClick={() => void load()}>{loading ? "Checking…" : "↻ Refresh"}</button><button className="connectorClose" onClick={() => setOpen(false)}>✕</button></div>
    </header>
    {error && <div className="cpError">{error}</div>}

    <div className="connectorGrid">
      {connectors.map((item) => <article key={item.id} className="connectorCard">
        <div className="connectorCardTop"><div><b>{item.label}</b><small>{item.kind} · {item.route_mode}</small></div><span className={`connectorState ${stateClass(item.state)}`}>{item.state}</span></div>
        <p>{item.summary}</p>{item.last_error && <code>{item.last_error}</code>}
        <div className="connectorCardFoot"><small>{new Date(item.checked_at).toLocaleTimeString()}</small><button disabled={testing === item.id} onClick={() => void test(item.id)}>{testing === item.id ? "Testing…" : "Safe test"}</button></div>
      </article>)}
    </div>

    <div className="connectorSplit">
      <article className="connectorFunctionPanel">
        <span className="eyebrow">OPENAI FUNCTION CALLING</span><h2>Connector AI</h2>
        <p>AI เลือก tool ได้เอง แต่ LINE/Meta/n8n ที่มี side effect จะหยุดที่ Human Approval ก่อนเสมอ</p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
        <div className="connectorFunctionActions"><select value={model} onChange={(e) => setModel(e.target.value)}><option value="gpt-5.6-sol">GPT-5.6 Sol</option><option value="gpt-6-astra">GPT-6 Astra</option></select><button disabled={runningFunction || !prompt.trim()} onClick={() => void askFunctions()}>{runningFunction ? "Calling tools…" : "Run function call"}</button></div>
        {functionResult && <div className="connectorResult"><pre>{functionResult}</pre>{functionMeta && <small>{functionMeta}</small>}</div>}
      </article>

      <article className="connectorEventsPanel">
        <span className="eyebrow">HOOK AUDIT</span><h2>Recent events</h2>
        <div className="hookEndpoints"><code>POST /hooks/line</code><code>GET/POST /hooks/meta</code><code>POST /hooks/openai</code><code>POST /hooks/generic</code></div>
        <div className="connectorEvents">{events.map((event, index) => <div key={event.id || index}><span>{event.provider || "hook"}</span><b>{event.event_type || "event"}</b><em className={stateClass(event.state)}>{event.state || "—"}</em></div>)}{!events.length && <p>No verified hook events yet.</p>}</div>
      </article>
    </div>
  </section>;
}
