import { FormEvent, useCallback, useEffect, useState } from "react";

type Binding = {
  id: string;
  provider_id: string;
  state?: string;
  status: string;
  endpoint?: string | null;
  label?: string;
  approval_mode?: string;
  secret_ref_present?: boolean;
  secret_ref_kind?: string;
  last_checked_at?: string | null;
};

type Tool = { name: string; title?: string | null; description?: string | null; risk: string; available?: boolean };

type Discovery = {
  ok?: boolean;
  state?: string;
  provider?: string;
  real_available?: boolean;
  code?: string;
  tools?: Tool[];
};

type FileHandoffAttachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  can_handoff: boolean;
  handoff_blocker?: string | null;
  created_at?: number;
};
type FileHandoffStatus = {
  ok?: boolean;
  protocol?: string;
  gate_state?: string;
  storage?: { provider?: string; state?: string; code?: string | null };
  agent_handoff?: { provider?: string; state?: string; code?: string | null };
  owner_scope?: string;
  session_line?: string;
  max_file_bytes?: number;
  max_file_bytes_label?: string;
  max_direct_model_file_bytes?: number;
  max_direct_model_image_bytes?: number;
  max_direct_model_file_label?: string;
  max_direct_model_image_label?: string;
  part_size_bytes_label?: string;
  direct_execution_bypass?: boolean;
  ccs_gate?: { protocol?: string; state?: string; ok?: boolean; fail_closed?: boolean; direct_execution_bypass?: boolean; code?: string | null };
  model_input_limits?: { file_bytes?: number; image_bytes?: number };
  latest_attachments?: FileHandoffAttachment[];
  code?: string;
};

const stateTone = (value?: string) => {
  const state = String(value || "CONFIGURATION_REQUIRED").toUpperCase();
  if (state === "LIVE" || state === "CONFIGURED" || state === "READY" || state === "UPLOADED" || state === "PROVIDER_FILE_READY" || state === "HANDED_OFF" || state === "LEGACY_SMALL_FILE" || state === "BOUND") return "is-live";
  if (state === "DEGRADED" || state === "SIMULATED" || state === "UPLOADING" || state === "BLOCKED" || state === "FAILED" || state === "STORED_PREPROCESSING_REQUIRED") return "is-warn";
  if (state === "OFFLINE") return "is-offline";
  return "is-config";
};

