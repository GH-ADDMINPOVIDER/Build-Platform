// WAVE OPS notifier: read real canonical D1 1LSS event metadata, dispatch deduplicated two-channel Discord receipt.
// Staging only. No raw chat content, user prompts, private keys or usernames are forwarded.
import {createHash} from "node:crypto";
const base="https://wave.ogenicchocolate.com";
const source="GH_ADDMIN_POVIDER";
const key=String(process.env.OGENIC_OPS_KEY||"").trim();
const report={schema:"wave.ops.notification.e2e.v1",source:"WAVE_D1_1LSS",scope:"GH2_STAGING_ACTION_PUSH",owner_session:"UNTESTED",d1_events:"UNTESTED",discord:{},atlassian_statuspage:"NOT_POSTED",slack:"NOT_CONNECTED_IN_THIS_JOB",major7_full_e2e:false,delivered_two_channels:false};
const req=async(path,cookie,method="GET",body)=>{
 const r=await fetch(base+path,{method,headers:{Origin:base,Accept:"application/json","Content-Type":"application/json",Cookie:cookie},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(18000)});
 return{http:r.status,json:await r.json().catch(()=>({}))};
};
const safe=(v,max=42)=>String(v??"").replace(/[^a-zA-Z0-9_.:/-]/g,"_").slice(0,max);
try {
 if(key.length<16)throw Error("OWNER_KEY_NOT_BOUND");
 const ar=await fetch(base+"/api/session",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({owner_key:key}),signal:AbortSignal.timeout(17000)});
 const auth=await ar.json().catch(()=>({}));
 const cookie=(ar.headers.get("set-cookie")||"").split(";")[0];
 if(ar.status!==200||auth.authenticated!==true||!cookie.startsWith("ogenic_owner_session="))throw Error("OWNER_SIGNED_SESSION_BLOCKED");
 report.owner_session="PASS";
 const index=await req("/api/1lss/events?after_sequence=0&limit=1",cookie);
 if(index.http!==200||index.json.ok!==true)throw Error("D1_1LSS_NOT_AVAILABLE");
 const tip=Number(index.json.latest_sequence||0);
 if(!Number.isSafeInteger(tip)||tip<1)throw Error("D1_TIP_INVALID");
 const events=await req("/api/1lss/events?after_sequence="+Math.max(0,tip-12)+"&limit=15",cookie);
 if(events.http!==200||!Array.isArray(events.json.messages))throw Error("D1_INDEPENDENT_GET_FAILED");
 const receipt=events.json.messages.filter(x=>Number(x.sequence_no)>0).slice(-6).map(x=>
   safe(x.sequence_no,8)+":"+safe(x.source_surface,28)+":"+safe(x.role,12)).join(", ");
 report.d1_events="PASS";report.latest_sequence=tip;report.metadata_events_count=events.json.messages.length;
 const dash=await req("/api/dashboard",cookie);
 const tasks=Array.isArray(dash.json?.tasks)?dash.json.tasks:[];
 const active=tasks.filter(t=>!["DONE","COMPLETED","SUCCESS","CANCELLED","FAILED"].includes(String(t.status||"").toUpperCase())).slice(0,4);
 report.dashboard_http=dash.http;report.active_tasks=active.length;
 const lines=[
   "WAVE OPS WATCH | INVESTIGATING | STAGING",
   "source=D1/1LSS | d1_tip="+tip+" | GH2="+safe(process.env.GITHUB_SHA,12),
   "active_tasks="+active.length+" ["+active.map(t=>safe(t.capability||t.id,34)+"="+safe(t.status,20)).join(", ")+"]",
   "recent_events="+receipt,
   "Codex/GH2/Infisical=CAPABILITY_POOL | Owner/ATHENA execution gate",
   "host_runner_or_app_server_runtime=NOT_IN_THIS_PROOF",
   "seven_major_e2e=NOT_VERIFIED_FULL | Statuspage=NOT_UPDATED",
   "run=https://github.com/Wave-Runner-2/Build-Platform/actions/runs/"+safe(process.env.GITHUB_RUN_ID,20)
 ];
 const content=lines.join("\n").slice(0,1800);
 report.content_sha256=createHash("sha256").update(content).digest("hex");
 const rooms=await req("/api/discord/channels",cookie);
 if(rooms.http!==200||!Array.isArray(rooms.json.channels))throw Error("DISCORD_CHANNELS_BLOCKED");
 for(const ch of ["wave-inbox","workflow-log"]){
   const room=rooms.json.channels.find(c=>c.name===ch&&[0,5,15].includes(c.type));
   if(!room){report.discord[ch]="CHANNEL_MISSING";continue;}
   const path="/api/discord/channels/"+encodeURIComponent(room.id)+"/messages";
   const before=await req(path+"?limit=50",cookie);
   let matched=Array.isArray(before.json.messages)?before.json.messages.find(m=>String(m.content||"").includes("WAVE OPS WATCH")&&String(m.content||"").includes("d1_tip="+tip)):null;
   let posted=0;
   if(!matched){
     const out=await req(path,cookie,"POST",{content});
     posted=out.http;
     matched=out.json?.message||out.json;
   }
   if(!matched?.id){report.discord[ch]="POST_FAILED_"+posted;continue;}
   const readback=await req(path+"?limit=50",cookie);
   const echoed=readback.http===200&&Array.isArray(readback.json.messages)&&readback.json.messages.some(m=>m.id===matched.id&&String(m.content||"").includes("d1_tip="+tip));
   report.discord[ch]=echoed?(posted===0?"PASS_DEDUP_READBACK":"PASS_POST_GET"):"FAILED_READBACK";
   report.discord[ch+"_message_id"]=matched.id;
   report.discord[ch+"_post_http"]=posted||"DEDUP";
   report.discord[ch+"_get_http"]=readback.http;
 }
 report.delivered_two_channels=["wave-inbox","workflow-log"].every(c=>String(report.discord[c]).startsWith("PASS"));
} catch(e){report.failure=String(e?.message||"ERROR").slice(0,90)}
console.log("WAVE_OPS_DISCORD_ALERT_PROOF="+JSON.stringify(report));
console.log("OWNER_KEY_REDACTED_NO_D1_CONTENT_EXPORTED_NO_STATUSPAGE_FALSE_RESOLVED=true");
if(!report.delivered_two_channels)process.exitCode=62;
