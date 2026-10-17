import { useEffect, useMemo, useState } from "react";

type Json = Record<string, any>;

const scenarios = [
  ["happy_path", "Core PASS"],
  ["replay", "Replay"],
  ["protocol_mismatch", "Protocol mismatch"],
  ["approval_gate", "Approval gate"],
  ["secret_reject", "Secret boundary"],
  ["ruby_reject", "Ruby reject"],
] as const;

function ResultCard({ title, value }: { title: string; value: Json | null }) {
  const lifecycle = useMemo(() => {
    const candidate = value?.journey?.map?.((row: Json) => row?.action?.verb ?? row?.code) ?? value?.result?.lifecycle ?? value?.first?.lifecycle ?? value?.tests?.map?.((row: Json) => row.test_id);
    return Array.isArray(candidate) ? candidate : [];
  }, [value]);

  return <section className="mlCard">
    <div className="mlCardHead">
      <div>
        <span>RESULT</span>
        <h2>{title}</h2>
      </div>
      <b className={value?.ok === false ? "isBad" : "isGood"}>{value ? (value.ok === false ? "BLOCKED" : "READY") : "IDLE"}</b>
    </div>
    {lifecycle.length > 0 && <div className="mlLifecycle">
      {lifecycle.map((stage: string) => <span key={stage}>{stage}</span>)}
    </div>}
    <pre>{value ? JSON.stringify(value, null, 2) : "Run a scenario to inspect live MA-OP output."}</pre>
  </section>;
}

const maopChoices = [
  { id: "github-read", title: "GitHub · File READ", enabled: true, note: "Existing MA-OP → Yellow live-read bridge" },
  { id: "ruby-audit", title: "Ruby · Verify / Audit", enabled: true, note: "Existing read-only Ruby scorecard" },
  { id: "n8n-readiness", title: "n8n · Self-host Readiness", enabled: true, note: "Existing read-only self-host status" },
  { id: "codex-ts", title: "Codex TS · Build/Debug", enabled: false, note: "CERTIFICATE_AND_RUNTIME_PROOF_REQUIRED" },
  { id: "codex-gs", title: "Codex GS · Build/Debug", enabled: false, note: "SECOND_ACCOUNT_DISPATCH_NOT_VERIFIED" },
  { id: "gpt-ts", title: "GPT TS · Command", enabled: false, note: "CROSS_ACCOUNT_COMMAND_BRIDGE_REQUIRED" },
  { id: "gpt-gs", title: "GPT GS · Command", enabled: false, note: "CROSS_ACCOUNT_COMMAND_BRIDGE_REQUIRED" },
  { id: "manus", title: "Manus · Long-run Agent", enabled: false, note: "WAVE_RUNTIME_DISPATCH_NOT_VERIFIED" }
] as const;

