import {useCallback,useEffect,useState,type FormEvent} from "react";

type Actor = {agent_id:string;label:string;provider:string;readiness:string;planning_eligible:boolean;capabilities:string[]};
type PstackSkill={id:string;description:string;path:string;state:string};
type PstackNumber={number:number;id:string;categories:string[]};
type PstackCategory={id:string;label_th:string};
type PstackCatalog={ok:boolean;controller:string;authority:string;skill_count:number;agent_definition_count:number;execution_state:string;source_pin:string;skills:PstackSkill[];stable_numbers:PstackNumber[];task_categories:PstackCategory[]};
type PstackSelection={ok:boolean;code?:string;family?:string;capability?:string;selected?:Array<{id:string;path:string;hash:string}>;blue_agents?:Array<{id:string;provider:string;readiness:string;eligible_for_live_preflight:boolean}>;execution_state?:string};
type PstackLearningPlan={ok:boolean;skill_count:number;waves:Array<{wave:number;source_refs:Array<{id:string;hash:string}>}>;learning_state:string;agents:Array<{id:string;readiness:string;read_state:string}>};
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
  const [pstack,setPstack]=useState<PstackCatalog|null>(null);
  const [pstackQuery,setPstackQuery]=useState("");
  const [pstackCategory,setPstackCategory]=useState("");
  const [pstackError,setPstackError]=useState("");
  const [skillTask,setSkillTask]=useState("");
  const [skillSelection,setSkillSelection]=useState<PstackSelection|null>(null);
  const [skillLearning,setSkillLearning]=useState<PstackLearningPlan|null>(null);
  const [skillRouterBusy,setSkillRouterBusy]=useState(false);

  const load=useCallback(async()=>{
    try{
      const res=await fetch("/api/violet/distribution/roster",{credentials:"same-origin",cache:"no-store"});
      const body=await res.json().catch(()=>({}));
      if(!res.ok||!body.ok)throw Error(body.code||"BLUE_ROSTER_UNAVAILABLE");
      setActors(body.agents||[]);
    }catch(e){setError(e instanceof Error?e.message:"BLUE_ROSTER_UNAVAILABLE")}
  },[]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    let active=true;
    void fetch("/api/violet/pstack/catalog",{credentials:"same-origin",cache:"no-store"})
      .then(async(res)=>{const body=await res.json().catch(()=>({}));if(!res.ok||!body.ok)throw Error(body.code||"PSTACK_CATALOG_UNAVAILABLE");return body as PstackCatalog;})
      .then(data=>{if(active)setPstack(data)})
      .catch(err=>{if(active)setPstackError(err instanceof Error?err.message:"PSTACK_CATALOG_UNAVAILABLE")});
    return ()=>{active=false};
  },[]);
  const matchedSkills=pstack?.skills.filter((s)=>
    (!pstackCategory||pstack.stable_numbers?.some(x=>x.id===s.id&&x.categories.includes(pstackCategory)))&&
    (s.id.toLowerCase().includes(pstackQuery.toLowerCase())||
    s.description.toLowerCase().includes(pstackQuery.toLowerCase())))??[];


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
    <section className="wnCard" aria-label="Violet pstack complete skill source">
      <div className="wnCardHead"><div><span className="wnKicker">VIOLET · pstack portable</span><h3>Full Skill Library</h3></div>
        <span className="wnCount">{pstack? pstack.skill_count : "…"}</span></div>
      <p className="wnPolicy">Portable MIT source for compatible coding agents. Source present ≠ Agent executed. Violet routes, Yellow authorizes, Ruby verifies, Green remembers. No Cursor subscription needed.</p>

      <div className="wnForm" aria-label="Violet pstack Skill Intelligence">
        <label>What is your task? Violet will choose relevant Skills (no model call).
          <textarea value={skillTask} maxLength={600} rows={2}
            placeholder="e.g. investigate repeated CI bug or recover previous 1LSS context"
            onChange={e=>setSkillTask(e.target.value)}/>
        </label>
        <button className="wnPrimary" type="button" disabled={skillRouterBusy||skillTask.trim().length<3}
          onClick={async()=>{
            setSkillRouterBusy(true);setSkillSelection(null);
            try{
              const res=await fetch("/api/violet/pstack/select",{
                method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({task:skillTask,category:pstackCategory||undefined})});
              const body=await res.json() as PstackSelection;
              setSkillSelection(res.ok?body:{ok:false,code:body.code||"PSTACK_ROUTER_BLOCKED"});
            }catch{setSkillSelection({ok:false,code:"PSTACK_ROUTER_UNAVAILABLE"})}
            finally{setSkillRouterBusy(false)}
          }}>{skillRouterBusy?"Checking…":"Choose Skills (read-only)"}</button>
        {skillSelection&&<div className="wnPolicy" role="status">
          {skillSelection.ok?<>
            <strong>{skillSelection.family} · {skillSelection.execution_state}</strong>
            <p>Use: {skillSelection.selected?.map(x=>x.id).join(" + ")||"none"} · numbered proof in API</p>
            <p>Required Blue capability: {skillSelection.capability}</p>
            <p>Live Blue candidates: {skillSelection.blue_agents?.filter(x=>x.eligible_for_live_preflight).map(x=>x.id).join(", ")||"none verified"}</p>
            <small>Planning only: no agent has run, no Skill learning proven.</small>
          </>:<strong>{skillSelection.code}</strong>}
        </div>}
        <button type="button" disabled={skillRouterBusy} onClick={async()=>{
          setSkillRouterBusy(true);
          try{
            const res=await fetch("/api/violet/pstack/learning-plan",{credentials:"same-origin",cache:"no-store"});
            const data=await res.json() as PstackLearningPlan;
            if(!res.ok||!data.ok)throw Error("LEARNING_PLAN_UNAVAILABLE");
            setSkillLearning(data);
          }catch{setSkillLearning(null);setPstackError("LEARNING_PLAN_UNAVAILABLE")}
          finally{setSkillRouterBusy(false)}
        }}>View 51-skill learning syllabus (no AI cost)</button>
        {skillLearning&&<div className="wnPolicy">
          {skillLearning.skill_count} skills · {skillLearning.waves.length} waves · {skillLearning.learning_state}
          <p>{skillLearning.agents.length} registered agent identities · none certified as learned by this plan</p>
          <small>Provider source-read + independent Ruby receipt required before Green retention.</small>
        </div>}
      </div>
      {pstackError&&<div className="wnError" role="alert">{pstackError}</div>}
      {pstack&&<><p className="wnPolicy">Imported {pstack.skill_count} Skills + {pstack.agent_definition_count} Agent definitions · {pstack.execution_state} · automations inert</p>
        <label>Task category · Rule Stone → Violet
          <select value={pstackCategory} onChange={e=>setPstackCategory(e.target.value)}>
            <option value="">Automatic classification</option>
            {pstack.task_categories?.map(x=><option key={x.id} value={x.id}>{x.id} · {x.label_th}</option>)}
          </select>
        </label>
        <label>Search installed skill source
          <input type="search" value={pstackQuery} onChange={e=>setPstackQuery(e.target.value)} placeholder="e.g. swarm, recall, how" />
        </label>
        <div className="wnRows" style={{maxHeight:"320px",overflowY:"auto"}}>
          {matchedSkills.map((skill)=><div className="wnRow" key={skill.id}>
            <div><strong>#{pstack.stable_numbers?.find(x=>x.id===skill.id)?.number} · {skill.id}</strong>
            <span>{pstack.stable_numbers?.find(x=>x.id===skill.id)?.categories.join(" / ")}</span>
            <span>{skill.description||"Portable source available · not runtime verified"}</span></div>
            <a href={`https://github.com/Ogenicchocolate21debug/Build-Platform/blob/phase-vi-provider-incentive-metering/${skill.path}`}
              target="_blank" rel="noreferrer" aria-label={`View source for ${skill.id}`}>Source ↗</a>
          </div>)}
          {!matchedSkills.length&&<p className="wnPolicy">No matching skill.</p>}
        </div>
      </>}
    </section>
    <p className="wnPolicy">Rule Stone provides shared rules · Yellow alone approves execution · Ruby verifies · Green retains. CLAIMED ≠ RUNNING or DONE.</p>
  </section>;
}
