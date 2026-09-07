import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Health = {
  ok: boolean;
  phase?: string;
  runtime?: string;
  database?: string;
  providers?: number;
  shared_state?: string;
};

type PoolSnapshot = {
  id: "standard" | "high_volume" | string;
  label: string;
  used: number;
  cap: number | null;
  remaining: number | null;
  percent: number | null;
  state: "NORMAL" | "WATCH" | "THROTTLE" | "CRITICAL" | "EXHAUSTED";
  telemetry: string;
};

type IncentiveSnapshot = {
  ok: true;
  enabled: boolean;
  usage_tier: number | null;
  policy_state: "ACTIVE" | "DISABLED" | "EXHAUSTED";
  reset_at: string;
  pools: PoolSnapshot[];
};

type ChatMode = "fast" | "balanced" | "power";

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  text: string;
  meta?: string;
};

type ChatResponse = {
  ok?: boolean;
  text?: string;
  model?: string;
  mode?: string;
  incentive_pool?: string;
  fallback_reason?: string | null;
  code?: string;
  message?: string;
};

const modelCards = [
  { id: "luna", name: "Luna", mode: "fast" as const, pool: "high_volume", glyph: "◉", tone: "luna" },
  { id: "terra", name: "Terra", mode: "balanced" as const, pool: "high_volume", glyph: "◆", tone: "terra" },
  { id: "sol", name: "Sol", mode: "power" as const, pool: "standard", glyph: "☀", tone: "sol" },
  { id: "codex", name: "Codex", pool: "standard", glyph: "</>", tone: "codex" },
  { id: "claude", name: "Claude", pool: null, glyph: "✺", tone: "claude" },
] as const;

const defaultMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "สวัสดีครับ! ผมคือ OGENIC AI พร้อมช่วยคุณคิด วิเคราะห์ และลงมือทำ วันนี้ให้ช่วยอะไรดีครับ?",
    meta: "OGENIC AI · ready",
  },
];

