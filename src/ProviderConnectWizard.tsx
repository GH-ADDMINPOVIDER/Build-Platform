import { useCallback, useEffect, useState } from "react";

type Credential = { name: string; present: boolean; source: string; kind: string; value?: string | null };
type Provider = {
  id: string;
  label: string;
  state: string;
  route_mode?: string;
  summary?: string;
  credentials?: Credential[];
  api?: { ok?: boolean; http_status?: number; bot_name?: string | null; basic_id?: string | null };
  checked_at?: string;
};
type Delivery = { id: string; label: string; state: string; route_mode: string; requirement: string; openai_builtin_connector: boolean };

type StateBody = { ok?: boolean; providers?: Provider[]; delivery?: Delivery[]; policy?: string; code?: string; message?: string };

function tone(state = "") {
  const value = state.toUpperCase();
  if (["LIVE", "CONFIGURED", "CONNECTED"].includes(value)) return "pcGood";
  if (["PARTNER_ACCESS_REQUIRED", "CREDENTIAL_ROTATION_REQUIRED", "LINE_CHANNEL_ID_REQUIRED", "META_APP_SECRET_REQUIRED", "META_VERIFY_TOKEN_REQUIRED", "TOKEN_REQUIRED", "QUOTA_BLOCKED"].includes(value)) return "pcWarn";
  if (["ERROR", "TOKEN_INVALID", "UNSUPPORTED_DIRECT_API"].includes(value)) return "pcBad";
  return "pcQuiet";
}

export default function ProviderConnectWizard() {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [delivery, setDelivery] = useState<Delivery[]>([]);
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/provider-connect/state", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as StateBody;
      if (!response.ok || !body.ok) throw new Error(body.message || body.code || `HTTP_${response.status}`);
      setProviders(Array.isArray(body.providers) ? body.providers : []);
      setDelivery(Array.isArray(body.delivery) ? body.delivery : []);
      setPolicy(body.policy || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Provider state unavailable"); }
    finally { setLoading(false); }
  }, []);

  async function action(provider: string, nextAction: string) {
    const key = `${provider}:${nextAction}`;
    setBusy(key); setMessage(""); setError("");
    try {
      const response = await fetch("/api/provider-connect/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `provider_${crypto.randomUUID()}` },
        body: JSON.stringify({ provider, action: nextAction }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        const exact = [body?.code, body?.message].filter(Boolean).join(" · ");
        throw new Error(exact || `HTTP_${response.status}`);
      }
      setMessage(`${provider.toUpperCase()} · ${nextAction} สำเร็จ${body?.webhook?.official_test ? " · webhook test ผ่าน" : ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Provider action failed"); }
    finally { setBusy(""); }
  }

  useEffect(() => {
    const wire = () => {
      const nav = document.querySelector<HTMLElement>(".cpSide nav");
      if (!nav || nav.querySelector(".providerConnectNavButton")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "providerConnectNavButton";
      button.innerHTML = "<span>◎</span>Provider Connect";
      button.onclick = () => setOpen(true);
      nav.append(button);
    };
    wire();
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.querySelector(".providerConnectNavButton")?.classList.toggle("active", open);
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  return <section className="providerConnectShell" aria-label="OGENIC Provider Connect Wizard">
    <header className="providerConnectHeader">
      <div>
        <span className="eyebrow">OGENIC PROVIDER FABRIC</span>
        <h1>Provider Connect</h1>
        <p>ไม่ต้องงม Token · ตรวจของเดิมก่อน · ต่อ Direct API/MCP/OAuth เท่าที่ provider รองรับ</p>
      </div>
      <div className="pcHeaderActions">
        <button onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "↻ Refresh"}</button>
        <button className="pcClose" onClick={() => setOpen(false)}>✕</button>
      </div>
    </header>

    {message && <div className="pcNotice pcSuccess">{message}</div>}
    {error && <div className="pcNotice pcError">{error}</div>}

    <div className="pcTopNote">
      <b>กฎใหม่:</b> ระบบจะใช้ credential ที่มีใน Infisical/Worker ก่อนเสมอ ถ้าขาดจะบอกชื่อที่ขาดตรง ๆ ไม่พาไปหา API มั่ว ๆ และไม่แสดงค่า secret จริง
    </div>

    <div className="pcGrid">
      {providers.map((item) => <article className="pcCard" key={item.id}>
        <div className="pcCardHead">
          <div><b>{item.label}</b><small>{item.route_mode || "—"}</small></div>
          <span className={`pcState ${tone(item.state)}`}>{item.state}</span>
        </div>
        <p>{item.summary || "Provider status"}</p>
        {item.api?.bot_name && <div className="pcBot">LINE Bot: <b>{item.api.bot_name}</b>{item.api.basic_id ? ` · ${item.api.basic_id}` : ""}</div>}
        <div className="pcCredentials">
          {(item.credentials || []).map((cred) => <div key={cred.name} className={cred.present ? "present" : "missing"}>
            <span>{cred.present ? "✓" : "!"}</span><div><b>{cred.name}</b><small>{cred.source} · {cred.present ? "stored server-side" : "missing"}</small></div>
          </div>)}
        </div>
        <div className="pcActions">
          <button disabled={busy !== ""} onClick={() => void action(item.id, "test")}>{busy === `${item.id}:test` ? "Testing…" : "Safe test"}</button>
          <button className="pcPrimary" disabled={busy !== ""} onClick={() => void action(item.id, item.state === "LIVE" ? "reconnect" : "connect")}>{busy.startsWith(`${item.id}:`) ? "Working…" : item.state === "LIVE" ? "Reconnect" : "Connect"}</button>
          <button className="pcDanger" disabled={busy !== ""} onClick={() => void action(item.id, "disconnect")}>Disconnect</button>
        </div>
      </article>)}
    </div>

    <section className="pcDeliverySection">
      <div className="pcSectionTitle"><div><span className="eyebrow">DELIVERY / COMMERCE</span><h2>Partner access matrix</h2></div><small>OpenAI Function Calling เป็นสมองเลือก tool — ไม่ได้สร้างสิทธิ์ partner ให้เอง</small></div>
      <div className="pcDeliveryGrid">
        {delivery.map((item) => <article key={item.id} className="pcDeliveryCard">
          <div><b>{item.label}</b><span className={`pcState ${tone(item.state)}`}>{item.state}</span></div>
          <p>{item.requirement}</p>
          <small>OpenAI built-in connector: {item.openai_builtin_connector ? "YES" : "NO"} · Route: {item.route_mode}</small>
          <button disabled={busy !== ""} onClick={() => void action(item.id, "connect")}>Check access</button>
        </article>)}
      </div>
    </section>

    <footer className="pcFooter"><span>{policy}</span><b>Outbound customer actions remain Human Approval gated.</b></footer>
  </section>;
}
