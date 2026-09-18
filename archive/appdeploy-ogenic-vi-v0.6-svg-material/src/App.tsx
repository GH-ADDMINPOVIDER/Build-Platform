import { useEffect, useRef, useState } from 'react';
import { api } from '@appdeploy/client';

type Message = { role: 'user' | 'assistant'; content: string };
type Tab = 'home' | 'chat' | 'tools' | 'tasks' | 'system';
type AgentId = 'ogenic' | 'code' | 'github' | 'vercel' | 'linear';
type Mood = 'idle' | 'listening' | 'thinking' | 'reply';

type SystemInfo = {
  app: string;
  version: string;
  phase: string;
  branch: string;
  runtime: string;
  aiRuntime: string;
  exactModelExposed: boolean;
  toolGateway: string;
};

type AgentConfig = {
  id: AgentId;
  label: string;
  short: string;
  role: string;
  gateway: string;
  prompts: string[];
};

const MESSAGE_KEY = 'ogenic-ai-preview-messages-v3';
const MEMORY_KEY = 'ogenic-ai-memory-v2';
const TAB_KEY = 'ogenic-ai-tab-v3';
const AGENT_KEY = 'ogenic-ai-agent-v1';

const agents: AgentConfig[] = [
  {
    id: 'ogenic',
    label: 'OGENIC',
    short: 'Main Brain',
    role: 'สมองหลัก คุมบริบท งาน และการตัดสินใจของระบบ',
    gateway: 'LIVE BRAIN',
    prompts: ['สรุปสถานะตอนนี้', 'งานต่อไปที่สำคัญสุดคืออะไร', 'เช็กว่าเราติด blocker อะไร'],
  },
  {
    id: 'code',
    label: 'CODEX',
    short: 'Code Agent',
    role: 'โหมดคิดโค้ด แก้บั๊ก วาง test และ implementation plan',
    gateway: 'BRAIN MODE',
    prompts: ['ตรวจโค้ดที่ค้าง', 'วางแผนแก้ bug', 'ทำ test plan ให้ที'],
  },
  {
    id: 'github',
    label: 'GITHUB',
    short: 'Repo Cat',
    role: 'โหมด repo / branch / PR / CI โดยไม่อ้างว่ากด GitHub แล้วถ้า gateway ยังไม่ต่อ',
    gateway: 'GATEWAY',
    prompts: ['เช็ก branch ที่ใช้อยู่', 'สรุป PR/CI ที่ต้องดู', 'วางแผน commit ต่อไป'],
  },
  {
    id: 'vercel',
    label: 'VERCEL',
    short: 'Deploy Sprite',
    role: 'โหมด deployment / preview / blocker / release planning',
    gateway: 'GATEWAY',
    prompts: ['เช็ก deployment blocker', 'วางแผน deploy แบบปลอดภัย', 'สรุป preview ที่ควรทดสอบ'],
  },
  {
    id: 'linear',
    label: 'LINEAR',
    short: 'Task Sprite',
    role: 'โหมด issue / project / task planning และลำดับงาน',
    gateway: 'GATEWAY',
    prompts: ['สรุปงานค้างที่ควรทำก่อน', 'แตกงานนี้เป็น Linear issues', 'วางลำดับ task ให้ที'],
  },
];

const defaultMemory = [
  'ผู้ใช้คือ owner/operator ของระบบ OGENIC',
  'โปรเจกต์หลักปัจจุบันคือ OGENIC Phase VI',
  'repository: Ogenicchocolate21debug/Build-Platform',
  'active branch: phase-vi-provider-incentive-metering',
  'เป้าหมาย: OGENIC AI App / Control App สำหรับ Chat, Tools, Tasks, Connectors และ System',
  'งาน production, การลบ, การใช้เงิน และ permission สำคัญต้องขออนุมัติก่อน',
  'อย่าอ้างว่า tool ภายนอกทำงานแล้วถ้ายังไม่มีหลักฐานจาก gateway',
].join('\n');

