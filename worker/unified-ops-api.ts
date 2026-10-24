import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";

type Db = {prepare(sql:string):{all<T=Record<string,unknown>>():Promise<{results?:T[]}>}};
type Bindings=AuthBindings & {DB?:Db;DISCORD_TOKEN?:string;GITHUB_TOKEN?:string;OPENAI_API_KEY?:string;SLACK_BOT_TOKEN?:string;SLACK_WEBHOOK_URL?:string;STATUSPAGE_API_KEY?:string;ATLASSIAN_STATUSPAGE_API_KEY?:string};
type Env={Bindings:Bindings};
type Provider="codex"|"gh2"|"infisical";
export type OpsSelection="auto"|"solo"|"dual"|"triple";
export function selectOpsLane(raw:unknown,available:Provider[],preferred:Provider[]=[]){
 const request=typeof raw==="string"?raw:"auto";
 if(!["auto","solo","dual","triple"].includes(request))return{ok:false,code:"INVALID_MODE"} as const;
 const ordered:[Provider,Provider,Provider]=["codex","gh2","infisical"];
 const wanted=[...new Set(preferred)].filter(p=>ordered.includes(p));
 const pool=[...new Set([...wanted,...ordered])].filter(p=>available.includes(p));
 const size=request==="solo"?1:request==="dual"?2:request==="triple"?3:pool.length;
 const picked=pool.slice(0,size);
 return{ok:picked.length===size&&picked.length>0,requested_mode:request,selected:picked,needed:size,missing:size-picked.length,policy:"OWNER_ATHENA_PREEXEC_REQUIRED",can_execute:false,reason:"HOST_AND_PERMISSION_E2E_NOT_PROVEN"} as const;
}
export function createUnifiedOpsApi(){
 const app=new Hono<Env>();
 app.use("/api/ops/*",async(c,next)=>{
   if(!(await hasOwnerSession(c.req.raw,c.env)))return c.json({ok:false,code:"OWNER_SESSION_REQUIRED"},401);
   await next();
 });
 app.get("/api/ops/status",async c=>{
   const db=c.env.DB;
   if(!db)return c.json({ok:false,code:"D1_NOT_BOUND"},503);
   try{
     const [tasks,events]=await Promise.all([
       db.prepare("SELECT id,title,status,capability,claimed_by,updated_at FROM agent_tasks ORDER BY updated_at DESC LIMIT 18").all<Record<string,unknown>>(),
       db.prepare("SELECT id,task_id,event_type,actor,created_at FROM agent_events ORDER BY created_at DESC LIMIT 28").all<Record<string,unknown>>()
     ]);
     const rows=(events.results??[]).map(x=>({
       id:String(x.id??"").slice(0,160),
       task_id:String(x.task_id??"").slice(0,160),
       event_type:String(x.event_type??"").slice(0,120),
       actor:String(x.actor??"").slice(0,64),
       created_at:x.created_at??null
     }));
     const taskRows=(tasks.results??[]).map(x=>({
       id:String(x.id??"").slice(0,160),
       title:String(x.title??"").slice(0,150),
       status:String(x.status??"UNKNOWN").slice(0,40),
       capability:String(x.capability??"").slice(0,80),
       claimed_by:x.claimed_by?String(x.claimed_by).slice(0,64):null,
       updated_at:x.updated_at??null
     }));
     return c.json({ok:true,source:"D1_CANONICAL",checked_at:new Date().toISOString(),
       actor_capabilities:[
         {id:"codex",label:"Codex App Server",state:"HOST_E2E_UNVERIFIED",role_locked:false},
         {id:"gh2",label:"GH_ADDMIN_POVIDER",state:"CI_PROVEN_HOST_UNVERIFIED",role_locked:false},
         {id:"infisical",label:"Infisical OIDC",state:"OIDC_STAGING_PROVEN",role_locked:false}
       ],
       coordination:{modes:["auto","solo","dual","triple"],authority:"OWNER_ATHENA_YELLOW",role_locked:false,credential_escalation:false,all_system_e2e:false},
       notifications:[
         {id:"discord",state:c.env.DISCORD_TOKEN?"CREDENTIAL_BOUND_DELIVERY_UNVERIFIED":"CONFIGURATION_REQUIRED"},
         {id:"slack",state:c.env.SLACK_WEBHOOK_URL||c.env.SLACK_BOT_TOKEN?"CREDENTIAL_BOUND_DELIVERY_UNVERIFIED":"CONFIGURATION_REQUIRED"},
         {id:"atlassian_statuspage",state:c.env.STATUSPAGE_API_KEY||c.env.ATLASSIAN_STATUSPAGE_API_KEY?"CREDENTIAL_BOUND_DELIVERY_UNVERIFIED":"CONFIGURATION_REQUIRED"}
       ],
       tasks:taskRows,events:rows,
       note:"Display only sanitized D1 event metadata. Historical Orange/Green status is never inferred from tasks."
     },200,{"Cache-Control":"no-store"});
   }catch{
     return c.json({ok:false,code:"OPS_D1_READBACK_UNAVAILABLE"},503,{"Cache-Control":"no-store"});
   }
 });
 app.post("/api/ops/plan",async c=>{
   const origin=c.req.header("origin");
   if(origin&&origin!==new URL(c.req.url).origin)return c.json({ok:false,code:"ORIGIN_DENIED"},403);
   const body=await c.req.json<{mode?:unknown;preferred?:unknown;intent?:unknown}>().catch(()=>null);
   const intent=typeof body?.intent==="string"?body.intent.trim().slice(0,600):"";
   if(!intent)return c.json({ok:false,code:"INTENT_REQUIRED"},400);
   if(/(?:password|private.key|secret|bearer\s+\S+|api[_ -]?key|token)\s*[:=]/i.test(intent))return c.json({ok:false,code:"CREDENTIAL_INPUT_FORBIDDEN"},400);
   const preferred=Array.isArray(body?.preferred)?body.preferred.filter((x):x is Provider=>x==="codex"||x==="gh2"||x==="infisical"):[];
   // Real GH2 runner and OCIAN signed-in Codex absent: do not label them READY because credentials exist.
   const result=selectOpsLane(body?.mode,["infisical"],preferred);
   return c.json({ok:true,plan_only:true,requires_owner_athena:true,
     execution:{status:"NOT_STARTED",allowed:false,reason:"GH2_OCIAN_RUNTIME_UNVERIFIED"},
     selected:result.selected,mode:result.requested_mode,needed:result.needed,missing:result.missing,
     task_preview:intent,
     next_execution_route:"/api/wave/command",
     security:"Only existing Owner-signed WAVE/ATHENA route may execute. No root shell granted."
   },200,{"Cache-Control":"no-store"});
 });
 return app;
}
