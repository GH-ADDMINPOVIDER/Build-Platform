import { useEffect, useRef, useState } from "react";
import "./stone-circuit-diagram.css";

/**
 * OGENIC seven-stone architecture motion board (visual model only).
 * This is not a runtime monitor or a new execution/authorization service.
 * Exact names, colors and responsibility boundaries follow OGENIC_STONES_CANONICAL.
 */
type Stone = {
  id: string;
  number: string;
  name: string;
  role: string;
  species: string;
  description: string;
  color: string;
  x: number;
  y: number;
};

const stones: Stone[] = [
  { id: "green", number: "01", name: "GREEN STONE", role: "1LSS · ONE-LINE SESSION", species: "Emerald", description: "ความจำหลัก D1 และบริบทข้าม Session", color: "#16A34A", x: 195, y: 297 },
  { id: "yellow", number: "02", name: "YELLOW STONE", role: "TOOLS · API / MCP / SDK", species: "Citrine", description: "เครื่องมือและ Adapter เท่านั้น · Owner เป็นผู้ตัดสินใจ", color: "#EAB308", x: 575, y: 297 },
  { id: "blue", number: "03", name: "BLUE DIAMOND", role: "AGENTS · READINESS", species: "Blue diamond", description: "ทะเบียน Agent ตัวตนและความพร้อม", color: "#3B82F6", x: 955, y: 297 },
  { id: "violet", number: "04", name: "VIOLET STONE", role: "MULTI-AGENT SOLUTION", species: "Amethyst", description: "จัดทีม แบ่งงาน รันขนาน รวมผล", color: "#8B5CF6", x: 195, y: 518 },
  { id: "ruby", number: "05", name: "RUBY STONE", role: "VERIFICATION · PROOF", species: "Ruby", description: "ตรวจผลและหลักฐานก่อนเก็บเข้า Green", color: "#DC2626", x: 955, y: 518 },
  { id: "runner", number: "06", name: "STONE RUNNER", role: "EPHEMERAL RUNTIME", species: "Obsidian", description: "งาน Build / Test / Workerd / Codex ตามสิทธิ์", color: "#111113", x: 575, y: 518 },
  { id: "rule", number: "07", name: "RULE STONE", role: "CENTRAL RULE TAXONOMY", species: "Gray agate", description: "กฎกลางหนึ่งชุด · Yellow ไม่ใช่ผู้มีอำนาจอนุมัติ", color: "#6B7280", x: 575, y: 733 },
];

const athena = {
  name: "WHITE DIAMOND — ATHENA",
  role: "BRAIN · INTENT & COMMAND",
  description: "วางแผนและจัดเส้นทาง Outside the Seven",
};

type Trace = { id: string; d: string; color: string; title: string; duration: number; delay: number };
const traces: Trace[] = [
  { id: "intent", d: "M575 145 V239", color: "#F5F7FA", title: "ATHENA → YELLOW: command admission", duration: 3.4, delay: 0 },
  { id: "context", d: "M495 105 H195 V239", color: "#16A34A", title: "ATHENA ↔ GREEN: context / 1LSS", duration: 5.7, delay: .3 },
  { id: "agents", d: "M655 105 H955 V239", color: "#3B82F6", title: "ATHENA → BLUE: agent registry", duration: 5.2, delay: .9 },
  { id: "team", d: "M955 356 V422 H195 V458", color: "#8B5CF6", title: "BLUE → VIOLET: team coordination", duration: 7.1, delay: 1.4 },
  { id: "execute", d: "M575 356 V456", color: "#EAB308", title: "YELLOW → RUNNER: guarded execution", duration: 3.8, delay: .7 },
  { id: "delegate", d: "M335 518 H435", color: "#8B5CF6", title: "VIOLET → RUNNER: task handoff", duration: 3.7, delay: 1.5 },
  { id: "verify", d: "M715 518 H815", color: "#DC2626", title: "RUNNER → RUBY: verification", duration: 3.7, delay: 2.0 },
  { id: "retain", d: "M955 578 V638 H84 V297 H55", color: "#16A34A", title: "RUBY → GREEN: verified evidence", duration: 9.2, delay: 1.7 },
  { id: "rule", d: "M575 678 V616 H775 V297 H715", color: "#6B7280", title: "RULE → YELLOW: canonical policy", duration: 7.5, delay: 2.2 },
];