const welcome: Message = {
  role: 'assistant',
  content: 'OGENIC พร้อมแล้วครับ — Main Brain ใช้งานได้ ส่วน GitHub/Vercel/Linear จะไม่แกล้งทำเป็นเชื่อมจริงจนกว่า gateway จะพร้อม',
};

const tools = [
  { name: 'AI Chat', status: 'LIVE', detail: 'Main Brain + agent modes ใช้งานได้', agent: 'ogenic' as AgentId },
  { name: 'Code Agent', status: 'BRAIN', detail: 'คิดโค้ด / test / implementation ผ่าน AI runtime', agent: 'code' as AgentId },
  { name: 'GitHub', status: 'GATEWAY', detail: 'มี agent mode แล้ว แต่ tool execution ยังต้อง bridge', agent: 'github' as AgentId },
  { name: 'Vercel', status: 'GATEWAY', detail: 'มี deploy agent mode แล้ว แต่ execution ยังต้อง bridge', agent: 'vercel' as AgentId },
  { name: 'Linear', status: 'GATEWAY', detail: 'มี task-planner agent mode แล้ว แต่ execution ยังต้อง bridge', agent: 'linear' as AgentId },
  { name: 'Memory', status: 'LOCAL', detail: 'จำบทสนทนาและ Context ใน Safari เครื่องนี้' },
  { name: 'Google Drive', status: 'GATEWAY', detail: 'ต้อง bridge ผ่าน OGENIC backend ก่อน' },
  { name: 'Notion', status: 'GATEWAY', detail: 'ต้อง bridge ผ่าน OGENIC backend ก่อน' },
  { name: 'Cloudflare / D1', status: 'TARGET', detail: 'runtime/state เป้าหมายของ Phase VI' },
];

const tasks = [
  ['1', 'Tool Gateway', 'เชื่อม GitHub / Linear / Drive / Notion / Vercel ผ่าน backend เดียว', 'NEXT'],
  ['2', 'Canonical Memory', 'ย้าย memory จาก local browser ไป D1 หลังมี auth/gateway', 'NEXT'],
  ['3', 'Auth + Approval', 'ล็อก owner session และ Human Approval สำหรับงานเสี่ยง', 'NEXT'],
  ['4', '2D Living Agents', 'รีดีไซน์ mascot เป็น 2D/2.5D sprite แบบเบาเครื่อง', 'DONE'],
  ['5', 'Native iOS', 'เก็บ Capacitor/Xcode ไว้ทำภายหลัง', 'LATER'],
];

const playgroundLines = [
  'วันนี้มึงจะสั่งอะไรกูอีกหรือเปล่าน้า 👀',
  'อย่ากด deploy รัวดิ กูยังวิ่งไม่ทัน 😂',
  'Repo Cat บอกว่า branch ยังอยู่ ไม่ต้องตกใจ',
  'ถ้า error มา กูขอแกล้งตายสามวิแล้วค่อยลุก',
  'งานเยอะไม่กลัว กลัวมึงเปลี่ยน requirement ตอนตีสอง 😼',
];

function getAgent(id: AgentId) {
  return agents.find(agent => agent.id === id) || agents[0];
}

