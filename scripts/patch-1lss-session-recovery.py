from pathlib import Path


def patch_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'PATCH_OK already applied: {label}')
        return text
    if old not in text:
        raise SystemExit(f'PATCH_CONTRACT_FAILED {label}')
    if text.count(old) != 1:
        raise SystemExit(f'PATCH_CONTRACT_FAILED duplicate {label}: {text.count(old)}')
    print(f'PATCH_OK apply: {label}')
    return text.replace(old, new, 1)


# Router: mount the session-recovery API without changing existing canonical chat routes.
path = Path('worker/entry-connectors.ts')
text = path.read_text(encoding='utf-8')
text = patch_once(
    text,
    'import { createLiveDoorApi, type LiveDoorBindings } from "./live-door-api";\n',
    'import { createLiveDoorApi, type LiveDoorBindings } from "./live-door-api";\nimport { createSessionRecoveryApi, type SessionRecoveryBindings } from "./session-recovery-api";\n',
    'entry import',
)
text = patch_once(
    text,
    'type Bindings = ConnectorAppBindings & ConnectorBindings & LiveAssistBindings & BrowserSessionBindings & UnifiedChatBindings & InlineToolBindings & LiveDoorBindings & { MANUS_API_KEY?: string };',
    'type Bindings = ConnectorAppBindings & ConnectorBindings & LiveAssistBindings & BrowserSessionBindings & UnifiedChatBindings & InlineToolBindings & LiveDoorBindings & SessionRecoveryBindings & { MANUS_API_KEY?: string };',
    'entry bindings',
)
text = patch_once(
    text,
    'const liveDoorApi = createLiveDoorApi();\nconst publicHooks = createPublicHookApi();',
    'const liveDoorApi = createLiveDoorApi();\nconst sessionRecoveryApi = createSessionRecoveryApi();\nconst publicHooks = createPublicHookApi();',
    'entry api instance',
)
text = patch_once(
    text,
    '    if (pathname === "/api/live-door") {\n      return liveDoorApi.fetch(request, env, ctx as never);\n    }\n    if (pathname === "/api/chat/ephemeral" || pathname === "/api/1lss/event") {',
    '    if (pathname === "/api/live-door") {\n      return liveDoorApi.fetch(request, env, ctx as never);\n    }\n    if (pathname === "/api/1lss/history-page" || pathname === "/api/1lss/sessions" || pathname.startsWith("/api/1lss/sessions/")) {\n      return sessionRecoveryApi.fetch(request, env, ctx as never);\n    }\n    if (pathname === "/api/chat/ephemeral" || pathname === "/api/1lss/event") {',
    'entry routes',
)
path.write_text(text, encoding='utf-8')