function Gem({ stone, small = false }: { stone: Stone; small?: boolean }) {
  const id = "gemstone-" + stone.id + (small ? "-small" : "-board");
  return <svg className={"scGem" + (small ? " scGemSmall" : "")} viewBox="0 0 72 76" role="img" aria-label={stone.species + " gemstone icon"}>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".86" />
        <stop offset=".36" stopColor={stone.color} stopOpacity=".95" />
        <stop offset="1" stopColor={stone.color} stopOpacity=".52" />
      </linearGradient>
    </defs>
    {stone.id === "runner"
      ? <><path d="M34 5 61 18 64 52 36 71 9 54 7 22Z" fill="#15181a" stroke="#d1d7d9" strokeOpacity=".75" strokeWidth="1.6"/><path d="M34 5 36 71 7 22 64 52 61 18 9 54Z" fill="none" stroke="#999ba3" strokeOpacity=".48"/></>
      : stone.id === "rule"
        ? <><ellipse cx="36" cy="39" rx="29" ry="32" fill={"url(#" + id + ")"} stroke="#dbe2e9" strokeWidth="1.1" /><path d="M9 34 Q28 15 61 30 M9 43 Q28 27 62 41 M12 53 Q33 39 58 51" fill="none" stroke="#f7f8f9" strokeOpacity=".7" strokeWidth="2"/></>
        : <><path d="M36 4 57 13 69 34 58 56 36 73 13 56 3 34 15 13Z" fill={"url(#" + id + ")"} stroke="#ffffff" strokeOpacity=".8" strokeWidth="1.4"/><path d="M36 4 36 73 M15 13 36 30 57 13 M3 34 36 30 69 34 M13 56 36 30 58 56" stroke="#fff" strokeOpacity=".48" strokeWidth="1.1" fill="none"/></>}
    <circle cx="30" cy="23" r="6" fill="#ffffff" opacity=".46"/>
  </svg>;
}

function CircuitStone({ stone, selected, onSelect }: { stone: Stone; selected: boolean; onSelect: (id: string) => void }) {
  const boxW = 290, boxH = 112, x = stone.x - boxW / 2, y = stone.y - boxH / 2;
  return <g className={"scCircuitNode" + (selected ? " selected" : "")} role="button" tabIndex={0}
    aria-label={stone.number + " " + stone.name + ": " + stone.description}
    onClick={() => onSelect(stone.id)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(stone.id); } }}
    style={{ cursor: "pointer" }}>
    <rect x={x} y={y} width={boxW} height={boxH} rx="19" fill="#121e1c" stroke={stone.color} strokeOpacity={selected ? 1 : .55} strokeWidth={selected ? 2.5 : 1.3}/>
    <rect x={x+6} y={y+7} width="6" height={boxH-14} rx="3" fill={stone.color} opacity=".95"/>
    <svg x={x+17} y={y+14} width="67" height="75" viewBox="0 0 72 76">
      <Gem stone={stone}/>
    </svg>
    <text x={x+92} y={y+25} fill="#b6c9bd" fontSize="11" fontWeight="800" letterSpacing="1.2">{stone.number} · {stone.species.toUpperCase()}</text>
    <text x={x+92} y={y+51} fill="#f5faf6" fontSize="17" fontWeight="900">{stone.name}</text>
    <text x={x+92} y={y+73} fill={stone.color === "#111113" ? "#abb2ba" : stone.color} fontSize="10" fontWeight="800">{stone.role}</text>
    <text x={x+92} y={y+92} fill="#b0bfb7" fontSize="9.5">{stone.id === "runner" ? "ONE SELF-HOSTED RUNNER" : "CAPABILITY / FUNCTION"}</text>
  </g>;
}

