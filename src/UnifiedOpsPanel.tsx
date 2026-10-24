import { FormEvent,useCallback,useEffect,useState } from "react";
type Actor={id:string;label:string;state:string;role_locked:boolean};
type Event={id:string;task_id:string;event_type:string;actor:string;created_at:unknown};
type Task={id:string;title:string;status:string;capability:string;claimed_by:string|null;updated_at:unknown};
type Sink={id:string;state:string};
type State={ok:boolean;checked_at:string;actor_capabilities:Actor[];events:Event[];tasks:Task[];notifications:Sink[];coordination:{modes:string[]};code?:string};
type Plan={ok:boolean;plan_only:boolean;selected:string[];mode:string;needed:number;missing:number;execution:{status:string;allowed:boolean;reason:string};code?:string};
function when(x:unknown){if(!x)return"—";const d=new Date(String(x));return Number.isNaN(d.valueOf())?String(x):d.toLocaleString("th-TH",{dateStyle:"short",timeStyle:"medium"})}
export default function UnifiedOpsPanel(){
 const [state,setState]=useState<State|null>(null);
 const [error,setError]=useState("");
 const [working,setWorking]=useState(false);
 const [mode,setMode]=useState("auto");
 const [preferred,setPreferred]=useState<string[]>(["codex","gh2","infisical"]);
 const [intent,setIntent]=useState("");
 const [plan,setPlan]=useState<Plan|null>(null);
 const refresh=useCallback(async()=>{
   try {
     const r=await fetch("/api/ops/status",{credentials:"same-origin",cache:"no-store"});
     const j=await r.json().catch(()=>({}));
     if(!r.ok||j.ok!==true)throw Error(String(j.code||"STATUS_NOT_AVAILABLE"));
     setState(j as State);setError("");
   }catch(e){setError(e instanceof Error?e.message:"STATUS_NOT_AVAILABLE")}
 },[]);
 useEffect(()=>{void refresh();const id=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},15000);return()=>window.clearInterval(id)},[refresh]);
 async function submit(e:FormEvent){
   e.preventDefault();if(!intent.trim())return;
   setWorking(true);setPlan(null);
   try{
     const r=await fetch("/api/ops/plan",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,intent:intent.trim(),preferred})});
     const j=await r.json().catch(()=>({}));
     if(!r.ok||!j.ok)throw Error(String(j.code||"PLAN_UNAVAILABLE"));
     setPlan(j as Plan);
   }catch(e){setError(e instanceof Error?e.message:"PLAN_UNAVAILABLE")}
   finally{setWorking(false)}
 }
 const toggled=(id:string)=>setPreferred(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
 return <section className="woPanel" aria-label="WAVE unified operations">
  <div className="woHead">
   <div><small>UNIFIED OPERATIONS · STAGING</small><h3>Codex + GH2 + Infisical</h3><p>Dynamic capabilities · Owner / ATHENA authority · D1 canonical event stream</p></div>
   <button onClick={()=>void refresh()} type="button">Refresh log</button>
  </div>
  <div className="woActors" aria-label="Runtime capability readiness">
   {(state?.actor_capabilities||[{id:"codex",label:"Codex App Server",state:"NOT_MEASURED",role_locked:false},{id:"gh2",label:"GH_ADDMIN_POVIDER",state:"NOT_MEASURED",role_locked:false},{id:"infisical",label:"Infisical OIDC",state:"NOT_MEASURED",role_locked:false}]).map(a=><div key={a.id} className="woActor"><b>{a.label}</b><span>{a.state}</span></div>)}
  </div>
  <form className="woForm" onSubmit={submit}>
   <div className="woLabel">Execution grouping (no locked roles)</div>
   <div className="woModes" role="group" aria-label="Operation mode">{["auto","solo","dual","triple"].map(m=><button type="button" key={m} aria-pressed={mode===m} className={mode===m?"selected":""} onClick={()=>setMode(m)}>{m.toUpperCase()}</button>)}</div>
   <div className="woTools" role="group" aria-label="Preferred tools">{[["codex","Codex"],["gh2","GitHub 2"],["infisical","Infisical"]].map(([id,label])=><label key={id}><input type="checkbox" checked={preferred.includes(id)} onChange={()=>toggled(id)}/>{label}</label>)}</div>
   <label className="woLabel" htmlFor="woInstruction">Owner instruction / operation request</label>
   <textarea id="woInstruction" rows={2} maxLength={600} value={intent} onChange={e=>setIntent(e.target.value)} placeholder="ตรวจ Runtime → เลือก capability ที่พร้อม → ตรวจผลและบันทึก D1" />
   <div className="woFormFoot"><span>Owner Key ใช้ยืนยันตัวตนในหน้า Login ด้านบน ไม่บันทึกลง Task หรือ Log</span><button disabled={working||!intent.trim()} type="submit">{working?"Planning…":"Plan securely"}</button></div>
  </form>
  {plan&&<div className="woPlan" role="status"><b>Plan: {plan.mode.toUpperCase()}</b><div>Selected: {plan.selected.join(" + ")||"none"} · Missing: {plan.missing}</div><div>Execution: {plan.execution?.status} — {plan.execution?.reason}</div><small>คำสั่งที่มีผลจริงต้องผ่าน WAVE Command / ATHENA อีกครั้ง; ระบบไม่แปลง Plan เป็นการสั่งรันเอง</small></div>}
  <div className="woNotifications"><b>Notification channels</b><div>{(state?.notifications||[{id:"discord",state:"NOT_MEASURED"},{id:"slack",state:"NOT_MEASURED"},{id:"atlassian_statuspage",state:"NOT_MEASURED"}]).map(s=><span key={s.id}>{s.id}: {s.state}</span>)}</div></div>
  <div className="woLogHead"><h4>Execution timeline · D1</h4><small>Auto refresh 15s while visible · {when(state?.checked_at)}</small></div>
  {error&&<div className="woError" role="alert">Live API: {error}. This panel is not proof of deployment or connection.</div>}
  <div className="woEvents">
   {(state?.events||[]).slice(0,15).map(e=><div className="woEvent" key={e.id}><span>{when(e.created_at)}</span><div><b>{e.event_type}</b><small>{e.actor} · {e.task_id||"system"}</small></div></div>)}
   {!state?.events?.length&&<p className="woEmpty">No verified D1 events loaded. No fabricated process status.</p>}
  </div>
  <div className="woFoot"><a href="https://github.com/Wave-Runner-2/Build-Platform/actions" target="_blank" rel="noreferrer">GH2 Actions ↗</a><a href="https://linear.app/ogenic-sio/issue/OGE-130" target="_blank" rel="noreferrer">7 workstreams ↗</a><span>Full 7/7 E2E: NOT VERIFIED</span></div>
 </section>;
}
