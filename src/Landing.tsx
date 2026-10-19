type ModeKind = "chat" | "agent" | "tools" | "session" | "supervisor" | "deploy";
type Tone = "green" | "yellow" | "mix";

const modes: Array<{ kind: ModeKind; tone: Tone; title: string; detail: string; href: string; meta: string }> = [
  { kind: "chat", tone: "green", title: "CHAT & CREATE", detail: "Talk, build and continue from one canonical session.", href: "/chat", meta: "1LSS · LIVE" },
  { kind: "agent", tone: "yellow", title: "AGENT DECK", detail: "See real interactive Agents, hierarchy, status and evidence-backed accuracy.", href: "/agents", meta: "VIOLET · AGENTS" },
  { kind: "tools", tone: "mix", title: "TOOLS & SKILLS", detail: "Operate connected capabilities without leaving the workspace.", href: "/overview", meta: "TOOLS · OPERATE" },
  { kind: "session", tone: "green", title: "1LSS SESSION", detail: "One ordered line across web and app surfaces.", href: "/chat", meta: "CONTEXT · SYNCED" },
  { kind: "supervisor", tone: "yellow", title: "WAVE COMMAND", detail: "Send guarded natural-language commands through ATHENA and Yellow Stone.", href: "/command", meta: "COMMAND · GUARDED" },
  { kind: "deploy", tone: "mix", title: "DEPLOY & VERIFY", detail: "Runner to staging to verification in one execution path.", href: "/overview", meta: "RUNTIME · READY" },
];

const runSteps = [
  ["01", "PLAN", "complete"],
  ["02", "IMPLEMENT", "complete"],
  ["03", "TEST", "complete"],
  ["04", "DEPLOY", "approval"],
  ["05", "VERIFY", "queued"],
];

