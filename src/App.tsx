import { useEffect, useState } from "react";

type Health = {
  ok: boolean;
  phase: string;
  runtime: string;
  database: "BOUND" | "UNBOUND";
  providers: number;
};

const modules = [
  "Control Plane",
  "Providers",
  "Projects",
  "Tasks",
  "Workflows",
  "Knowledge",
  "Deployments",
  "Audit",
];

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">OGENIC CORE</p>
          <h1>Phase VI</h1>
          <p className="subtitle">One toolkit · Cloudflare main runtime · D1 canonical state</p>
        </div>
        <div className={`status ${health?.ok ? "good" : "pending"}`}>
          {health?.ok ? "SYSTEM ONLINE" : error ? "CONFIG REQUIRED" : "CHECKING"}
        </div>
      </header>

      <section className="metrics">
        <article><span>Runtime</span><strong>{health?.runtime ?? "Cloudflare"}</strong></article>
        <article><span>Database</span><strong>{health?.database ?? "UNBOUND"}</strong></article>
        <article><span>Providers</span><strong>{health?.providers ?? "—"}</strong></article>
        <article><span>Toolkit</span><strong>1</strong></article>
      </section>

      <section className="grid">
        {modules.map((module) => (
          <article className="card" key={module}>
            <div className="dot" />
            <h2>{module}</h2>
            <p>Routed through OGENIC Phase VI capability registry.</p>
          </article>
        ))}
      </section>

      <footer>
        Secrets stay outside the app. Provider credentials resolve by reference through Infisical or the provider OAuth surface.
      </footer>
    </main>
  );
}