function Sprite({ agent, mood = 'idle', mini = false }: { agent: AgentConfig; mood?: Mood; mini?: boolean }) {
  const palette: Record<AgentId, { shell: string; shell2: string; edge: string; glass: string; glow: string; accent: string }> = {
    ogenic: { shell: '#ff8a2f', shell2: '#ffd84f', edge: '#743719', glass: '#183a57', glow: '#69eaff', accent: '#fff0b2' },
    code: { shell: '#2384ff', shell2: '#57e6ff', edge: '#174b82', glass: '#17325d', glow: '#9af6ff', accent: '#c6fbff' },
    github: { shell: '#252b32', shell2: '#83ef80', edge: '#11171b', glass: '#171f25', glow: '#8cf89a', accent: '#c5ffc2' },
    vercel: { shell: '#ff625b', shell2: '#fafafd', edge: '#675959', glass: '#30343a', glow: '#ffffff', accent: '#fff1f0' },
    linear: { shell: '#7158ff', shell2: '#ff79dc', edge: '#35266f', glass: '#251d5a', glow: '#c8bbff', accent: '#ffd0ef' },
  };
  const p = palette[agent.id];
  const mark = agent.id === 'github' ? 'GH' : agent.id === 'vercel' ? '▲' : agent.id === 'linear' ? 'L' : agent.id === 'code' ? '</>' : 'OG';
  const id = agent.id;

  return (
    <div className={'spriteChar svgSprite sprite-' + agent.id + ' mood-' + mood + (mini ? ' mini' : '')} aria-label={agent.label + ' ' + mood}>
      <svg className="botSvg" viewBox="0 0 120 150" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={'shell-' + id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.accent} />
            <stop offset="48%" stopColor={p.shell2} />
            <stop offset="100%" stopColor={p.shell} />
          </linearGradient>
          <linearGradient id={'body-' + id} x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor={p.shell2} />
            <stop offset="100%" stopColor={p.shell} />
          </linearGradient>
          <linearGradient id={'glass-' + id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.glass} />
            <stop offset="100%" stopColor="#0b1520" />
          </linearGradient>
          <radialGradient id={'eye-' + id}>
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={p.glow} />
            <stop offset="100%" stopColor={p.glow} stopOpacity="0.25" />
          </radialGradient>
          <linearGradient id={'shine-' + id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <ellipse className="svgGround" cx="60" cy="139" rx="37" ry="8" fill="rgba(16,33,48,.18)" />
        <g className="svgBot">
          {agent.id === 'github' ? (
            <>
              <path d="M24 38 L31 16 L45 31 Z" fill={'url(#shell-' + id + ')'} stroke={p.edge} strokeWidth="5" strokeLinejoin="round" />
              <path d="M96 38 L89 16 L75 31 Z" fill={'url(#shell-' + id + ')'} stroke={p.edge} strokeWidth="5" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <rect x="57" y="3" width="6" height="18" rx="3" fill={p.edge} />
              <circle cx="60" cy="4" r="8" fill={p.shell} stroke={p.edge} strokeWidth="4" />
              <circle cx="57.5" cy="1.5" r="2.2" fill="#fff" opacity="0.58" />
            </>
          )}

          <rect x="84" y="78" width="24" height="40" rx="10" fill={'url(#body-' + id + ')'} stroke={p.edge} strokeWidth="5" transform="rotate(-7 84 78)" />

          <rect x="24" y="78" width="25" height="45" rx="13" fill={'url(#body-' + id + ')'} stroke={p.edge} strokeWidth="5" transform="rotate(12 24 78)" />
          <rect x="71" y="78" width="25" height="45" rx="13" fill={'url(#body-' + id + ')'} stroke={p.edge} strokeWidth="5" transform="rotate(-12 71 78)" />

          <rect x="34" y="72" width="52" height="57" rx="20" fill={'url(#body-' + id + ')'} stroke={p.edge} strokeWidth="6" />
          <path d="M42 80 C52 75, 72 75, 80 84" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.28" />

          <rect x="21" y="22" width="78" height="69" rx="28" fill={'url(#shell-' + id + ')'} stroke={p.edge} strokeWidth="6" />
          <path d="M31 32 C43 23, 68 22, 82 31" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity="0.35" />

          <rect x="31" y="35" width="58" height="42" rx="18" fill={'url(#glass-' + id + ')'} stroke={p.edge} strokeWidth="4" />
          <path d="M38 42 C49 36, 66 36, 79 41" fill="none" stroke={'url(#shine-' + id + ')'} strokeWidth="5" strokeLinecap="round" />

          <ellipse className="svgEye eyeLeft" cx="47" cy="54" rx="6.5" ry="8.5" fill={'url(#eye-' + id + ')'} />
          <ellipse className="svgEye eyeRight" cx="73" cy="54" rx="6.5" ry="8.5" fill={'url(#eye-' + id + ')'} />
          <circle cx="45" cy="51" r="1.8" fill="#fff" opacity="0.85" />
          <circle cx="71" cy="51" r="1.8" fill="#fff" opacity="0.85" />

          <path className="svgMouth" d="M52 66 Q60 72 68 66" fill="none" stroke="#dffaff" strokeWidth="3.2" strokeLinecap="round" />
          <ellipse cx="38" cy="65" rx="6" ry="2.8" fill="#ff93a2" opacity="0.52" />
          <ellipse cx="82" cy="65" rx="6" ry="2.8" fill="#ff93a2" opacity="0.52" />

          <rect x="44" y="91" width="32" height="23" rx="9" fill="#172433" stroke={p.edge} strokeWidth="3" />
          <path d="M49 96 H70" stroke="#fff" strokeWidth="2.5" opacity="0.16" strokeLinecap="round" />
          <text x="60" y="106" textAnchor="middle" fill="#ffffff" fontSize={mark === '</>' ? '7' : '9'} fontWeight="900">{mark}</text>

          <rect x="30" y="119" width="27" height="19" rx="10" fill={'url(#shell-' + id + ')'} stroke={p.edge} strokeWidth="5" />
          <rect x="63" y="119" width="27" height="19" rx="10" fill={'url(#shell-' + id + ')'} stroke={p.edge} strokeWidth="5" />
          <path d="M35 124 H50" stroke="#fff" strokeWidth="3" opacity="0.28" strokeLinecap="round" />
          <path d="M68 124 H83" stroke="#fff" strokeWidth="3" opacity="0.28" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(TAB_KEY) as Tab | null;
    return saved && ['home', 'chat', 'tools', 'tasks', 'system'].includes(saved) ? saved : 'home';
  });
  const [agentId, setAgentId] = useState<AgentId>(() => {
    const saved = localStorage.getItem(AGENT_KEY) as AgentId | null;
    return saved && ['ogenic', 'code', 'github', 'vercel', 'linear'].includes(saved) ? saved : 'ogenic';
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(MESSAGE_KEY);
      return saved ? (JSON.parse(saved) as Message[]) : [welcome];
    } catch {
      return [welcome];
    }
  });
  const [memory, setMemory] = useState(() => localStorage.getItem(MEMORY_KEY) || defaultMemory);
  const [memoryDraft, setMemoryDraft] = useState(() => localStorage.getItem(MEMORY_KEY) || defaultMemory);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyPulse, setReplyPulse] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [playLine, setPlayLine] = useState(0);
  const [motionOn, setMotionOn] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeAgent = getAgent(agentId);
  const mood: Mood = busy ? 'thinking' : replyPulse ? 'reply' : input.trim() ? 'listening' : 'idle';

  useEffect(() => {
    localStorage.setItem(MESSAGE_KEY, JSON.stringify(messages));
    if (tab === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  useEffect(() => {
    localStorage.setItem(AGENT_KEY, agentId);
  }, [agentId]);

  useEffect(() => {
    void api.get('/api/system').then(response => setSystemInfo(response.data as SystemInfo)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlayLine(current => (current + 1) % playgroundLines.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const launchAgent = (id: AgentId) => {
    setAgentId(id);
    setTab('chat');
    setErrorText('');
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMessage: Message = { role: 'user', content: text };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setErrorText('');
    setBusy(true);
    setReplyPulse(false);

    try {
      const response = await api.post('/api/chat', {
        messages: next,
        memory,
        agent: agentId,
      });
      const reply = String(response.data?.text || '').trim();
      if (!reply) throw new Error('empty_response');
      setMessages(current => [...current, { role: 'assistant', content: reply }]);
      setReplyPulse(true);
      window.setTimeout(() => setReplyPulse(false), 1500);
    } catch {
      setErrorText('ส่งข้อความไม่สำเร็จ ลองอีกครั้งได้เลย');
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    setMessages([welcome]);
    setErrorText('');
    setInput('');
  };

  const saveMemory = () => {
    const next = memoryDraft.trim() || defaultMemory;
    setMemory(next);
    setMemoryDraft(next);
    localStorage.setItem(MEMORY_KEY, next);
  };

  return (
    <main className={'shell ' + (motionOn ? 'motion-on' : 'motion-off')}>
      <header className="topbar">
        <div className="topBrand">
          <h1>OGENIC <b>VI</b></h1>
          <span>Harness Capability</span>
        </div>
        <div className="online"><span />ONLINE</div>
      </header>

      <section className="content">
        {tab === 'home' && (
          <div className="page posterPage">
            <section className="posterHero">
              <div className="posterGlow posterGlowA" />
              <div className="posterGlow posterGlowB" />
              <div className="posterLabel">
                <span>OGENIC VI</span>
                <small>Harness Capability</small>
              </div>
              <div className="posterCopy">
                <h2>One AI.<br/><b>All Your Work.</b></h2>
                <button className="speechButton" type="button" onClick={() => launchAgent('ogenic')}>พร้อมละ วันนี้จะให้กูทำอะไรอีก 😼</button>
              </div>
              <div className="posterMainBot" onClick={() => launchAgent('ogenic')} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') launchAgent('ogenic'); }}>
                <div className="posterPlatform" />
                <Sprite agent={agents[0]} mood="idle" />
              </div>
            </section>

            <section className="posterTeam">
              <div className="posterTeamHead">
                <strong>Living Agent Team</strong>
                <button className={'motionToggle ' + (motionOn ? 'on' : '')} type="button" onClick={() => setMotionOn(current => !current)}>{motionOn ? 'MOTION ON' : 'MOTION OFF'}</button>
              </div>
              <div className="posterAgents">
                {agents.map(agent => (
                  <button className={'posterAgent agent-' + agent.id} key={agent.id} onClick={() => launchAgent(agent.id)}>
                    <Sprite agent={agent} mini />
                    <b>{agent.label}</b>
                    <small>{agent.short}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="posterToolRail" aria-label="OGENIC connected capability shortcuts">
              <span>Drive</span><span>Notion</span><span>Cloudflare</span><span>Gmail</span><span>More</span>
            </section>

            <section className="posterYard">
              <div className="yardSpeech">{playgroundLines[playLine]}</div>
              <div className="runner runner1"><Sprite agent={agents[1]} mini /></div>
              <div className="runner runner2"><Sprite agent={agents[2]} mini /></div>
              <div className="runner runner3"><Sprite agent={agents[4]} mini /></div>
            </section>
          </div>
        )}

        {tab === 'chat' && (
          <div className="chatPage">
            <div className="chatHead">
              <div className="agentIdentity">
                <Sprite agent={activeAgent} mood={mood} mini />
                <div>
                  <small>{activeAgent.short.toUpperCase()}</small>
                  <strong>{activeAgent.label}</strong>
                  <span>{activeAgent.role}</span>
                </div>
              </div>
              <button className="ghost" onClick={clearChat}>ล้างแชต</button>
            </div>

            <div className="promptStrip">
              {activeAgent.prompts.map(prompt => (
                <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>
              ))}
            </div>

            <section className="messages" aria-live="polite">
              {messages.map((message, index) => (
                <article className={'bubble ' + message.role} key={message.role + '-' + index}>
                  <small>{message.role === 'user' ? 'YOU' : activeAgent.label}</small>
                  <p>{message.content}</p>
                </article>
              ))}
              {busy && (
                <article className="thinkingRow">
                  <Sprite agent={activeAgent} mood="thinking" mini />
                  <div className="bubble assistant typing"><small>{activeAgent.label}</small><p>กำลังคิด…</p></div>
                </article>
              )}
              {errorText && <div className="error" role="alert">{errorText}</div>}
              <div ref={bottomRef} />
            </section>

            <div className="composer">
              <Sprite agent={activeAgent} mood={mood} mini />
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={'พิมพ์งานให้ ' + activeAgent.label + '…'}
                rows={1}
                aria-label={'ข้อความถึง ' + activeAgent.label}
              />
              <button className="send" onClick={() => void send()} disabled={!input.trim() || busy}>{busy ? '…' : 'ส่ง'}</button>
            </div>
          </div>
        )}

        {tab === 'tools' && (
          <div className="page">
            <div className="pageTitle"><small>CAPABILITIES</small><h2>Tools</h2><p>ตัวหลักกดเข้า agent mode ได้ ส่วนตัวรองขยับเบา ๆ และรอ gateway</p></div>
            <div className="toolList">
              {tools.map((item, index) => (
                <button
                  className={'toolRow ' + (item.agent ? 'clickable' : '')}
                  key={item.name}
                  onClick={() => item.agent && launchAgent(item.agent)}
                  disabled={!item.agent}
                >
                  <div className="toolIcon">
                    {item.agent ? <Sprite agent={getAgent(item.agent)} mini /> : <span>{['◇', '▦', '▣', '◫'][index % 4]}</span>}
                  </div>
                  <div className="toolText"><strong>{item.name}</strong><p>{item.detail}</p></div>
                  <span className={'pill ' + item.status.toLowerCase()}>{item.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="page">
            <div className="pageTitle"><small>ROADMAP</small><h2>Tasks</h2><p>สิ่งที่เหลือก่อน parity กับ OGENIC ตัวเต็ม</p></div>
            <div className="taskList">
              {tasks.map(item => (
                <article className="taskRow" key={item[0]}>
                  <span className="taskNo">{item[0]}</span>
                  <div><strong>{item[1]}</strong><p>{item[2]}</p></div>
                  <span className={'pill ' + (item[3] === 'DONE' ? 'live' : '')}>{item[3]}</span>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === 'system' && (
          <div className="page">
            <div className="pageTitle"><small>RUNTIME + MEMORY</small><h2>System</h2></div>
            <article className="card">
              <div className="kv"><span>App</span><b>{systemInfo?.app || 'OGENIC AI'}</b></div>
              <div className="kv"><span>Version</span><b>{systemInfo?.version || '0.6-svg-material'}</b></div>
              <div className="kv"><span>Runtime</span><b>{systemInfo?.runtime || 'AppDeploy managed backend'}</b></div>
              <div className="kv"><span>Model</span><b>{systemInfo?.exactModelExposed ? systemInfo.aiRuntime : 'Managed · exact model not exposed'}</b></div>
              <div className="kv"><span>Tool Gateway</span><b>{systemInfo?.toolGateway || 'Not connected'}</b></div>
            </article>
            <article className="card">
              <div className="cardHead"><strong>Context ที่ OGENIC ต้องจำ</strong><span className="pill local">LOCAL</span></div>
              <textarea className="memoryBox" value={memoryDraft} onChange={event => setMemoryDraft(event.target.value)} rows={11} />
              <button className="primary" onClick={saveMemory}>บันทึก Context</button>
              <p className="hint">ตอนนี้เก็บใน Safari เครื่องนี้ ไม่ใช่ ChatGPT Memory และยังไม่ sync เข้า D1</p>
            </article>
          </div>
        )}
      </section>

      <nav className="bottomNav" aria-label="OGENIC navigation">
        {([
          ['home', '⌂', 'Home'],
          ['chat', '◉', 'Chat'],
          ['tools', '⌘', 'Tools'],
          ['tasks', '✓', 'Tasks'],
          ['system', '⚙', 'System'],
        ] as Array<[Tab, string, string]>).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span>{icon}</span><small>{label}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}

export default App;
