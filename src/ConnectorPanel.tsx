import { useCallback, useEffect, useMemo, useState } from "react";

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
type PlatformTool = {
  id: string;
  label: string;
  state: string;
  risk: string;
  note: string;
};
type PlatformModel = { id: string; owned_by?: string; created?: number };
type PlatformFile = { id: string; filename: string; bytes: number; purpose: string; created_at: number };
type PlatformStore = { id: string; name: string; status: string; usage_bytes: number; created_at: number; files_total: number };
type OpenAIPlatform = {
  ok: boolean;
  api_key_state: string;
  checked_at: string;
  models: { state: string; count: number; data: PlatformModel[]; error?: string | null };
  files: { state: string; count: number; data: PlatformFile[]; error?: string | null };
  vector_stores: { state: string; count: number; data: PlatformStore[]; knowledge_store_id?: string | null; error?: string | null };
  admin: { state: string; note: string };
  tools: PlatformTool[];
  mcp: { state: string; endpoint: string; auto_execute: boolean };
  policy: string;
};

function stateClass(state = "") {
  const value = state.toUpperCase();
  if (["LIVE", "CONFIGURED", "OK", "BOUND"].includes(value)) return "good";
  if (["QUOTA_BLOCKED", "ERROR", "REJECTED_SIGNATURE"].includes(value)) return "bad";
  if (["DEGRADED", "HUMAN_APPROVAL_REQUIRED", "APPROVAL_REQUIRED", "HIGH_RISK", "METERED"].includes(value)) return "warn";
  return "quiet";
}