# Canonical model API: accept a safe external session reference from any bridge and upsert it into D1.
path = Path('worker/chat-model-api.ts')
text = path.read_text(encoding='utf-8')
text = patch_once(
    text,
    '  source_surface?: unknown;\n};',
    '  source_surface?: unknown;\n  session_ref?: unknown;\n  session_url?: unknown;\n  session_label?: unknown;\n};',
    'chat body session fields',
)
helper_old = '''  if (mode === "mobile") return "ogenic-app";\n  return "unknown";\n}\n\nasync function ensureConversation'''
helper_new = '''  if (mode === "mobile") return "ogenic-app";\n  return "unknown";\n}\n\nfunction safeSessionUrl(value: unknown) {\n  const candidate = clean(value, 1200);\n  if (!candidate) return null;\n  try {\n    const url = new URL(candidate);\n    if (url.protocol !== "https:" && url.protocol !== "http:") return null;\n    return `${url.origin}${url.pathname}`.slice(0, 1000);\n  } catch {\n    return null;\n  }\n}\n\nasync function rememberSessionRef(\n  db: D1Like,\n  sourceSurface: string,\n  sessionRef: string,\n  sessionUrl: string | null,\n  sessionLabel: string | null,\n  sequence: number,\n) {\n  if (!sessionRef || !sequence) return;\n  const now = Date.now();\n  await db.prepare(\n    `INSERT INTO chat_session_refs(\n       id, conversation_id, source_surface, session_ref, session_url, label,\n       first_sequence, last_sequence, first_seen_at, last_seen_at\n     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n     ON CONFLICT(conversation_id, source_surface, session_ref) DO UPDATE SET\n       session_url = COALESCE(excluded.session_url, chat_session_refs.session_url),\n       label = COALESCE(excluded.label, chat_session_refs.label),\n       first_sequence = CASE\n         WHEN chat_session_refs.first_sequence IS NULL THEN excluded.first_sequence\n         ELSE MIN(chat_session_refs.first_sequence, excluded.first_sequence)\n       END,\n       last_sequence = CASE\n         WHEN chat_session_refs.last_sequence IS NULL THEN excluded.last_sequence\n         ELSE MAX(chat_session_refs.last_sequence, excluded.last_sequence)\n       END,\n       last_seen_at = excluded.last_seen_at`,\n  ).bind(\n    makeId("session"), CONVERSATION_ID, sourceSurface, sessionRef, sessionUrl, sessionLabel,\n    sequence, sequence, now, now,\n  ).run();\n}\n\nasync function ensureConversation'''
text = patch_once(text, helper_old, helper_new, 'chat session helper')
text = patch_once(
    text,
    '    const sourceSurface = resolveSurface(body, c.req.raw);\n    const attachmentIds = Array.isArray(body.attachment_ids)',
    '    const sourceSurface = resolveSurface(body, c.req.raw);\n    const sessionRef = clean(body.session_ref ?? c.req.header("x-ogenic-session-ref"), 220);\n    const sessionUrl = safeSessionUrl(body.session_url ?? c.req.header("x-ogenic-session-url"));\n    const sessionLabel = clean(body.session_label ?? c.req.header("x-ogenic-session-label"), 160) || null;\n    const attachmentIds = Array.isArray(body.attachment_ids)',
    'chat resolve session',
)
text = patch_once(
    text,
    '    if (replay?.content) {\n      return c.json({',
    '    if (replay?.content) {\n      await rememberSessionRef(db, sourceSurface, sessionRef, sessionUrl, sessionLabel, Number(replay.sequence_no ?? 0));\n      return c.json({',
    'chat replay session stamp',
)
text = patch_once(
    text,
    '      userSequence = Number(persistedUser?.sequence_no ?? candidate);\n    }\n\n    const requestBody: Record<string, unknown> = {',
    '      userSequence = Number(persistedUser?.sequence_no ?? candidate);\n    }\n    await rememberSessionRef(db, sourceSurface, sessionRef, sessionUrl, sessionLabel, userSequence);\n\n    const requestBody: Record<string, unknown> = {',
    'chat live session stamp',
)
path.write_text(text, encoding='utf-8')


