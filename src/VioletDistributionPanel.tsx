import {useCallback,useEffect,useState,type FormEvent} from "react";

type Actor = {agent_id:string;label:string;provider:string;readiness:string;planning_eligible:boolean;capabilities:string[]};
type Planned = {task_id:string;capability:string;agent_id?:string;status:string;depends_on?:string[]};
type Plan = {ok?:boolean;code?:string;assignments?:Planned[];queue?:Planned[];
  planned_count?:number;waiting_count?:number;execution_authority?:string;planning_only?:boolean};
type Claim = {ok?:boolean;code?:string;task_id?:string;status?:string;execution_dispatched?:boolean;next?:string};
export default function VioletDistributionPanel(){
  const [actors,setActors]=useState<Actor[]>([]);
  const [taskId,setTaskId]=useState("");
  const [capability,setCapability]=useState("read_file");
  const [preferred,setPreferred]=useState("");
  const [plan,setPlan]=useState<Plan|null>(null);
  const [claim,setClaim]=useState<Claim|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    try{
      const res=await fetch("/api/violet/distribution/roster",{credentials:"same-origin",cache:"no-store"});
      const body=await res.json().catch(()=>({}));
      if(!res.ok||!body.ok)throw Error(body.code||"BLUE_ROSTER_UNAVAILABLE");
      setActors(body.agents||[]);
    }catch(e){setError(e instanceof Error?e.message:"BLUE_ROSTER_UNAVAILABLE")}
  },[]);
  useEffect(()=>{void load()},[load]);

  async function runPlan(e:FormEvent){
    e.preventDefault();setError("");setPlan(null);setClaim(null);setBusy(true);
    try{
      const r=await fetch("/api/violet/distribution/plan",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({strategy:"parallel",max_parallel:1,tasks:[{
          task_id:taskId.trim(),capability, ...(preferred?{preferred_agent_id:preferred}:{})
        }]})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok||!b.ok)throw Error(b.code||"VIOLET_PLAN_UNAVAILABLE");
      setPlan(b);
    }catch(e){setError(e instanceof Error?e.message:"VIOLET_PLAN_UNAVAILABLE")}
    finally{setBusy(false)}
  }
  async function reserve(item:Planned){
    if(!item.agent_id||item.status!=="PLANNED_AWAITING_YELLOW")return;
    setBusy(true);setError("");setClaim(null);
    try{
      const r=await fetch("/api/violet/distribution/claim",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task_id:item.task_id,agent_id:item.agent_id})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok||!b.ok)throw Error(b.code||"VIOLET_CLAIM_FAILED");
      setClaim(b);
      setPlan(null);
    }catch(e){setError(e instanceof Error?e.message:"VIOLET_CLAIM_FAILED")}
    finally{setBusy(false)}
  }
  return <section className="wnCard" aria-label="Violet distribution control">
    <div className="wnCardHead"><div><span className="wnKicker">04 · VIOLET → 03 · BLUE</span><h3>Agent Work Distribution</h3></div>
      <span className="wnCount">{actors.filter(a=>a.planning_eligible).length}/{actors.length}</span></div>
    <p className="wnBody">Assign an existing queued D1 task by capability. Violet checks Blue's registered agents and current task occupancy before any reservation. This does not invoke agents or authorize paid calls.</p>
    {error&&<div className="wnError" role="alert">{error}</div>}
    <form onSubmit={runPlan} className="wnForm">
      <label>Existing task ID
        <input value={taskId} onChange={e=>setTaskId(e.target.value)}
          placeholder="e.g. OGE-98" required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9_.:-]*" />
      </label>
      <label>Capability
        <select value={capability} onChange={e=>setCapability(e.target.value)}>
          {["read_file","write_file","test","build","code_review","context_load","reasoning","runtime_verify"].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Preferred Blue agent
        <select value={preferred} onChange={e=>setPreferred(e.target.value)}>
          <option value="">Select suitable agent automatically</option>
          {actors.filter(a=>a.capabilities.includes(capability)).map(a=><option key={a.agent_id} value={a.agent_id}>
            {a.label} · {a.readiness}{!a.planning_eligible?" · not executable":""}
          </option>)}
        </select>
      </label>
      <button type="submit" className="wnPrimary" disabled={busy||!taskId.trim()}>{busy?"Checking…":"Plan via Violet"}</button>
    </form>
    {plan&&<div className="wnRows">
      <div className="wnPolicy">Plan only · {plan.planned_count||0} eligible · {plan.waiting_count||0} waiting · {plan.execution_authority}</div>
      {(plan.assignments||[]).map(a=><div className="wnRow" key={a.task_id}>
        <div><strong>{a.task_id} → {a.agent_id}</strong><span>{a.capability} · {a.status}</span></div>
        <button disabled={busy||a.status!=="PLANNED_AWAITING_YELLOW"} onClick={()=>void reserve(a)}>Claim task</button>
      </div>)}
      {(plan.queue||[]).map(a=><div className="wnRow" key={a.task_id}>
        <div><strong>{a.task_id} · waiting</strong><span>{a.status}</span></div>
      </div>)}
    </div>}
    {claim&&<div className="wnPolicy" role="status">Task {claim.task_id} → {claim.status}. Execution dispatched: {String(claim.execution_dispatched===true)}. Yellow approval and Ruby proof still required.</div>}
    <p className="wnPolicy">Rule Stone provides shared rules · Yellow alone approves execution · Ruby verifies · Green retains. CLAIMED ≠ RUNNING or DONE.</p>
  </section>;
}
