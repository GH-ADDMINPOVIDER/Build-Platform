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

const stateTone = (value?: string) => {
  const state = String(value || "CONFIGURATION_REQUIRED").toUpperCase();
  if (state === "LIVE" || state === "CONFIGURED") return "is-live";
  if (state === "DEGRADED" || state === "SIMULATED") return "is-warn";
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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/mcp-config/state", { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) {
      setError(body?.code || `HTTP_${response.status}`);
      return;
    }
    setBindings(Array.isArray(body.bindings) ? body.bindings : []);
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
