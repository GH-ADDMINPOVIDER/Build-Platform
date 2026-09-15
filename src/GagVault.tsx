import { useCallback, useEffect, useMemo, useState } from "react";

type MemoryMessage = { id?: string; role?: string; text?: string; model?: string | null; created_at?: number };
type SessionLink = { id: string; bucket: string; title: string; url: string; note: string; createdAt: number };
type MonthlyReminder = { day: number; note: string; lastNotifiedMonth: string };

const SESSION_KEY = "ogenic.gag.sessions.v1";
const REMINDER_KEY = "ogenic.gag.monthly-reminder.v1";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function loadSessions(): SessionLink[] {
  try {
    const rows = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function loadReminder(): MonthlyReminder {
  try {
    const row = JSON.parse(localStorage.getItem(REMINDER_KEY) || "null") as Partial<MonthlyReminder> | null;
    return {
      day: Math.max(1, Math.min(28, Number(row?.day || 1))),
      note: String(row?.note || "เช็กบิล / subscription / งานประจำเดือน"),
      lastNotifiedMonth: String(row?.lastNotifiedMonth || ""),
    };
  } catch {
    return { day: 1, note: "เช็กบิล / subscription / งานประจำเดือน", lastNotifiedMonth: "" };
  }
}

export default function GagVault() {
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState("C");
  const [sessions, setSessions] = useState<SessionLink[]>(loadSessions);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [memory, setMemory] = useState<MemoryMessage[]>([]);
  const [memoryState, setMemoryState] = useState("ยังไม่โหลด");
  const [reminder, setReminder] = useState<MonthlyReminder>(loadReminder);
  const [reminderState, setReminderState] = useState("");

  useEffect(() => { localStorage.setItem(SESSION_KEY, JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem(REMINDER_KEY, JSON.stringify(reminder)); }, [reminder]);

  const loadMemory = useCallback(async () => {
    setMemoryState("กำลังอ่าน D1 SAME MIND…");
    try {
      const response = await fetch("/api/chat/history", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.message || body?.code || `HTTP_${response.status}`);
      const messages = Array.isArray(body.messages) ? body.messages as MemoryMessage[] : [];
      setMemory(messages);
      setMemoryState(`${messages.length} messages · D1 SAME MIND`);
    } catch (error) {
      setMemoryState(error instanceof Error ? error.message : "อ่านฐานความจำไม่ได้");
    }
  }, []);

  useEffect(() => {
    const wire = () => {
      const nav = document.querySelector<HTMLElement>(".cpSide nav");
      if (!nav || nav.querySelector(".gagNavButton")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gagNavButton";
      button.innerHTML = "<span>▣</span>GAG";
      button.onclick = () => setOpen(true);
      nav.append(button);
    };
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { subtree: true, childList: true });
    wire();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.querySelector(".gagNavButton")?.classList.toggle("active", open);
    if (open) void loadMemory();
  }, [open, loadMemory]);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (now.getDate() < reminder.day || reminder.lastNotifiedMonth === month) return;
    setReminderState(`ถึงรอบเดือนนี้แล้ว · ${reminder.note}`);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("OGENIC monthly reminder", { body: reminder.note });
        setReminder((row) => ({ ...row, lastNotifiedMonth: month }));
      } catch { /* banner remains visible */ }
    }
  }, [open, reminder.day, reminder.note, reminder.lastNotifiedMonth]);

  const visibleSessions = useMemo(
    () => sessions.filter((item) => item.bucket === bucket).sort((a, b) => b.createdAt - a.createdAt),
    [sessions, bucket],
  );

  function quick(label: string, letter: string, target: string) {
    setBucket(letter);
    setTitle(`${label} session`);
    setUrl(target);
    setNote("");
  }

  function addSession() {
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    if (!cleanTitle || !/^https?:\/\//i.test(cleanUrl)) return;
    setSessions((rows) => [{ id: crypto.randomUUID(), bucket, title: cleanTitle, url: cleanUrl, note: note.trim(), createdAt: Date.now() }, ...rows]);
    setTitle(""); setUrl(""); setNote("");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setReminderState("เบราว์เซอร์นี้ยังไม่รองรับ Web Notification");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setReminderState(permission === "granted" ? "เปิด Web Notification แล้ว" : `Notification: ${permission}`);
    } catch {
      setReminderState("บน iPhone อาจต้อง Add to Home Screen ก่อนเปิด Web Notification");
    }
  }

  if (!open) return null;

  return <section className="gagShell" aria-label="GAG memory and session vault">
    <header className="gagHeader">
      <div><span className="eyebrow">OGENIC GAG</span><h1>Memory + Session Vault</h1><p>จำงานแบบ A–Z · ลิงก์ session · SAME MIND · reminder ในหน้าเดียว</p></div>
      <button className="gagClose" onClick={() => setOpen(false)}>✕</button>
    </header>

    <div className="gagTopGrid">
      <article className="gagCard gagMemory">
        <div className="gagCardHead"><div><span className="eyebrow">ฐานความจำ</span><h2>SAME MIND</h2></div><button onClick={() => void loadMemory()}>↻</button></div>
        <strong>{memoryState}</strong>
        <div className="gagMemoryList">{memory.slice(-4).reverse().map((item, index) => <div key={item.id || index}><b>{item.role || "message"}</b><span>{item.text || "—"}</span></div>)}</div>
      </article>

      <article className="gagCard gagReminder">
        <div className="gagCardHead"><div><span className="eyebrow">MONTHLY</span><h2>แจ้งเตือนรายเดือน</h2></div></div>
        <div className="gagReminderFields"><label>วันที่<input type="number" min={1} max={28} value={reminder.day} onChange={(e) => setReminder((row) => ({ ...row, day: Math.max(1, Math.min(28, Number(e.target.value) || 1)) }))} /></label><label>ข้อความ<input value={reminder.note} onChange={(e) => setReminder((row) => ({ ...row, note: e.target.value }))} /></label></div>
        <div className="gagActions"><button onClick={() => setReminderState("บันทึก reminder แล้ว")}>บันทึก</button><button onClick={() => void enableNotifications()}>เปิดแจ้งเตือน</button><button disabled title="Gmail delivery จะเปิดเมื่อมี server-side Gmail connection ใน Web Dev">Gmail delivery</button></div>
        {reminderState && <small className="gagNotice">{reminderState}</small>}
      </article>
    </div>

    <article className="gagCard gagSessions">
      <div className="gagCardHead"><div><span className="eyebrow">SESSION BASE</span><h2>A–Z</h2></div><div className="gagQuick"><button onClick={() => quick("ChatGPT", "C", "https://chatgpt.com/")}>C · ChatGPT</button><button onClick={() => quick("Manus", "M", "https://manus.im/app")}>M · Manus</button><button onClick={() => quick("GitHub", "G", "https://github.com/Ogenicchocolate21debug/Build-Platform")}>G · GitHub</button></div></div>
      <div className="gagAlphabet">{LETTERS.map((letter) => <button key={letter} className={bucket === letter ? "active" : ""} onClick={() => setBucket(letter)}>{letter}<small>{sessions.filter((item) => item.bucket === letter).length || ""}</small></button>)}</div>
      <div className="gagSessionGrid">
        <div className="gagForm"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${bucket} · ชื่อ session`} /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="โน้ตสั้น ๆ" /><button disabled={!title.trim() || !/^https?:\/\//i.test(url.trim())} onClick={addSession}>+ เก็บใน {bucket}</button></div>
        <div className="gagSessionList">{visibleSessions.map((item) => <div key={item.id}><button className="gagSessionOpen" onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}><b>{item.title}</b><small>{item.note || new URL(item.url).hostname}</small></button><button className="gagDelete" onClick={() => setSessions((rows) => rows.filter((row) => row.id !== item.id))}>×</button></div>)}{!visibleSessions.length && <p>ยังไม่มี session ใน {bucket}</p>}</div>
      </div>
      <p className="gagHint">GAG เก็บลิงก์ session ที่มึงล็อก/แชร์ไว้ได้ แต่ browser sandbox ยังดึง session จาก ChatGPT app หรือแอปอื่นเข้ามาเองไม่ได้ · ไม่มี password/token ถูกเก็บใน GAG</p>
    </article>
  </section>;
}
