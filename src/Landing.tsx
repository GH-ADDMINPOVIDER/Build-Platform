type ModeKind = "chat" | "agent" | "tools" | "session" | "supervisor" | "deploy";
type Tone = "green" | "yellow" | "mix";

const modes: Array<{ kind: ModeKind; tone: Tone; title: string; detail: string; href: string }> = [
  { kind: "chat", tone: "green", title: "CHAT & CREATE", detail: "WAVE Chat · same session line", href: "/chat" },
  { kind: "agent", tone: "yellow", title: "AGENT RUNTIME", detail: "OpenAI Agent · execution path", href: "/chat" },
  { kind: "tools", tone: "mix", title: "TOOLS & SKILLS", detail: "SDK · Skills · Docs · Tools", href: "/overview" },
  { kind: "session", tone: "green", title: "1LSS SESSION", detail: "owner-main · one line · same mind", href: "/chat" },
  { kind: "supervisor", tone: "yellow", title: "OGENIC SUPERVISOR", detail: "route · verify · return evidence", href: "/overview" },
  { kind: "deploy", tone: "mix", title: "DEPLOY & VERIFY", detail: "self-host → Cloudflare → WAVE", href: "/overview" },
];

function StoneArt({ tone }: { tone: "green" | "yellow" }) {
  return <svg viewBox="0 0 420 420" role="img" aria-label={`${tone} WAVE system stone`}>
    <g className="stoneAura">
      <circle cx="210" cy="210" r="162" fill="none" stroke="currentColor" strokeWidth="2" opacity=".18" />
      <circle cx="210" cy="210" r="132" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".12" strokeDasharray="6 11" />
    </g>
    <g className="stoneBody">
      <polygon points="210,56 326,110 356,228 289,335 167,360 69,286 67,163 140,79" fill="currentColor" opacity=".15" />
      <polygon points="210,72 308,119 335,224 278,316 174,339 90,275 89,171 151,96" fill="none" stroke="currentColor" strokeWidth="4" opacity=".82" />
      <path d="M118 199c46-50 81-38 113-3 33 36 60 36 104-7" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" opacity=".25" />
      <path d="M118 199c46-50 81-38 113-3 33 36 60 36 104-7" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M130 235c38-35 72-29 104 1 31 28 59 29 92 4" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".74" />
      <circle cx="210" cy="210" r="16" fill="currentColor" />
      <circle cx="210" cy="210" r="32" fill="none" stroke="currentColor" strokeWidth="2" opacity=".35" />
    </g>
    <g fill="currentColor" opacity=".85">
      <circle cx="82" cy="95" r="5" />
      <circle cx="345" cy="102" r="4" />
      <circle cx="368" cy="264" r="5" />
      <circle cx="112" cy="336" r="4" />
    </g>
  </svg>;
}

function ModeArt({ kind }: { kind: ModeKind }) {
  return <svg viewBox="0 0 320 220" aria-hidden="true" focusable="false">
    {kind === "chat" && <>
      <rect x="52" y="54" width="144" height="92" rx="26" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="3" />
      <path d="M84 149l-22 25 6-34" fill="currentColor" opacity=".6" />
      <rect x="120" y="86" width="148" height="90" rx="26" fill="currentColor" opacity=".16" stroke="currentColor" strokeWidth="3" />
      <circle cx="157" cy="130" r="7" fill="currentColor" /><circle cx="190" cy="130" r="7" fill="currentColor" /><circle cx="223" cy="130" r="7" fill="currentColor" />
    </>}
    {kind === "agent" && <>
      <circle cx="160" cy="112" r="58" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="3" />
      <circle cx="160" cy="112" r="22" fill="currentColor" opacity=".6" />
      <path d="M160 32v36M160 156v36M80 112h36M204 112h36M103 55l25 25M192 144l25 25M217 55l-25 25M128 144l-25 25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="160" cy="112" r="78" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 11" opacity=".4" />
    </>}
    {kind === "tools" && <>
      <rect x="58" y="58" width="76" height="76" rx="20" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="3" />
      <rect x="186" y="58" width="76" height="76" rx="20" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="3" />
      <rect x="122" y="110" width="76" height="76" rx="20" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="3" />
      <path d="M96 96h128M160 96v52" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".85" />
      <circle cx="96" cy="96" r="9" fill="currentColor" /><circle cx="224" cy="96" r="9" fill="currentColor" /><circle cx="160" cy="148" r="9" fill="currentColor" />
    </>}
    {kind === "session" && <>
      <circle cx="160" cy="110" r="70" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <ellipse cx="160" cy="110" rx="112" ry="44" fill="none" stroke="currentColor" strokeWidth="4" />
      <ellipse cx="160" cy="110" rx="44" ry="112" fill="none" stroke="currentColor" strokeWidth="3" opacity=".55" transform="rotate(62 160 110)" />
      <circle cx="160" cy="110" r="24" fill="currentColor" opacity=".65" />
      <circle cx="258" cy="126" r="9" fill="currentColor" />
    </>}
    {kind === "supervisor" && <>
      <circle cx="160" cy="108" r="46" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="4" />
      <circle cx="160" cy="108" r="16" fill="currentColor" />
      <path d="M160 62V34M118 84L87 64M202 84l31-20M120 138l-35 28M200 138l35 28M160 154v34" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <g fill="currentColor"><circle cx="160" cy="28" r="9" /><circle cx="79" cy="59" r="9" /><circle cx="241" cy="59" r="9" /><circle cx="77" cy="172" r="9" /><circle cx="243" cy="172" r="9" /><circle cx="160" cy="195" r="9" /></g>
    </>}
    {kind === "deploy" && <>
      <circle cx="160" cy="110" r="72" fill="none" stroke="currentColor" strokeWidth="3" opacity=".36" />
      <ellipse cx="160" cy="110" rx="114" ry="42" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M80 110h160M160 38c31 26 45 50 45 72s-14 46-45 72c-31-26-45-50-45-72s14-46 45-72Z" fill="currentColor" opacity=".08" stroke="currentColor" strokeWidth="3" />
      <path d="M225 58l36 13-30 24" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </>}
  </svg>;
}

