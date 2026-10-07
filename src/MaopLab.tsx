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
    const candidate = value?.result?.lifecycle ?? value?.first?.lifecycle ?? value?.tests?.map?.((row: Json) => row.test_id);
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

export default function MaopLab() {
  const [status, setStatus] = useState<Json | null>(null);
  const [result, setResult] = useState<Json | null>(null);
  const [title, setTitle] = useState("First Impression");
  const [busy, setBusy] = useState("");
  const [path, setPath] = useState("package.json");
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
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
          <button disabled={Boolean(busy)} onClick={() => void inspectN8nSelfHost()}>{busy === "n8n-selfhost" ? "CHECKING…" : "Check self-host"}</button>
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