# Unified Web/App surface: stable viewport refs, recent doors, paginated older history.
path = Path('src/UnifiedChat.tsx')
text = path.read_text(encoding='utf-8')
text = patch_once(
    text,
    'type RuntimeTool = { id: string; label: string; state: string; summary?: string; records?: Array<Record<string, unknown>> };',
    'type SessionRef = { id: string; source_surface: string; session_ref: string; session_url?: string | null; label?: string | null; first_sequence?: number | null; last_sequence?: number | null; last_seen_at?: number };\ntype RuntimeTool = { id: string; label: string; state: string; summary?: string; records?: Array<Record<string, unknown>> };',
    'ui session type',
)
text = patch_once(
    text,
    'function fileToDataUrl(file: File) {',
    'function makeViewportSessionRef(surface: Surface, reuse = true) {\n  const key = `ogenic.1lss.viewport.${surface}`;\n  try {\n    if (reuse) {\n      const current = sessionStorage.getItem(key);\n      if (current) return current;\n    }\n    const next = `${surface}_${crypto.randomUUID()}`;\n    sessionStorage.setItem(key, next);\n    return next;\n  } catch {\n    return `${surface}_${crypto.randomUUID()}`;\n  }\n}\nfunction fileToDataUrl(file: File) {',
    'ui viewport helper',
)
text = patch_once(
    text,
    '  const [messages, setMessages] = useState<Message[]>([]);\n  const [latestSequence, setLatestSequence] = useState(0);',
    '  const [messages, setMessages] = useState<Message[]>([]);\n  const [sessionRefs, setSessionRefs] = useState<SessionRef[]>([]);\n  const [historyHasMore, setHistoryHasMore] = useState(false);\n  const [viewportSessionRef, setViewportSessionRef] = useState(() => makeViewportSessionRef(surface));\n  const [latestSequence, setLatestSequence] = useState(0);',
    'ui session states',
)
text = patch_once(
    text,
    '    const body = await response.json().catch(() => ({})) as { messages?: Message[] };\n    const rows = Array.isArray(body.messages) ? body.messages : [];\n    const latest = rows.reduce((max, row) => Math.max(max, Number(row.sequence_no ?? 0)), 0);\n    setLatestSequence(latest);\n    setMessages(rows.filter((row) => Number(row.sequence_no ?? 0) > floor));',
    '    const body = await response.json().catch(() => ({})) as { messages?: Message[]; has_more?: boolean };\n    const rows = Array.isArray(body.messages) ? body.messages : [];\n    const latest = rows.reduce((max, row) => Math.max(max, Number(row.sequence_no ?? 0)), 0);\n    setLatestSequence(latest);\n    setHistoryHasMore(Boolean(body.has_more ?? (rows.length >= 60)));\n    setMessages(rows.filter((row) => Number(row.sequence_no ?? 0) > floor));',
    'ui history paging state',
)
insert_anchor = '  const loadRuntime = useCallback(async () => {'
insert_block = '''  const loadSessionRefs = useCallback(async () => {\n    if (!d1Enabled) return;\n    const response = await fetch("/api/1lss/sessions?limit=20", { credentials: "same-origin", cache: "no-store" });\n    if (!response.ok) return;\n    const body = await response.json().catch(() => ({})) as { sessions?: SessionRef[] };\n    setSessionRefs(Array.isArray(body.sessions) ? body.sessions : []);\n  }, [d1Enabled]);\n\n  async function registerSessionRef(ref = viewportSessionRef, sequenceNo = 0) {\n    if (!d1Enabled || !ref) return;\n    const response = await fetch("/api/1lss/sessions", {\n      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },\n      body: JSON.stringify({\n        source_surface: surface,\n        session_ref: ref,\n        session_url: `${window.location.origin}${window.location.pathname}`,\n        label: surface === "ogenic-app" ? "OGENIC App viewport" : "OGENIC Web viewport",\n        sequence_no: sequenceNo || undefined,\n      }),\n    });\n    if (response.ok) await loadSessionRefs();\n  }\n\n  async function loadOlder() {\n    if (!d1Enabled) return;\n    const oldest = messages.reduce((min, row) => {\n      const seq = Number(row.sequence_no ?? 0);\n      return seq > 0 ? Math.min(min, seq) : min;\n    }, Number.POSITIVE_INFINITY);\n    const before = Number.isFinite(oldest) ? oldest : latestSequence + 1;\n    const response = await fetch(`/api/1lss/history-page?before_sequence=${before}&limit=60`, { credentials: "same-origin", cache: "no-store" });\n    if (!response.ok) return;\n    const body = await response.json().catch(() => ({})) as { messages?: Message[]; has_more?: boolean };\n    const older = Array.isArray(body.messages) ? body.messages : [];\n    setHistoryHasMore(Boolean(body.has_more));\n    setMessages((current) => {\n      const seen = new Set(current.map((row) => `${row.sequence_no ?? "x"}:${row.id ?? ""}`));\n      return [...older.filter((row) => !seen.has(`${row.sequence_no ?? "x"}:${row.id ?? ""}`)), ...current];\n    });\n    setInlineNotice(older.length ? `โหลด 1LSS เก่ามาอีก ${older.length} รายการ` : "ถึงต้นเส้นที่โหลดได้แล้ว");\n  }\n\n  async function openKnownSession(row: SessionRef) {\n    if (row.session_url && row.source_surface.startsWith("chatgpt")) {\n      window.open(row.session_url, "_blank", "noopener,noreferrer");\n      setNewDock(false);\n      return;\n    }\n    const response = await fetch(`/api/1lss/sessions/${encodeURIComponent(row.id)}`, { credentials: "same-origin", cache: "no-store" });\n    if (!response.ok) return;\n    const body = await response.json().catch(() => ({})) as { messages?: Message[]; session?: SessionRef };\n    const rows = Array.isArray(body.messages) ? body.messages : [];\n    setMessages(rows);\n    const first = Number(body.session?.first_sequence ?? row.first_sequence ?? 1);\n    setViewportFloor(Math.max(0, first - 1));\n    setNewDock(false);\n    setInlineNotice(`เปิด session ${row.label || row.source_surface} จาก 1LSS แล้ว`);\n  }\n\n'''
if insert_block not in text:
    if insert_anchor not in text:
        raise SystemExit('PATCH_CONTRACT_FAILED ui session functions anchor')
    text = text.replace(insert_anchor, insert_block + insert_anchor, 1)
    print('PATCH_OK apply: ui session functions')
else:
    print('PATCH_OK already applied: ui session functions')