export default function Landing() {
  return <main className="olShell" id="top">
    <div className="olNebula olNebulaGreen" aria-hidden="true" />
    <div className="olNebula olNebulaYellow" aria-hidden="true" />

    <header className="olTop">
      <a className="olBrand" href="/" aria-label="WAVE home">
        <img src="/assets/wave-logo.webp" alt="" />
        <span><b>WAVE</b><small>OGENIC · GIMS STONE</small></span>
      </a>
      <nav className="olNav" aria-label="WAVE navigation">
        <a href="#top">HOME</a>
        <a href="#green-stone">GREEN STONE</a>
        <a href="#yellow-stone">YELLOW STONE</a>
        <a href="/chat">CHAT</a>
        <a href="/overview">DASHBOARD</a>
        <a href="/app">APP</a>
      </nav>
      <a className="olEnter" href="/chat">ENTER WAVE <span>→</span></a>
    </header>

    <section className="olIntro">
      <p className="olEyebrow">PHASE 2 · LIVE SYSTEM</p>
      <h1>TWO STONES.<br /><span>ONE MIND.</span></h1>
      <p>Green Stone keeps the line. Yellow Stone operates capability. WAVE is the surface. OGENIC is the head.</p>
      <div className="olStatus"><span>SELF-HOSTED RUNNER ONLINE</span><i /> <span>CLOUDFLARE DEPLOY VERIFIED</span><i /> <span>1LSS SAME MIND</span></div>
    </section>

    <section className="olStoneGrid" aria-label="WAVE system stones">
      <article className="olStonePanel green" id="green-stone">
        <a className="olStoneFrame" href="/chat" aria-label="Open Green Stone WAVE Chat">
          <StoneArt tone="green" />
        </a>
        <div className="olStoneCopy">
          <p className="olStoneIndex">01 · CONTINUITY</p>
          <h2>GREEN STONE</h2>
          <strong>1LSS · ONE-LINE SESSION</strong>
          <div className="olStoneFacts"><span>Connected chat mode</span><span>One canonical session</span><span>Same mind across Web + App</span></div>
          <a href="/chat">OPEN GREEN STONE <span>→</span></a>
        </div>
      </article>

      <article className="olStonePanel yellow" id="yellow-stone">
        <a className="olStoneFrame" href="/overview" aria-label="Open Yellow Stone WAVE Dashboard">
          <StoneArt tone="yellow" />
        </a>
        <div className="olStoneCopy">
          <p className="olStoneIndex">02 · CAPABILITY</p>
          <h2>YELLOW STONE</h2>
          <strong>TOOLS CONTROL PANEL · OPERATE CAPABILITY</strong>
          <div className="olStoneFacts"><span>Cloudflare Worker + Agent Runtime</span><span>Skills · SDK · Docs · Tools</span><span>OGENIC Supervisor · verified actions</span></div>
          <a href="/overview">OPEN YELLOW STONE <span>→</span></a>
        </div>
      </article>
    </section>

    <section className="olModes" aria-labelledby="mode-title">
      <div className="olSectionHead">
        <div><small>WAVE · OPERATE</small><h2 id="mode-title">SYSTEM MODES</h2></div>
        <p>ทุกกรอบเป็นภาพล้วน · ชื่ออยู่ใต้ภาพ · ทุกใบกดใช้งานได้</p>
      </div>
      <div className="olModeGrid">
        {modes.map((mode) => <a className={`olModeCard ${mode.tone}`} href={mode.href} key={mode.title}>
          <div className="olModeVisual"><ModeArt kind={mode.kind} /></div>
          <div className="olModeLabel"><span>{mode.title}</span><b>↗</b></div>
          <small>{mode.detail}</small>
        </a>)}
      </div>
    </section>

    <section className="olLaunch">
      <div><small>ONE CONTEXT · MANY AGENTS · VERIFIED ACTIONS</small><h2>Ready to operate.</h2></div>
      <div><a href="/chat">WAVE CHAT →</a><a href="/overview">DASHBOARD →</a><a href="/app">APP VIEW →</a></div>
    </section>

    <footer className="olFooter">WAVE · GREEN STONE · YELLOW STONE · OGENIC HARNESS · 1LSS</footer>
  </main>;
}