export default function StoneCircuitDiagram() {
  const circuitRef = useRef<SVGSVGElement>(null);
  const [playing, setPlaying] = useState(true);
  const [selected, setSelected] = useState("yellow");
  const [speed, setSpeed] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const activeStone = stones.find((s) => s.id === selected) ?? stones[1];

  useEffect(() => {
    if (playing) circuitRef.current?.unpauseAnimations?.();
    else circuitRef.current?.pauseAnimations?.();
  }, [playing]);

  function reset() {
    circuitRef.current?.setCurrentTime?.(0);
    circuitRef.current?.pauseAnimations?.();
    setPlaying(false);
    setSelected("yellow");
  }
  function step() {
    circuitRef.current?.pauseAnimations?.();
    const time = circuitRef.current?.getCurrentTime?.() ?? 0;
    circuitRef.current?.setCurrentTime?.(time + .65);
    setPlaying(false);
  }

  return <section className="scRoot" aria-label="Animated OGENIC seven-stone circuit" data-playing={playing}>
    <header className="scHeader">
      <div><span className="scEyebrow">Unifiend · STONE CIRCUIT v1 · ARCHITECTURE MODEL</span>
        <h3>One context. Seven stones. One command brain.</h3>
        <p>สัญญาณวิ่งจำลองทิศทางงานระหว่าง ATHENA, หินทั้ง 7 และ Ocian-S-Host · ไม่ใช่คำสั่งจริงหรือ Live proof</p>
      </div>
      <div className="scLiveChip"><i aria-hidden="true"/> VISUAL SIMULATION</div>
    </header>

    <div className="scControls" role="group" aria-label="Circuit animation controls">
      <button type="button" onClick={() => setPlaying(true)} aria-pressed={playing}>▶ Run</button>
      <button type="button" onClick={() => setPlaying(false)} aria-pressed={!playing}>Ⅱ Pause</button>
      <button type="button" onClick={step}>⇥ Step</button>
      <button type="button" onClick={reset}>↻ Reset</button>
      <label className="scSpeed">Speed <select value={speed} onChange={(e) => { const value = Number(e.target.value); setSpeed(value); if(circuitRef.current) circuitRef.current.setCurrentTime?.(0); }}>
        <option value={.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option>
      </select></label>
    </div>

    <div className="scBoardScroll">
      <svg ref={circuitRef} className="scBoard" viewBox="0 0 1150 815" role="img"
        aria-label="Animated seven-stone Unifiend architecture. White Diamond ATHENA routes intent to Yellow Stone. Seven official stones linked by animated signals.">
        <defs>
          <pattern id="scDots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#536d61" opacity=".23"/></pattern>
          <filter id="scGlow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="scWhite" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffffff"/><stop offset="1" stopColor="#8697a6"/></linearGradient>
        </defs>
        <rect x="0" y="0" width="1150" height="815" fill="#09130f"/>
        <rect x="0" y="0" width="1150" height="815" fill="url(#scDots)"/>
        <rect x="34" y="20" width="1082" height="785" rx="25" fill="none" stroke="#779486" strokeOpacity=".27"/>
        <text x="55" y="47" fill="#83a092" fontSize="11" fontWeight="800" letterSpacing="2">OGENIC · VERIFIED ARCHITECTURE NAMES / SIMULATED SIGNALS</text>

        {traces.map((trace) => <g key={trace.id}>
          <path d={trace.d} fill="none" stroke="#2d4940" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity=".28"/>
          <path className="scTrace" d={trace.d} fill="none" stroke={trace.color}
            strokeOpacity=".47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 9"/>
          <circle r="5.5" fill={trace.color} filter="url(#scGlow)" stroke="#ffffff" strokeOpacity=".75" strokeWidth=".9">
            <animateMotion path={trace.d} begin={String(trace.delay) + "s"}
              dur={String(trace.duration / speed) + "s"} repeatCount="indefinite" calcMode="linear"/>
          </circle>
        </g>)}

        <g aria-label={athena.name}>
          <rect x="413" y="60" width="324" height="88" rx="21" fill="#1a2424" stroke="#c7dbdf" strokeOpacity=".82" strokeWidth="1.8"/>
          <path d="M459 74 L483 96 L459 133 L434 96Z" fill="url(#scWhite)" stroke="#fff" strokeWidth="1"/>
          <text x="506" y="87" fill="#b0d3c5" fontSize="10.5" fontWeight="800" letterSpacing="1.2">COMMAND · OUTSIDE THE SEVEN</text>
          <text x="506" y="112" fill="#f4f7f8" fontSize="16" fontWeight="900">WHITE DIAMOND</text>
          <text x="506" y="130" fill="#d5e5e5" fontSize="11" fontWeight="800">ATHENA · BRAIN / INTENT</text>
        </g>
        {stones.map((stone) => <CircuitStone key={stone.id} stone={stone} selected={stone.id === selected} onSelect={setSelected}/>)}
        <text x="58" y="780" fill="#78958a" fontSize="10" fontWeight="750">SIGNAL = ARCHITECTURAL FLOW, NOT AN E2E EXECUTION RECEIPT</text>
      </svg>
    </div>

    <div className="scMobileRail" aria-label="Seven canonical stones on mobile">
      <div className="scMobileAthena"><b>◇ WHITE DIAMOND · ATHENA</b><span>COMMAND BRAIN · OUTSIDE THE SEVEN</span></div>
      {stones.map((stone) => <button type="button" key={stone.id}
        className={"scMobileStone" + (selected === stone.id ? " selected" : "")}
        onClick={() => { setSelected(stone.id); setShowDetails(true); }}
        style={{ borderInlineStartColor: stone.color }}>
        <Gem stone={stone} small/>
        <span><small>{stone.number} · {stone.species}</small><b>{stone.name}</b><em>{stone.role}</em></span>
        <i className="scMobileSignal" style={{ background:stone.color }} aria-hidden="true" />
      </button>)}
    </div>

    {/* Terminal is one special execution environment, not an eighth stone and not an Agent Registry entry. */}
    <section className="scTerminalEnvironment" data-execution-mode="solo" data-max-active-commands="1" aria-label="Terminal Solo environment: SSH, IDEs and OpenCode">
      <div className="scTerminalHeading">
        <div><small>ONE SPECIAL ENVIRONMENT · EXISTING Ocian-S-Host</small>
          <h4>TERMINAL ENVIRONMENT · SOLO</h4>
          <p>หนึ่ง Session / หนึ่งคำสั่งที่กำลังรัน · แยกจาก Agent Environment · รันตาม Owner Authorization ผ่าน Tools Stone</p>
        </div>
        <span className="scTerminalFlag">SOLO · NOT MULTI-AGENT · SEPARATE FROM AGENT REGISTRY</span>
      </div>
      <div className="scTerminalTools" role="list" aria-label="Three Terminal components">
        <div className="scTerminalTool" role="listitem">
          <span aria-hidden="true" className="scTerminalGlyph">⌁</span>
          <div><strong>SSH</strong><small>ACCESS / TRANSPORT</small><p>เข้าถึง Host ภายใต้สิทธิ์ที่ได้รับ</p></div>
        </div>
        <div className="scTerminalTool" role="listitem">
          <span aria-hidden="true" className="scTerminalGlyph">⌘</span>
          <div><strong>IDEs</strong><small>EDITOR / DEBUGGER</small><p>กลุ่มพัฒนา · ล่าสุดพบ Vim บน Host แต่ยังไม่พบ Web IDE</p></div>
        </div>
        <div className="scTerminalTool" role="listitem">
          <span aria-hidden="true" className="scTerminalGlyph">◇</span>
          <div><strong>OPC · OpenCode</strong><small>TERMINAL CODING AGENT · SOLO</small><p>Adapter reserved · CLI ยังไม่ได้ติดตั้ง · รอขยาย RAM ก่อนเริ่มใช้งาน</p></div>
        </div>
      </div>
      <p className="scTerminalBoundary"><b>Execution boundary:</b> OWNER (Signed Session) → ATHENA → YELLOW STONE (TOOLS ONLY) → Ocian-S-Host → TERMINAL [SSH | IDEs | OPC] → RUBY PROOF → GREEN 1LSS. Blue/Violet จัดการ Agent Environment ทั่วไป แต่ OPC อยู่ Terminal Solo Block นี้เท่านั้น · ไม่ส่งคำสั่งพร้อมกันหลาย Executor</p>
    </section>

    <footer className="scFooter">
      <div><small>SELECTED COMPONENT</small><strong>{activeStone.number} · {activeStone.name}</strong>
        <p>{activeStone.description}</p></div>
      <button type="button" className="scDetailsToggle" onClick={() => setShowDetails((x) => !x)}
        aria-expanded={showDetails}>{showDetails ? "Hide flow notes −" : "Flow details +"}</button>
      {showDetails && <div className="scFlowNotes">
        <p>ATHENA = วางแผน · YELLOW = Tools/API/MCP/SDK ไม่ใช่ผู้อนุมัติ · BLUE = Agent Registry · VIOLET = จัดทีม · RUNNER = รันงาน · RUBY = ตรวจหลักฐาน · GREEN = บันทึกบริบท · RULE = กฎกลาง</p>
        <p>Ocian-S-Host เป็นเครื่อง Self-hosted เพียงเครื่องเดียวที่ตรวจพบ; GitHub Account 2 ไม่ใช่ Runner-2 Host. สายสัญญาณเป็นผังอธิบาย ไม่ยืนยันความพร้อม Runtime ทุกช่องทาง</p>
        <p>Terminal Environment เป็นบล็อกพิเศษเดียว: SSH = Access, IDEs = Editor/Debugger, OpenCode/OPC = Terminal Solo Coding Agent (ยังไม่ได้ติดตั้ง). IDE ล่าสุดมี Vim แต่ Web IDE ยังไม่ยืนยัน ไม่จัด OPC เป็น Blue/Violet Agent ทั่วไป เรียก Tools Stone ตามขอบเขต Owner และต้องใช้ Serial Queue สำหรับคำสั่งจริง</p>
      </div>}
    </footer>
  </section>;
}