function StoneArt({ tone }: { tone: "green" | "yellow" }) {
  const id = tone === "green" ? "waveGreen" : "waveYellow";
  return <svg viewBox="0 0 360 360" role="img" aria-label={`${tone} WAVE system stone`}>
    <defs>
      <radialGradient id={`${id}Core`} cx="48%" cy="44%" r="62%">
        <stop offset="0" stopColor="#fff" stopOpacity=".96" />
        <stop offset=".18" stopColor="currentColor" stopOpacity=".92" />
        <stop offset=".62" stopColor="currentColor" stopOpacity=".24" />
        <stop offset="1" stopColor="#020806" stopOpacity=".2" />
      </radialGradient>
      <linearGradient id={`${id}Facet`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".36" />
        <stop offset=".35" stopColor="currentColor" stopOpacity=".18" />
        <stop offset="1" stopColor="#000" stopOpacity=".38" />
      </linearGradient>
      <filter id={`${id}Glow`} x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="11" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <g className="stoneOrbit" fill="none" stroke="currentColor">
      <ellipse cx="180" cy="180" rx="144" ry="54" opacity=".18" strokeWidth="1.4" />
      <ellipse cx="180" cy="180" rx="96" ry="152" opacity=".12" strokeWidth="1.2" transform="rotate(58 180 180)" />
    </g>
    <g className="stoneFloat">
      <path d="M180 41 286 91l34 102-61 100-111 30-92-70 7-119 61-72Z" fill={`url(#${id}Core)`} opacity=".86" filter={`url(#${id}Glow)`} />
      <path d="M180 41 286 91l-68 76-94-105Z" fill={`url(#${id}Facet)`} opacity=".86" />
      <path d="m286 91 34 102-102-26Z" fill={`url(#${id}Facet)`} opacity=".48" />
      <path d="m320 193-61 100-41-126Z" fill={`url(#${id}Facet)`} opacity=".65" />
      <path d="m259 293-111 30 70-156Z" fill={`url(#${id}Facet)`} opacity=".38" />
      <path d="m148 323-92-70 162-86Z" fill={`url(#${id}Facet)`} opacity=".26" />
      <path d="M56 253l7-119 155 33Z" fill={`url(#${id}Facet)`} opacity=".32" />
      <path d="M63 134l61-72 94 105Z" fill={`url(#${id}Facet)`} opacity=".58" />
      <path d="M103 195c34-35 59-28 82 0 25 30 50 29 83-7" fill="none" stroke="#fff" strokeOpacity=".72" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M118 226c29-27 55-23 78 2 20 21 43 22 67 4" fill="none" stroke="currentColor" strokeOpacity=".82" strokeWidth="3.2" strokeLinecap="round" />
    </g>
  </svg>;
}

function ModeArt({ kind }: { kind: ModeKind }) {
  return <svg viewBox="0 0 280 180" aria-hidden="true" focusable="false">
    {kind === "chat" && <><rect x="36" y="37" width="126" height="74" rx="18" /><rect x="111" y="70" width="132" height="76" rx="18" /><path d="m65 110-20 21 6-29" /><circle cx="145" cy="108" r="5" /><circle cx="169" cy="108" r="5" /><circle cx="193" cy="108" r="5" /></>}
    {kind === "agent" && <><circle cx="140" cy="90" r="42" /><circle cx="140" cy="90" r="15" /><path d="M140 22v28M140 130v28M72 90h28M180 90h28M91 42l22 22M167 116l22 22M189 42l-22 22M113 116l-22 22" /><circle cx="140" cy="90" r="64" className="dash" /></>}
    {kind === "tools" && <><rect x="45" y="44" width="62" height="62" rx="15" /><rect x="173" y="44" width="62" height="62" rx="15" /><rect x="109" y="92" width="62" height="62" rx="15" /><path d="M76 75h128M140 75v48" /><circle cx="76" cy="75" r="6" /><circle cx="204" cy="75" r="6" /><circle cx="140" cy="123" r="6" /></>}
    {kind === "session" && <><ellipse cx="140" cy="90" rx="96" ry="34" /><ellipse cx="140" cy="90" rx="34" ry="96" transform="rotate(61 140 90)" /><circle cx="140" cy="90" r="15" /><circle cx="226" cy="101" r="6" /></>}
    {kind === "supervisor" && <><circle cx="140" cy="88" r="36" /><circle cx="140" cy="88" r="11" /><path d="M140 52V27M108 67 79 50M172 67l29-17M109 112l-32 25M171 112l32 25M140 124v27" /><circle cx="140" cy="23" r="6" /><circle cx="73" cy="47" r="6" /><circle cx="207" cy="47" r="6" /><circle cx="71" cy="141" r="6" /><circle cx="209" cy="141" r="6" /><circle cx="140" cy="156" r="6" /></>}
    {kind === "deploy" && <><circle cx="140" cy="90" r="58" /><ellipse cx="140" cy="90" rx="94" ry="31" /><path d="M73 90h134M140 32c24 21 35 40 35 58s-11 37-35 58c-24-21-35-40-35-58s11-37 35-58Z" /><path d="m194 49 31 11-26 20" /></>}
  </svg>;
}

function CommandPreview() {
  return <a className="wvCommand" href="/command" aria-label="Open WAVE Command Center">
    <div className="wvCommandTop">
      <div><span className="wvDot" /><b>WAVE COMMAND</b><small>owner-main · 1LSS synced</small></div>
      <span>OPEN ↗</span>
    </div>
    <div className="wvPrompt"><small>YOU</small><p>Make the interface production-ready, deploy staging and verify every route.</p></div>
    <div className="wvSupervisor"><span>OGENIC · SUPERVISING</span><b>AUTO ROUTING</b></div>
    <div className="wvAgentRows">
      <div><i>01</i><span><b>Implementation</b><small>Codex · patch UI</small></span><em>COMPLETE</em></div>
      <div><i>02</i><span><b>Operator</b><small>Runner · deploy staging</small></span><em className="hold">APPROVAL</em></div>
      <div><i>03</i><span><b>Verifier</b><small>Browser · route checks</small></span><em>QUEUED</em></div>
    </div>
    <div className="wvRun">
      {runSteps.map(([index, label, state]) => <div className={`wvRunStep ${state}`} key={label}><i>{index}</i><span>{label}</span><b>{state === "complete" ? "✓" : state === "approval" ? "!" : "·"}</b></div>)}
    </div>
    <div className="wvToolLine"><span>TOOLS</span><i>GitHub</i><i>Cloudflare</i><i>Browser</i><i>Files</i></div>
  </a>;
}

export default function Landing() {
  return <main className="wvShell" id="top">
    <div className="wvGlow wvGlowGreen" aria-hidden="true" />
    <div className="wvGlow wvGlowGold" aria-hidden="true" />

    <header className="wvTop">
      <a className="wvBrand" href="/" aria-label="WAVE web home">
        <img src="/assets/wave-logo.webp" alt="" />
        <span><b>WAVE</b><small>HUMAN DECISION · AI EXECUTION</small></span>
      </a>
      <nav className="wvNav" aria-label="WAVE navigation">
        <a href="/">WEB</a>
        <a href="/chat">CHAT</a>
        <a href="/command">COMMAND</a>
        <a href="/agents">AGENTS</a>
        <a href="/overview">OPERATE</a>
        <a href="#stones">STONES</a>
        <a href="/app">APP</a>
      </nav>
      <a className="wvPrimary" href="/command">OPEN COMMAND <span>↗</span></a>
    </header>

    <section className="wvHero">
      <div className="wvHeroCopy">
        <div className="wvLive"><span /> SYSTEM ONLINE · SAME MIND</div>
        <h1>ONE CONTEXT.<br /><span>MANY AGENTS.</span><br />REAL ACTIONS.</h1>
        <p>WAVE is the operating surface where conversation, tools, agents, runtime and evidence stay in one continuous work record.</p>
        <div className="wvActions">
          <a className="primary" href="/chat">START IN CHAT <span>→</span></a>
          <a href="/command">OPEN COMMAND</a>
          <a href="/agents">AGENT DECK</a>
          <a href="/overview">OPERATE</a>
        </div>
        <div className="wvMiniStatus">
          <span><b>1LSS</b> ACTIVE</span><span><b>RUNNER</b> READY</span><span><b>RUNTIME</b> CLOUDFLARE</span><span><b>MODE</b> GUARDED</span>
        </div>
      </div>
      <CommandPreview />
    </section>

    <section className="wvStoneRail" id="stones" aria-label="WAVE system cores">
      <a className="wvStone green" id="green-stone" href="/chat" aria-label="Open Green Stone chat">
        <div className="wvStoneVisual"><StoneArt tone="green" /></div>
        <div className="wvStoneText"><small>01 · CONTEXT CORE</small><h2>GREEN STONE</h2><p>1LSS continuity · one canonical line · same mind.</p><span>OPEN CHAT ↗</span></div>
      </a>
      <div className="wvEnergy" aria-hidden="true"><span>INTENT</span><i /><b>WAVE</b><i /><span>EXECUTION</span></div>
      <a className="wvStone yellow" id="yellow-stone" href="/command" aria-label="Open Yellow Stone command">
        <div className="wvStoneVisual"><StoneArt tone="yellow" /></div>
        <div className="wvStoneText"><small>02 · CAPABILITY CORE</small><h2>YELLOW STONE</h2><p>Tools · policy · approval · execution · verify.</p><span>OPEN COMMAND ↗</span></div>
      </a>
    </section>

    <section className="wvModes" aria-labelledby="mode-title">
      <div className="wvSectionHead"><div><small>OPERATING SURFACES</small><h2 id="mode-title">Everything routes somewhere real.</h2></div><p>No dead controls. No decorative dashboard buttons.</p></div>
      <div className="wvModeGrid">
        {modes.map((mode) => <a className={`wvMode ${mode.tone}`} href={mode.href} key={mode.title}>
          <div className="wvModeVisual"><ModeArt kind={mode.kind} /></div>
          <div className="wvModeTop"><span>{mode.meta}</span><b>↗</b></div>
          <h3>{mode.title}</h3>
          <p>{mode.detail}</p>
        </a>)}
      </div>
    </section>

    <section className="wvDock" aria-label="WAVE quick launch">
      <div><span className="wvDot" /><b>WAVE</b><small>ONE CONTEXT · MANY AGENTS · REAL TOOLS · VERIFIED ACTIONS</small></div>
      <nav><a href="/">WEB</a><a href="/chat">CHAT</a><a href="/command">COMMAND</a><a href="/agents">AGENTS</a><a href="/overview">OPERATE</a><a href="/app">APP</a><a href="/policy.html">POLICY</a></nav>
    </section>

    <footer className="wvFooter"><span>WAVE · OGENIC STONE SYSTEM</span><span>GREEN KEEPS THE THREAD · YELLOW RUNS THE WORK · VIOLET ORCHESTRATES AGENTS</span><span><a href="/policy.html" aria-label="WAVE Evidence and Execution Policy" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "4px" }}>EVIDENCE POLICY ↗</a></span></footer>
  </main>;
}