text = patch_once(
    text,
    '        if (body.authenticated) await Promise.all([loadRuntime(), loadHistory(0)]);',
    '        if (body.authenticated) await Promise.all([loadRuntime(), loadHistory(0), loadSessionRefs(), registerSessionRef(viewportSessionRef)]);',
    'ui initial session restore',
)
text = patch_once(
    text,
    '    await Promise.all([loadRuntime(), loadHistory(0)]);',
    '    await Promise.all([loadRuntime(), loadHistory(0), loadSessionRefs(), registerSessionRef(viewportSessionRef)]);',
    'ui sign-in session restore',
)
text = patch_once(
    text,
    '        source_surface: surface,\n      }),',
    '        source_surface: surface,\n        session_ref: viewportSessionRef,\n        session_url: `${window.location.origin}${window.location.pathname}`,\n        session_label: surface === "ogenic-app" ? "OGENIC App viewport" : "OGENIC Web viewport",\n      }),',
    'ui chat session payload',
)
text = patch_once(
    text,
    '  function startNew(memory: boolean) {\n    setD1Enabled(memory);\n    setViewportFloor(latestSequence);',
    '  function startNew(memory: boolean) {\n    setD1Enabled(memory);\n    const nextRef = makeViewportSessionRef(surface, false);\n    setViewportSessionRef(nextRef);\n    if (memory) void registerSessionRef(nextRef, latestSequence + 1);\n    setViewportFloor(latestSequence);',
    'ui new viewport ref',
)
old_dock = '      {newDock && <section className="ucNewDock"><strong>New chat viewport</strong><p>เส้นชีวิตไม่แตก ถ้าเปิด D1 จะต่อ owner-main หลังบ้าน</p><label><input type="checkbox" checked={d1Enabled} onChange={(event) => setD1Enabled(event.target.checked)} /> D1 · 1LSS Memory</label><div><button onClick={() => startNew(d1Enabled)}>Start</button><button className="ghost" onClick={() => setNewDock(false)}>Cancel</button></div></section>}'
new_dock = '      {newDock && <section className="ucNewDock"><strong>New chat viewport</strong><p>เส้นชีวิตไม่แตก ถ้าเปิด D1 จะต่อ owner-main หลังบ้าน</p><label><input type="checkbox" checked={d1Enabled} onChange={(event) => setD1Enabled(event.target.checked)} /> D1 · 1LSS Memory</label><div><button onClick={() => startNew(d1Enabled)}>Start</button><button className="ghost" onClick={() => void loadOlder()}>Load older</button><button className="ghost" onClick={() => setNewDock(false)}>Cancel</button></div>{!!sessionRefs.length && <div className="ucConnected"><small>RECENT DOORS</small><p>{sessionRefs.slice(0, 5).map((row) => `${row.label || row.source_surface} #${row.last_sequence || "?"}`).join(" · ")}</p><div>{sessionRefs.slice(0, 5).map((row) => <button key={row.id} className="ghost" onClick={() => void openKnownSession(row)}>{row.source_surface} · #{row.last_sequence || "?"}</button>)}</div></div>}</section>}'
text = patch_once(text, old_dock, new_dock, 'ui recent doors')
text = patch_once(
    text,
    '    <section className="ucConversation">\n      {!messages.length &&',
    '    <section className="ucConversation">\n      {historyHasMore && <button className="ghost" onClick={() => void loadOlder()}>↑ Load older 1LSS</button>}\n      {!messages.length &&',
    'ui older button',
)
path.write_text(text, encoding='utf-8')


# Add a contract test only after all patches exist, so the patch workflow validates the finished state.
test_path = Path('tests/1lss-session-recovery-contract.test.mjs')
test_path.write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n\nconst read = (path) => readFileSync(path, "utf8");\n\ntest("1LSS session recovery keeps owner-main as the only canonical line", () => {\n  const migration = read("database/migrations/0011_1lss_session_refs.sql");\n  const api = read("worker/session-recovery-api.ts");\n  const chat = read("worker/chat-model-api.ts");\n  const entry = read("worker/entry-connectors.ts");\n  const ui = read("src/UnifiedChat.tsx");\n\n  assert.match(migration, /UNIQUE \(conversation_id, source_surface, session_ref\)/);\n  assert.match(api, /const CONVERSATION_ID = "owner-main"/);\n  assert.match(api, /\/api\/1lss\/history-page/);\n  assert.match(api, /\/api\/1lss\/sessions/);\n  assert.match(chat, /x-ogenic-session-ref/);\n  assert.match(chat, /rememberSessionRef/);\n  assert.match(entry, /createSessionRecoveryApi/);\n  assert.match(ui, /Load older 1LSS/);\n  assert.match(ui, /RECENT DOORS/);\n  assert.match(ui, /session_ref: viewportSessionRef/);\n});\n\ntest("stored session URLs are sanitized before persistence", () => {\n  const api = read("worker/session-recovery-api.ts");\n  const chat = read("worker/chat-model-api.ts");\n  assert.match(api, /return `\$\{url\.origin\}\$\{url\.pathname\}`/);\n  assert.match(chat, /return `\$\{url\.origin\}\$\{url\.pathname\}`/);\n});\n''', encoding='utf-8')
print('PATCH_OK wrote tests/1lss-session-recovery-contract.test.mjs')