function formatBytes(value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export default function ConnectorPanel() {
  const [open, setOpen] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [platform, setPlatform] = useState<OpenAIPlatform | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [ensuringStore, setEnsuringStore] = useState(false);
  const [prompt, setPrompt] = useState("เช็กสถานะ LINE, Meta และ n8n ให้หน่อย แล้วใช้ web search ถ้าต้องเช็กข้อมูลล่าสุด");
  const [model, setModel] = useState("gpt-5.6-sol");
  const [functionResult, setFunctionResult] = useState("");
  const [functionMeta, setFunctionMeta] = useState("");
  const [runningFunction, setRunningFunction] = useState(false);

  const featuredModels = useMemo(() => {
    const preferred = ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
    const available = platform?.models.data ?? [];
    return preferred.map((id) => available.find((item) => item.id === id)).filter(Boolean) as PlatformModel[];
  }, [platform]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [connectorResponse, eventResponse, platformResponse] = await Promise.all([
        fetch("/api/connectors", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/connectors/events?limit=20", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/openai/platform", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const connectorBody = await connectorResponse.json().catch(() => ({}));
      const eventBody = await eventResponse.json().catch(() => ({}));
      const platformBody = await platformResponse.json().catch(() => ({}));
      if (!connectorResponse.ok) throw new Error(connectorBody?.message || connectorBody?.code || `HTTP_${connectorResponse.status}`);
      setConnectors(Array.isArray(connectorBody.connectors) ? connectorBody.connectors : []);
      setEvents(eventResponse.ok && Array.isArray(eventBody.events) ? eventBody.events : []);
      setPlatform(platformResponse.ok && platformBody?.ok ? platformBody as OpenAIPlatform : null);
      if (!platformResponse.ok && platformBody?.code) setError(`OpenAI Platform: ${platformBody.message || platformBody.code}`);
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

  async function ensureKnowledgeStore() {
    if (ensuringStore) return;
    setEnsuringStore(true); setError("");
    try {
      const response = await fetch("/api/openai/vector-stores/ensure", { method: "POST", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      setFunctionResult(`${body.store?.created ? "Created" : "Found"} OpenAI vector store: ${body.store?.name || "OGENIC Knowledge"}`);
      setFunctionMeta("File Search store ready · first 1 GB vector storage is free under current OpenAI pricing");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create OpenAI vector store"); }
    finally { setEnsuringStore(false); }
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
      const calls = Array.isArray(body.function_calls) ? body.function_calls.map((call: any) => `${call.name}:${call.state}`).join(" · ") : "no custom function";
      const hosted = body.hosted_tools ? `web:${body.hosted_tools.web_search} · files:${body.hosted_tools.file_search}` : "";
      setFunctionMeta(`${body.model || model} · ${hosted} · ${calls} · ${body.usage_tokens || 0} tokens · ${body.policy || ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Function calling failed"); }
    finally { setRunningFunction(false); }
  }

  if (!open) return null;

  return <section className="connectorPanelShell" aria-label="OGENIC Connectors and OpenAI Platform">
    <header className="connectorPanelHeader">
      <div><span className="eyebrow">OGENIC CONNECTOR FABRIC</span><h1>Connectors & OpenAI</h1><p>Platform inventory · hosted tools · function calling · verified hooks · n8n failover</p></div>
      <div><button onClick={() => void load()}>{loading ? "Checking…" : "↻ Refresh"}</button><button className="connectorClose" onClick={() => setOpen(false)}>✕</button></div>
    </header>
    {error && <div className="cpError">{error}</div>}

    {platform && <article className="openAIPlatformPanel">
      <div className="openAIPlatformHead">
        <div><span className="eyebrow">OPENAI PLATFORM · OWNER ONLY</span><h2>Platform Hub</h2><p>ใช้ API key ฝั่ง server อ่านสถานะจริง ไม่ต้องไล่หาเมนูใน Platform ทีละหน้า</p></div>
        <div className="platformHeadActions"><span className={`connectorState ${stateClass(platform.api_key_state)}`}>API {platform.api_key_state}</span><button disabled={ensuringStore} onClick={() => void ensureKnowledgeStore()}>{ensuringStore ? "Creating…" : platform.vector_stores.knowledge_store_id ? "✓ Knowledge Store" : "+ Knowledge Store"}</button></div>
      </div>

      <div className="platformMetrics">
        <div><small>MODELS</small><b>{platform.models.count}</b><em className={stateClass(platform.models.state)}>{platform.models.state}</em></div>
        <div><small>FILES</small><b>{platform.files.count}</b><em className={stateClass(platform.files.state)}>{platform.files.state}</em></div>
        <div><small>VECTOR STORES</small><b>{platform.vector_stores.count}</b><em className={stateClass(platform.vector_stores.state)}>{platform.vector_stores.state}</em></div>
        <div><small>ADMIN USAGE/COST</small><b className="platformAdminState">{platform.admin.state === "BOUND" ? "READY" : "—"}</b><em className={stateClass(platform.admin.state)}>{platform.admin.state}</em></div>
      </div>

      <div className="platformTools">
        {platform.tools.map((tool) => <div key={tool.id} className="platformToolCard">
          <div><b>{tool.label}</b><span className={`connectorState ${stateClass(tool.state)}`}>{tool.state}</span></div>
          <small>{tool.risk}</small><p>{tool.note}</p>
        </div>)}
      </div>

      <div className="platformDetailGrid">
        <div className="platformDetailCard"><strong>Models we route</strong><div className="platformTagRow">{featuredModels.length ? featuredModels.map((item) => <code key={item.id}>{item.id}</code>) : <span>No preferred model IDs returned.</span>}</div><small>{platform.models.error || `${platform.models.count} model IDs visible to this project key.`}</small></div>
        <div className="platformDetailCard"><strong>OGENIC Knowledge</strong>{platform.vector_stores.knowledge_store_id ? <><b className="platformStoreReady">READY FOR FILE SEARCH</b><small>Vector store is bound to hosted File Search.</small></> : <><b className="platformStoreMissing">NOT CREATED</b><small>กด + Knowledge Store ครั้งเดียว แล้ว File Search จะต่ออัตโนมัติ</small></>}</div>
        <div className="platformDetailCard"><strong>Recent OpenAI files</strong>{platform.files.data.slice(0, 4).map((file) => <div className="platformFileRow" key={file.id}><span>{file.filename || file.id}</span><small>{formatBytes(file.bytes)} · {file.purpose}</small></div>)}{!platform.files.data.length && <small>No project files yet.</small>}</div>
        <div className="platformDetailCard"><strong>Admin / Billing</strong><span className={`connectorState ${stateClass(platform.admin.state)}`}>{platform.admin.state}</span><small>{platform.admin.note}</small></div>
      </div>
    </article>}

    <div className="connectorGrid">
      {connectors.map((item) => <article key={item.id} className="connectorCard">
        <div className="connectorCardTop"><div><b>{item.label}</b><small>{item.kind} · {item.route_mode}</small></div><span className={`connectorState ${stateClass(item.state)}`}>{item.state}</span></div>
        <p>{item.summary}</p>{item.last_error && <code>{item.last_error}</code>}
        <div className="connectorCardFoot"><small>{new Date(item.checked_at).toLocaleTimeString()}</small><button disabled={testing === item.id} onClick={() => void test(item.id)}>{testing === item.id ? "Testing…" : "Safe test"}</button></div>
      </article>)}
    </div>

    <div className="connectorSplit">
      <article className="connectorFunctionPanel">
        <span className="eyebrow">OPENAI RESPONSES + TOOLS</span><h2>Connector AI</h2>
        <p>ตอนนี้มี Web Search + File Search + OGENIC Functions ใน request เดียว ส่วน LINE/Meta/n8n ที่มี side effect ยังหยุดที่ Human Approval ก่อนเสมอ</p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
        <div className="connectorFunctionActions"><select value={model} onChange={(e) => setModel(e.target.value)}><option value="gpt-5.6-sol">GPT-5.6 Sol</option><option value="gpt-6-astra">GPT-6 Astra</option></select><button disabled={runningFunction || !prompt.trim()} onClick={() => void askFunctions()}>{runningFunction ? "Calling tools…" : "Run tools"}</button></div>
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