export default function McpConfigCenter() {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [provider, setProvider] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [label, setLabel] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [fileHandoff, setFileHandoff] = useState<FileHandoffStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [response, fileResponse] = await Promise.all([
        fetch("/api/mcp-config/state", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/chat/attachments/status", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const body = await response.json().catch(() => ({}));
      const fileBody = await fileResponse.json().catch(() => ({}));
      if (!response.ok || !body?.ok) setError(body?.code || `HTTP_${response.status}`);
      else setBindings(Array.isArray(body.bindings) ? body.bindings : []);
      setFileHandoff(fileBody?.ok ? fileBody as FileHandoffStatus : { ok: false, gate_state: "CONFIGURATION_REQUIRED", code: fileBody?.code || `HTTP_${fileResponse.status}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP state read failed");
      setFileHandoff({ ok: false, gate_state: "OFFLINE", code: "FILE_HANDOFF_STATUS_UNAVAILABLE" });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function discover(target = "simulated") {
    setBusy(`discover:${target}`); setError(""); setDiscovery(null);
    try {
      const response = await fetch(`/api/mcp-config/discover?provider=${encodeURIComponent(target)}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      setDiscovery(body as Discovery);
      if (!response.ok && body?.state !== "CONFIGURATION_REQUIRED") setError(body?.code || `HTTP_${response.status}`);
    } finally { setBusy(""); }
  }

  async function handoffFile(id: string) {
    setBusy(`handoff:${id}`); setError("");
    try {
      const response = await fetch(`/api/chat/attachments/${encodeURIComponent(id)}/handoff`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ via: "EXISTING_MCP_STATUS_GATE" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.code || `HTTP_${response.status}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File handoff failed");
    } finally { setBusy(""); }
  }

  async function action(target: string, nextAction: "enable" | "disable") {
    setBusy(`${nextAction}:${target}`); setError("");
    try {
      const response = await fetch("/api/mcp-config/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: target, action: nextAction, approved: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.code || `HTTP_${response.status}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP action failed");
    } finally { setBusy(""); }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy("register"); setError("");
    try {
      const response = await fetch("/api/mcp-config/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.trim(), action: "register", endpoint: endpoint.trim(), secret_ref: secretRef.trim(), label: label.trim(), approved: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.code || `HTTP_${response.status}`);
      setProvider(""); setEndpoint(""); setSecretRef(""); setLabel("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP registration failed");
    } finally { setBusy(""); }
  }

  return <section className="wnCard" aria-label="WAVE MCP Config Center">
    <div className="wnCardHead">
      <div><span className="wnKicker">MCP CONFIG CENTER</span><h3>Registered capability endpoints</h3></div>
      <button onClick={() => void load()} disabled={Boolean(busy)}>Refresh</button>
    </div>
    <p className="wnBody">WAVE stores only safe endpoint metadata and server-side secret references. Never paste a token, password, cookie, private key, or SSH key here.</p>
    {error && <div className="wnError">{error}</div>}

    <div className="wnRows" aria-label="Existing MCP file handoff gate">
      <div className="wnRow">
        <div>
          <strong>File handoff · existing MCP Status gate</strong>
          <span>{fileHandoff?.ccs_gate?.protocol || "CCS/1.0"} · {fileHandoff?.storage?.provider || "Cloudflare R2"} · {fileHandoff?.part_size_bytes_label || "8 MiB"} multipart · owner-main / 1LSS · direct execution bypass disabled</span>
          <span>Storage cap {fileHandoff?.max_file_bytes_label || "1 GiB"} · direct model input {fileHandoff?.max_direct_model_file_label || "48 MiB"} · image {fileHandoff?.max_direct_model_image_label || "20 MiB"}</span>
          {fileHandoff?.storage?.code && <span>{fileHandoff.storage.code}</span>}
          {fileHandoff?.agent_handoff?.code && <span>{fileHandoff.agent_handoff.code}</span>}
          {fileHandoff?.ccs_gate?.code && <span>{fileHandoff.ccs_gate.code}</span>}
        </div>
        <div className="wnActionRow">
          <span className={`wnState ${stateTone(fileHandoff?.gate_state)}`}>{String(fileHandoff?.gate_state || "NOT_MEASURED").toUpperCase()}</span>
          <button onClick={() => void load()} disabled={Boolean(busy)}>Refresh gate</button>
        </div>
      </div>
      {(fileHandoff?.latest_attachments || []).map((attachment) => <div className="wnRow" key={attachment.id}>
        <div>
          <strong title={attachment.filename}>{attachment.filename}</strong>
          <span>{attachment.mime_type} · {(attachment.size_bytes / (1024 * 1024)).toFixed(1)} MiB · {attachment.id}</span>
          {attachment.handoff_blocker && <span>{attachment.handoff_blocker === "MODEL_INPUT_TOO_LARGE" ? "Stored, but direct model input limit is exceeded; chunked extraction is required" : attachment.handoff_blocker}</span>}
          {attachment.status === "PROVIDER_FILE_READY" && <span>Provider file ready; send a WAVE Chat prompt with this attachment selected to verify the agent read</span>}
        </div>
        <div className="wnActionRow">
          <span className={`wnState ${stateTone(attachment.status)}`}>{String(attachment.status).toUpperCase()}</span>
          {attachment.can_handoff && attachment.status === "UPLOADED" && <button disabled={Boolean(busy)} onClick={() => void handoffFile(attachment.id)}>{busy === `handoff:${attachment.id}` ? "Preparing…" : "Prepare for handoff"}</button>}
        </div>
      </div>)}
      {!(fileHandoff?.latest_attachments || []).length && <div className="wnEmpty">No recent file references in owner-main. Select a file in WAVE Chat; large files use the same authenticated MCP gate.</div>}
      <div className="wnPolicy">
        Large-file uploads stay CONFIGURATION_REQUIRED until an R2 bucket is bound. R2 storage up to 1 GiB is separate from direct model input (48 MB total; 20 MB per image). Larger files are retained but marked for chunked extraction; the card never claims the agent read them until a successful model turn is recorded in 1LSS.
      </div>
    </div>

    <div className="wnActionRow">
      <button onClick={() => void discover("simulated")} disabled={Boolean(busy)}>{busy === "discover:simulated" ? "Checking…" : "Safe simulated discovery"}</button>
      <span className="wnPolicy">Real MCP stays CONFIGURATION_REQUIRED until a registered endpoint/auth binding passes initialize + tools/list.</span>
    </div>

    {discovery && <div className="wnRows">
      <div className="wnRow"><div><strong>{discovery.provider || "MCP discovery"}</strong><span>{discovery.code || (discovery.real_available ? "real endpoint verified" : "no real endpoint claimed")}</span></div><span className={`wnState ${stateTone(discovery.state)}`}>{String(discovery.state || "CONFIGURATION_REQUIRED").toUpperCase()}</span></div>
      {(discovery.tools || []).map((tool) => <div className="wnRow" key={tool.name}><div><strong>{tool.title || tool.name}</strong><span>{tool.description || tool.name}</span></div><span className={`wnState ${tool.risk === "READ" ? "is-live" : "is-warn"}`}>{tool.risk}</span></div>)}
    </div>}

    <div className="wnRows">
      {bindings.map((binding) => <div className="wnRow" key={binding.id}>
        <div><strong>{binding.label || binding.provider_id}</strong><span>{binding.provider_id} · {binding.endpoint || "endpoint not configured"} · auth {binding.secret_ref_present ? binding.secret_ref_kind : "none"}</span></div>
        <div className="wnActionRow">
          <span className={`wnState ${stateTone(binding.status)}`}>{String(binding.status).toUpperCase()}</span>
          <button disabled={Boolean(busy)} onClick={() => void discover(binding.provider_id)}>Discover</button>
          <button disabled={Boolean(busy)} onClick={() => void action(binding.provider_id, binding.status === "disabled" ? "enable" : "disable")}>{binding.status === "disabled" ? "Enable" : "Disable"}</button>
        </div>
      </div>)}
      {!bindings.length && <div className="wnEmpty">No real MCP binding registered on staging.</div>}
    </div>

    <form onSubmit={register} className="wnAuthForm" aria-label="Register MCP metadata">
      <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="provider id (existing provider)" required />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (optional)" />
      <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://allowlisted-mcp-host/..." inputMode="url" required />
      <input value={secretRef} onChange={(e) => setSecretRef(e.target.value)} placeholder="secret ref only: env:MCP_TOKEN (optional)" autoComplete="off" />
      <button type="submit" disabled={Boolean(busy)}>{busy === "register" ? "Registering…" : "Register metadata"}</button>
    </form>
  </section>;
}