export default function MaopLab() {
  const [status, setStatus] = useState<Json | null>(null);
  const [result, setResult] = useState<Json | null>(null);
  const [title, setTitle] = useState("First Impression");
  const [busy, setBusy] = useState("");
  const [path, setPath] = useState("package.json");
  const [authRequired, setAuthRequired] = useState(false);
  const [ownerCatalog, setOwnerCatalog] = useState<Json | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<string[]>(["github-read"]);

  useEffect(() => {
    void fetch("/api/maop/lab/owner-capabilities", { credentials: "include", cache: "no-store" })
      .then(async (response) => response.json())
      .then(setOwnerCatalog)
      .catch(() => setOwnerCatalog({ ok: false, code: "CAPABILITY_CATALOG_NOT_LOADED" }));
    void fetch("/api/maop/lab/status", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) setAuthRequired(true);
        return await r.json();
      })
      .then(setStatus)
      .catch((error) => setStatus({ ok: false, code: "NETWORK_ERROR", message: String(error) }));
  }, []);

  async function runCore(scenario: string) {
    setBusy(scenario);
    setTitle(`Core · ${scenario}`);
    try {
      const response = await fetch("/api/maop/lab/core", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }

  async function runGithub() {
    setBusy("github");
    setTitle("Live GitHub READ · MA-OP → Yellow");
    try {
      const response = await fetch("/api/maop/lab/github", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }

  async function runRuby() {
    setBusy("ruby");
    setTitle("Ruby Stone · live scorecard");
    try {
      const response = await fetch("/api/ruby/scorecard", { credentials: "include", cache: "no-store" });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }

  async function inspectLegacyN8n() {
    setBusy("n8n");
    setTitle("Legacy n8n · migration source inventory");
    try {
      const response = await fetch("/api/n8n/migration/status", { credentials: "include", cache: "no-store" });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }


  async function inspectN8nCatalog() {
    setBusy("n8n-catalog");
    setTitle("Recovered n8n · categorized migration catalog");
    try {
      const response = await fetch("/api/n8n/migration/catalog", { credentials: "include", cache: "no-store" });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }

  async function inspectN8nSelfHost() {
    setBusy("n8n-selfhost");
    setTitle("n8n self-host · staging readiness");
    try {
      const response = await fetch("/api/n8n/migration/selfhost/status", { credentials: "include", cache: "no-store" });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }

  async function inspectN8nPlacement() {
    setBusy("n8n-placement");
    setTitle("OGE → n8n execution-fabric placement");
    try {
      const response = await fetch("/api/n8n/migration/placement", { credentials: "include", cache: "no-store" });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }


  async function ccsEnvelope(state: string, verb: string) {
    const response = await fetch("/api/ccs/envelope", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        card_id: "card.lab.github.read",
        holder: "lab-agent-01",
        role: "sandbox_reader",
        capability: "read_file",
        scope: { environment: "staging", permission: "READ" },
        state,
        verb,
      }),
    });
    if (response.status === 401) setAuthRequired(true);
    return await response.json();
  }

  async function runCcsCardDemo() {
    setBusy("ccs-demo");
    setTitle("CCS · Insert → Verify → Use → Return");
    try {
      const journey = [];
      journey.push(await ccsEnvelope("ABSENT", "INSERT"));
      journey.push(await ccsEnvelope("INSERTED", "VERIFY"));
      journey.push(await ccsEnvelope("VERIFIED", "USE"));
      journey.push(await ccsEnvelope("IN_USE", "RETURN"));
      setResult({
        ok: journey.every((step: Json) => step?.ok === true),
        protocol: "CCS/1.0",
        item: "LAB CARD",
        journey,
      });
    } finally {
      setBusy("");
    }
  }

  async function runCcsLeaseDemo() {
    setBusy("ccs-lease");
    setTitle("CCS · Card Lease simulation");
    try {
      const response = await fetch("/api/ccs/lease", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          borrower: {
            card_id: "card.lab.github.read.a",
            slot_id: "slot.github.a",
            holder: "lab-agent-01",
            tier: "WHITE",
            state: "READY",
            provider_id: "github",
            capability_id: "read_file",
            permission_class: "READ",
            environment: "staging",
            lease_eligible: true,
          },
          source: {
            card_id: "card.lab.github.read.b",
            slot_id: "slot.github.b",
            holder: "lab-pool-01",
            tier: "WHITE",
            state: "READY",
            provider_id: "github",
            capability_id: "read_file",
            permission_class: "READ",
            environment: "staging",
            lease_eligible: true,
          },
          reason: "RATE_LIMIT",
          requested_permission: "READ",
          requested_ttl_minutes: 5,
          requested_max_calls: 5,
          operation: "staging read",
        }),
      });
      if (response.status === 401) setAuthRequired(true);
      setResult(await response.json());
    } finally {
      setBusy("");
    }
  }

  async function inspectSelectedChoices() {
    const selected = maopChoices.filter((item) => item.enabled && selectedChoices.includes(item.id));
    if (!selected.length) {
      setTitle("Selected provider route");
      setResult({ ok: false, code: "NO_AVAILABLE_PROVIDER_SELECTED" });
      return;
    }
    setBusy("selected-providers");
    setTitle("MA-OP · Owner-selected provider checks");
    const checks: Json[] = [];
    try {
      for (const item of selected) {
        const url = item.id === "github-read" ? "/api/maop/lab/github"
          : item.id === "ruby-audit" ? "/api/ruby/scorecard"
          : "/api/n8n/migration/selfhost/status";
        try {
          const response = await fetch(url, {
            credentials: "include",
            cache: "no-store",
            ...(item.id === "github-read"
              ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }
              : {}),
          });
          if (response.status === 401) setAuthRequired(true);
          const payload = await response.json();
          checks.push({ selected: item.id, http_status: response.status,
            ok: response.ok && payload?.ok !== false, result: payload });
        } catch (error) {
          checks.push({ selected: item.id, ok: false, code: "NETWORK_ERROR", message: String(error) });
        }
      }
      setResult({ ok: checks.every((item) => item.ok === true),
        execution_authority: "YELLOW_STONE_ONLY",
        mode: "EXPLICIT_OWNER_SELECTION_READ_ONLY",
        not_a_cross_account_dispatch: true, checks });
    } finally {
      setBusy("");
    }
  }

  return <main className="mlRoot">
    <div className="mlFrame">
      <header className="mlHeader">
        <div>
          <span className="mlKicker">WAVE · OGENIC</span>
          <h1>MA-OP Web Lab</h1>
          <p>ทดสอบของจริงบน Cloudflare staging โดยไม่เปิด WRITE หรือ paid provider</p>
        </div>
        <a href="/overview">OPERATE</a>
      </header>

      {authRequired && <div className="mlWarn">
        ต้องเข้า WAVE owner session ก่อน แล้วกลับมาหน้านี้อีกครั้ง · <a href="/overview">ไปหน้า Login / Operate</a>
      </div>}

      <section className="mlStatus">
        <div>
          <span>Runtime</span>
          <strong>{status?.runtime ?? "CHECKING"}</strong>
        </div>
        <div>
          <span>Protocol</span>
          <strong>{status?.protocol_version ?? "—"}</strong>
        </div>
        <div>
          <span>Branch</span>
          <strong>{status?.canonical_branch ?? "—"}</strong>
        </div>
      </section>

      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>AMMONITE REGISTRY</span>
            <h2>บัญชี · สิทธิ์ · ความพร้อม</h2>
          </div>
          <b>CATALOG ONLY</b>
        </div>
        <p className="mlBody">รายการนี้แสดงขีดความสามารถที่ Owner ต้องการและสถานะการพิสูจน์จริง ไม่ใช่ใบอนุญาตให้ Execute หรือ Deploy ทันที</p>
        <div className="mlCatalog">
          {ownerCatalog?.actors?.map?.((actor: Json) => <div className="mlActor" key={actor.id}>
            <div>
              <strong>{actor.id} · {actor.provider}</strong>
              <small>{actor.kind} · {actor.readiness}</small>
              <small>Owner requested: {Array.isArray(actor.requested_capabilities) ? actor.requested_capabilities.join(" · ") : "—"}</small>
            </div>
            <span className={actor.granted_capabilities?.length ? "mlGranted" : "mlUnverified"}>
              {actor.granted_capabilities?.length ? "GRANTED" : "NOT VERIFIED"}
            </span>
          </div>) ?? <p className="mlBody">{ownerCatalog?.code ?? "Loading owner catalog…"}</p>}
        </div>
        <p className="mlBody">Infisical Certificate Manager: {ownerCatalog?.certificate_manager?.status ?? "NOT VERIFIED"} · ไม่มีการสร้าง/เปิดเผย Certificate จากหน้านี้</p>
      </section>

      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>MA-OP SELECTOR</span>
            <h2>เลือก Provider / Agent</h2>
          </div>
          <b>READ / PREFLIGHT</b>
        </div>
        <p className="mlBody">ติ๊กเส้นทางที่ต้องการทดสอบได้พร้อมกัน ตัวที่ยังไม่ยืนยัน OAuth/Runner/Certificate จะไม่ถูกสั่งงานหรือแสดงว่าออนไลน์ปลอม</p>
        <div className="mlSelector">
          {maopChoices.map((item) => <label className={item.enabled ? "mlChoice" : "mlChoice mlChoiceLocked"} key={item.id}>
            <input type="checkbox" disabled={!item.enabled || Boolean(busy)}
              checked={selectedChoices.includes(item.id)}
              onChange={(event) => setSelectedChoices((prev) => event.target.checked
                ? [...prev, item.id] : prev.filter((id) => id !== item.id))} />
            <span><strong>{item.title}</strong><small>{item.note}</small></span>
          </label>)}
        </div>
        <button className="mlRuby" disabled={Boolean(busy) || selectedChoices.length === 0}
          onClick={() => void inspectSelectedChoices()}>
          {busy === "selected-providers" ? "CHECKING…" : "Inspect selected routes"}
        </button>
      </section>

      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>CORE</span>
            <h2>Run lifecycle scenarios</h2>
          </div>
        </div>
        <div className="mlButtons">
          {scenarios.map(([scenario, label]) => <button
            key={scenario}
            disabled={Boolean(busy)}
            onClick={() => void runCore(scenario)}
          >{busy === scenario ? "RUNNING…" : label}</button>)}
        </div>
      </section>

      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>LIVE BRIDGE</span>
            <h2>GitHub file READ</h2>
          </div>
          <b>READ ONLY</b>
        </div>
        <p className="mlBody">เส้นทางจริง: MA-OP bridge → Yellow → GitHub safe read → canonical evidence</p>
        <div className="mlInputRow">
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="package.json" />
          <button disabled={Boolean(busy)} onClick={() => void runGithub()}>{busy === "github" ? "RUNNING…" : "Run live READ"}</button>
        </div>
      </section>

      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>VERIFY</span>
            <h2>Ruby Stone</h2>
          </div>
        </div>
        <p className="mlBody">รัน scorecard จริงของระบบโดยไม่บันทึก evaluation เพิ่ม</p>
        <button className="mlRuby" disabled={Boolean(busy)} onClick={() => void runRuby()}>{busy === "ruby" ? "RUNNING…" : "Run Ruby scorecard"}</button>
      </section>

      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>LEGACY SOURCE</span>
            <h2>n8n migration inventory</h2>
          </div>
          <b>READ ONLY</b>
        </div>
        <p className="mlBody">อ่าน workflow metadata จาก n8n Cloud เก่าเพื่อย้ายต่อโดยไม่สร้างใหม่จากศูนย์ และไม่ดึง credential secrets ออกมา</p>
        <button className="mlRuby" disabled={Boolean(busy)} onClick={() => void inspectLegacyN8n()}>{busy === "n8n" ? "READING…" : "Inspect old n8n"}</button>
      </section>


      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>MIGRATION MAP</span>
            <h2>Recovered modules → MA-OP categories</h2>
          </div>
          <b>NO SECRETS</b>
        </div>
        <p className="mlBody">ดูการแยก CORE · AI · DOMAIN · CONNECTORS · GOVERNANCE · SECRETS · DELIVERY · DEMO ก่อน import เข้า self-host</p>
        <div className="mlButtons">
          <button disabled={Boolean(busy)} onClick={() => void inspectN8nCatalog()}>{busy === "n8n-catalog" ? "READING…" : "Open category map"}</button>
          <button disabled={Boolean(busy)} onClick={() => void inspectN8nPlacement()}>{busy === "n8n-placement" ? "READING…" : "OGE placement"}</button>
          <button disabled={Boolean(busy)} onClick={() => void inspectN8nSelfHost()}>{busy === "n8n-selfhost" ? "CHECKING…" : "Check self-host"}</button>
        </div>
      </section>


      <section className="mlCard">
        <div className="mlCardHead">
          <div>
            <span>ITEM TEST FIELD</span>
            <h2>Capability Card Stone</h2>
          </div>
          <b>CCS/1.0</b>
        </div>
        <p className="mlBody">สนามเสียบการ์ดจำลอง: Card → Stone → Yellow policy → Ruby evidence โดยไม่เปิดของหลังการ์ดให้หน้าเว็บเห็น</p>
        <div className="mlButtons">
          <button disabled={Boolean(busy)} onClick={() => void runCcsCardDemo()}>
            {busy === "ccs-demo" ? "INSERTING…" : "Insert test card"}
          </button>
          <button disabled={Boolean(busy)} onClick={() => void runCcsLeaseDemo()}>
            {busy === "ccs-lease" ? "LEASING…" : "Simulate lease"}
          </button>
          <button disabled={Boolean(busy)} onClick={() => void ccsEnvelope("VERIFIED", "REVOKE").then(setResult)}>
            Revoke card
          </button>
        </div>
      </section>

      <ResultCard title={title} value={result} />

      <footer className="mlFooter">
        <span>NO MAIN · NO PROD · NO CANDY · NO SCHEMA CHANGE</span>
        <a href="/chat">CHAT</a>
        <a href="/command">COMMAND</a>
      </footer>
    </div>
  </main>;
}