function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function compact(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [opsKey, setOpsKey] = useState("");
  const [accessInput, setAccessInput] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const [accessState, setAccessState] = useState<"locked" | "checking" | "ready" | "error">("locked");
  const [snapshot, setSnapshot] = useState<IncentiveSnapshot | null>(null);
  const [mode, setMode] = useState<ChatMode>("balanced");
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatStatus, setChatStatus] = useState("Terra · balanced");
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setHealth(await response.json() as Health);
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  const loadIncentives = useCallback(async (key: string) => {
    const response = await fetch("/api/ops/incentives", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const next = await response.json() as IncentiveSnapshot;
    setSnapshot(next);
    return next;
  }, []);

  useEffect(() => {
    void loadHealth();
    const saved = sessionStorage.getItem("ogenic_ops_key")?.trim() ?? "";
    if (saved) {
      setOpsKey(saved);
      setAccessInput(saved);
      setAccessState("checking");
      void loadIncentives(saved)
        .then(() => setAccessState("ready"))
        .catch(() => {
          sessionStorage.removeItem("ogenic_ops_key");
          setOpsKey("");
          setAccessInput("");
          setAccessState("locked");
        });
    }
  }, [loadHealth, loadIncentives]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending]);

  const pools = useMemo(
    () => new Map((snapshot?.pools ?? []).map((pool) => [pool.id, pool])),
    [snapshot],
  );

  const unlock = async () => {
    const key = accessInput.trim();
    if (!key) return;
    setAccessState("checking");
    try {
      await loadIncentives(key);
      sessionStorage.setItem("ogenic_ops_key", key);
      setOpsKey(key);
      setAccessState("ready");
      setShowAccess(false);
      setChatStatus("GM Ops unlocked · ready to chat");
    } catch {
      setAccessState("error");
    }
  };

  const lock = () => {
    sessionStorage.removeItem("ogenic_ops_key");
    setOpsKey("");
    setAccessInput("");
    setSnapshot(null);
    setAccessState("locked");
    setChatStatus("Ops locked");
  };

  const sendMessage = async () => {
    const prompt = draft.trim();
    if (!prompt || sending) return;
    if (!opsKey) {
      setShowAccess(true);
      setChatStatus("Unlock Ops once to enable live AI chat");
      return;
    }

    const userMessage: ChatMessage = {
      id: `u_${crypto.randomUUID()}`,
      role: "user",
      text: prompt,
      meta: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setSending(true);
    setChatStatus(`${mode.toUpperCase()} · thinking…`);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opsKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `ui_${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ prompt, mode }),
      });
      const body = await response.json().catch(() => ({})) as ChatResponse;
      if (!response.ok || !body.ok || !body.text) {
        throw new Error(body.message || body.code || `${response.status} ${response.statusText}`);
      }
      setMessages((current) => [
        ...current,
        {
          id: `a_${crypto.randomUUID()}`,
          role: "assistant",
          text: body.text!,
          meta: `${body.model ?? "OGENIC AI"}${body.incentive_pool ? ` · ${body.incentive_pool}` : ""}`,
        },
      ]);
      setChatStatus(`${body.model ?? "OGENIC AI"} · ready`);
      void loadIncentives(opsKey).catch(() => undefined);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `e_${crypto.randomUUID()}`,
          role: "system",
          text: `ส่งไม่สำเร็จ: ${(error as Error).message}`,
          meta: "Runtime",
        },
      ]);
      setChatStatus("Runtime needs attention");
    } finally {
      setSending(false);
    }
  };

  const chooseMode = (next: ChatMode) => {
    setMode(next);
    setChatStatus(`${next === "fast" ? "Luna" : next === "power" ? "Sol" : "Terra"} · ${next}`);
  };

  const scrollToChat = () => document.getElementById("ogenic-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="siteShell">
      <nav className="topNav">
        <div className="brandLockup">
          <span className="brandMark" aria-hidden="true"><i /></span>
          <span><strong>OGENIC CORE</strong><small>AUTOMATE A HIGHER TOMORROW</small></span>
        </div>
        <div className="navActions">
          <button className={`startButton ${accessState === "ready" ? "ready" : ""}`} onClick={() => setShowAccess((value) => !value)}>
            {accessState === "ready" ? "OPS READY" : "เริ่มใช้งาน"}
          </button>
          <button className="menuButton" aria-label="Menu"><span /><span /><span /></button>
        </div>
      </nav>

      {showAccess && (
        <section className="accessBar" aria-label="Protected access">
          <div>
            <p>PROTECTED OPS SESSION</p>
            <strong>Unlock once for live AI + GM metering</strong>
          </div>
          <div className="accessControls">
            <input
              type="password"
              value={accessInput}
              onChange={(event) => setAccessInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }}
              placeholder="OGENIC_OPS_KEY"
              autoComplete="off"
            />
            <button onClick={() => void unlock()} disabled={accessState === "checking"}>{accessState === "checking" ? "Checking…" : "Unlock"}</button>
            {accessState === "ready" && <button className="quietButton" onClick={lock}>Lock</button>}
          </div>
          {accessState === "error" && <small>Key ไม่ผ่าน หรือ Worker binding ยังไม่พร้อม</small>}
        </section>
      )}

      <section className="heroStage">
        <div className="heroGlow" aria-hidden="true" />
        <div className="heroPill"><span />AI-POWERED BUSINESS OPERATING SYSTEM</div>
        <h1>OGENIC AI — <em>CHAT</em></h1>
        <h2>แชท • สร้างเวิร์กโฟลว์ • ใช้เครื่องมือธุรกิจ ครบจบในที่เดียว</h2>
        <p>ผสานพลังของ AI, Automation และ Business Tools เพื่อให้คุณทำงานได้เร็วขึ้น ฉลาดขึ้น และไปได้ไกลกว่าเดิม</p>
        <div className="heroButtons">
          <button className="heroPrimary" onClick={scrollToChat}>เริ่มสัมผัส OGENIC AI <span>→</span></button>
          <button className="heroSecondary" onClick={scrollToChat}><span>▶</span> ดูตัวอย่าง</button>
        </div>
      </section>

      <section className="chatCard" id="ogenic-chat">
        <header className="chatHeader">
          <div className="chatIdentity">
            <span className="miniMark"><i /></span>
            <div><strong>OGENIC AI — CHAT</strong><small>YOUR AI TEAM, ALWAYS ON.</small></div>
          </div>
          <span className={`gmBadge ${snapshot?.policy_state === "ACTIVE" ? "on" : ""}`}><b>ϟ</b> GM BUFF <i /></span>
        </header>

        <div className="chatStream">
          {messages.map((message) => (
            <div className={`messageRow ${message.role}`} key={message.id}>
              {message.role === "assistant" && <span className="avatarMark"><i /></span>}
              <div className="messageWrap">
                <div className="bubble">{message.text}</div>
                {message.meta && <small>{message.meta}</small>}
              </div>
              {message.role === "user" && <span className="userAvatar">●</span>}
            </div>
          ))}
          {sending && (
            <div className="messageRow assistant">
              <span className="avatarMark"><i /></span>
              <div className="typingBubble"><span /><span /><span /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="composer">
          <button className="attachButton" aria-label="Attach">⌕</button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="พิมพ์คำสั่งงานที่นี่…"
            rows={1}
          />
          <button className="sendButton" onClick={() => void sendMessage()} disabled={!draft.trim() || sending} aria-label="Send">➤</button>
        </div>
        <div className="composerHint"><span>✦</span>{chatStatus} · Enter ส่ง / Shift+Enter ขึ้นบรรทัดใหม่</div>
      </section>

      <section className="modelStrip" aria-label="Model and limit meters">
        {modelCards.map((card) => {
          const pool = card.pool ? pools.get(card.pool) : undefined;
          const percent = clampPercent(pool?.percent);
          const interactive = "mode" in card;
          const active = interactive && card.mode === mode;
          return (
            <button
              key={card.id}
              className={`modelCard ${card.tone} ${active ? "selected" : ""}`}
              onClick={() => interactive && chooseMode(card.mode)}
              disabled={!interactive}
              type="button"
            >
              <div className="modelTop"><span className="modelGlyph">{card.glyph}</span><strong>{card.name}</strong><small>{card.pool ? (snapshot ? `${percent.toFixed(1)}%` : "LOCK") : "REVIEW"}</small></div>
              <div className="tinyMeter"><span style={{ width: card.pool && snapshot ? `${Math.max(3, percent)}%` : "18%" }} /></div>
              <div className="modelMeta">{pool ? `${compact(pool.remaining)} left` : card.id === "claude" ? "review lane" : "builder lane"}</div>
            </button>
          );
        })}
      </section>

      <section className="statusGrid">
        <article><span className="statusIcon">⌘</span><div><strong>Workflow Engine</strong><small>Phase VI · ACTIVE</small></div><i className="liveDot" /></article>
        <article><span className="statusIcon">◎</span><div><strong>Agent Fabric</strong><small>4 execution lanes</small></div><i className="liveDot" /></article>
        <article><span className="statusIcon">⌁</span><div><strong>API Health</strong><small>{health?.ok ? "ONLINE" : "CHECKING"}</small></div><i className={`liveDot ${health?.ok ? "" : "dim"}`} /></article>
        <article><span className="statusIcon">♛</span><div><strong>Usage Tier {snapshot?.usage_tier ?? 1}</strong><small>{snapshot?.policy_state ?? "GM policy"}</small></div></article>
      </section>

      <details className="systemDetails">
        <summary>System console</summary>
        <div className="detailGrid">
          <div><span>Runtime</span><strong>{health?.runtime ?? "Cloudflare"}</strong></div>
          <div><span>Shared state</span><strong>{health?.shared_state ?? health?.database ?? "D1"}</strong></div>
          <div><span>GM policy</span><strong>{snapshot?.policy_state ?? "LOCKED"}</strong></div>
          <div><span>Session</span><strong>{accessState.toUpperCase()}</strong></div>
        </div>
      </details>

      <footer className="brandFooter">
        <strong>UNIFIED. INTELLIGENT. YOURS.</strong>
        <span>ทุกเครื่องมือที่คุณต้องการ เพื่อธุรกิจที่ก้าวไกลกว่า</span>
      </footer>
    </main>
  );
}
