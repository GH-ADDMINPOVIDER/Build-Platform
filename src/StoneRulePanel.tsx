import { useEffect, useState, type CSSProperties } from "react";

type RuleRef = { category_id:string; description:string };
type StoneRule = { id:string; name:string; species:string; color:string; function:string; rules:RuleRef[] };
type RulePanelResponse = {
  ok?:boolean; code?:string; schema_version?:string; stone_count?:number;
  category_count?:number; mapped_category_count?:number;
  stones?:StoneRule[]; policy_flow?:string[];
  source_file?:string; execution_authority?:string; owner_decision_authority?:string; yellow_stone_role?:string;
  controls_all_seven?:boolean; runtime_enforcement_claimed?:boolean;
};
const fallbackNames = ["GREEN STONE","YELLOW STONE","BLUE DIAMOND","VIOLET STONE","RUBY STONE","STONE RUNNER","RULE STONE"];
export default function StoneRulePanel(){
  const [data,setData] = useState<RulePanelResponse>({});
  const [error,setError] = useState("");
  const [selected,setSelected] = useState("07");
  const [loading,setLoading] = useState(false);
  async function refresh(){
    setLoading(true);
    setError("");
    try {
      const r=await fetch("/api/rule-stone/panel",{credentials:"same-origin",cache:"no-store"});
      const b=await r.json().catch(()=>({}));
      if(!r.ok||!b.ok) throw new Error(b.code||"RULE_PANEL_HTTP_"+r.status);
      if(!Array.isArray(b.stones)||b.stones.length!==7||
        b.stones.some((stone:StoneRule,i:number)=>stone.name!==fallbackNames[i]))
        throw new Error("STONE_REGISTRY_MISMATCH");
      setData(b);
    }catch(e){setError(e instanceof Error?e.message:"RULE_PANEL_UNAVAILABLE")}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[]);
  const stones=data.stones||[];
  const active=stones.find((s)=>s.id===selected)||stones[6];
  return <section className="srPanel" aria-label="Rule Stone Panel for seven stones">
    <header className="srHead">
      <div><span className="wnKicker">07 · RULE STONE — GRAY AGATE</span><h3>Stone Rule Panel</h3>
      <p>One rule register for seven stones. The Owner decides; Yellow Stone supplies tools and adapters only.</p></div>
      <button type="button" onClick={()=>void refresh()} disabled={loading}>{loading?"Loading…":"Refresh rules"}</button>
    </header>
    {error && <div className="wnError" role="alert">{error} — no policy state was assumed.</div>}
    <div className="srSummary">
      <span><strong>{data.stone_count??"—"}</strong> stones governed</span>
      <span><strong>{data.mapped_category_count??"—"}/{data.category_count??"—"}</strong> rule categories mapped</span>
      <span><strong>{data.owner_decision_authority??"UNKNOWN"}</strong> Owner decision authority</span>
      <span><strong>{data.yellow_stone_role??"UNKNOWN"}</strong> Yellow tools role</span>
    </div>
    <div className="srStones">
      {stones.map(stone=><button type="button" key={stone.id}
        className={"srStone "+(selected===stone.id?"selected":"")}
        onClick={()=>setSelected(stone.id)} aria-pressed={selected===stone.id}>
        <span className="srGem" style={{"--stone-color":stone.color} as CSSProperties} aria-hidden="true">◆</span>
        <span><strong>{stone.id} · {stone.name}</strong><small>{stone.species} · {stone.function}</small></span>
        <span className="srCount">{stone.rules.length}</span>
      </button>)}
    </div>
    {active && <section className="srDetail" aria-live="polite">
      <h4>{active.name} — mapped rules</h4>
      {active.rules.map(rule=><p key={rule.category_id}><strong>{rule.category_id}</strong> {rule.description}</p>)}
    </section>}
    <footer className="srFoot">
      <p><strong>Authority:</strong> The Owner authorizes commands. Rule Stone owns rules, Yellow supplies scoped tools and adapters, Runner executes, Ruby verifies, and Green retains evidence. Legacy Yellow API IDs do not confer decision authority. This panel is read-only.</p>
      <p><strong>Source:</strong> <code>{data.source_file||"config/oge95-rules-center.json"}</code></p>
    </footer>
  </section>;
}
