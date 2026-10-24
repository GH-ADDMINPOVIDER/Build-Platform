// One bounded OWNER-approved API inference, live WAVE/D1 receipt, Discord readback and optional Slack/Statuspage.
import {createHash} from "node:crypto";
const base="https://wave.ogenicchocolate.com";
const env=process.env;
const report={schema:"wave.unified.ops.api_e2e.v1",source:"GH_ADDMIN_POVIDER",staging:true,roles_unlocked:true,mode:"solo",selected:["openai_api"],execution:"NOT_STARTED",openai_model:"gpt-4.1-mini",openai_http:null,openai_usage:null,owner_signed:false,d1_sequence:null,d1_readback:false,discord_new_data:false,discord_system_log:false,slack:"NOT_CONFIGURED_OR_NOT_SENT",statuspage:"NOT_CONFIGURED_OR_NOT_READ",all_system_e2e:false};
const timeout=15000;
async function fetchJson(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});return {status:response.status,data:await response.json().catch(()=>({})),headers:response.headers}}
function digest(text){return createHash("sha256").update(text).digest("hex")}
function cleanError(label){return String(label||"ERROR").replace(/[^A-Z0-9_]/ig,"_").slice(0,65)}
function extractText(data){return (Array.isArray(data.output)?data.output:[]).flatMap(x=>Array.isArray(x.content)?x.content:[]).filter(x=>x.type==="output_text").map(x=>String(x.text||"")).join("").trim()}
async function session(){
 const r=await fetchJson(base+"/api/session",{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({owner_key:env.OGENIC_OPS_KEY})});
 const cookie=(r.headers.get("set-cookie")||"").split(";")[0];
 if(r.status!==200||!r.data.authenticated||!cookie.startsWith("ogenic_owner_session="))throw Error("OWNER_SESSION_NOT_SIGNED");
 return cookie
}
const api=(path,cookie,method="GET",body,headers={})=>fetchJson(base+path,{method,headers:{"Content-Type":"application/json",Origin:base,Cookie:cookie,...headers},body:body?JSON.stringify(body):undefined});
async function deliverDiscord(cookie,channel,content){
 const list=await api("/api/discord/channels",cookie);
 const target=list.data?.channels?.find(x=>x.name===channel&&x.type===0);
 if(!target)return {ok:false,reason:"CHANNEL_UNAVAILABLE"};
 const route="/api/discord/channels/"+encodeURIComponent(target.id)+"/messages";
 const post=await api(route,cookie,"POST",{content});
 const id=post.data?.message?.id;
 if(post.status!==201||!id)return {ok:false,reason:"POST_NOT_VERIFIED"};
 const read=await api(route+"?limit=35",cookie);
 return {ok:read.status===200&&Array.isArray(read.data.messages)&&read.data.messages.some(x=>x.id===id&&x.content===content),id};
}
try{
 if(env.GITHUB_REPOSITORY!=="Wave-Runner-2/Build-Platform"||env.GITHUB_REF_NAME!=="feat/ccs-multi-protocol-docker-20261023")throw Error("NOT_GH2_STAGING");
 if(!env.OPENAI_API_KEY||!env.OGENIC_OPS_KEY)throw Error("OPENAI_OR_OWNER_BINDING_MISSING");
 // Single deliberately tiny paid operation: no agent loop, no tool calls, no fallbacks.
 const ai=await fetchJson("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4.1-mini",input:"Reply with exactly WAVE_UNIFIED_OPS_API_PROOF_OK (no explanation).",max_output_tokens:32,tools:[],store:false})});
 report.openai_http=ai.status;
 report.openai_usage=ai.data?.usage?{input_tokens:ai.data.usage.input_tokens??null,output_tokens:ai.data.usage.output_tokens??null,total_tokens:ai.data.usage.total_tokens??null}:null;
 const aiText=extractText(ai.data);
 if(ai.status!==200||!aiText.includes("WAVE_UNIFIED_OPS_API_PROOF_OK"))throw Error("OPENAI_ACTUAL_OUTPUT_UNVERIFIED");
 report.execution="OPENAI_RESPONSES_ACTUAL_INFERENCE_PASS";
 const cookie=await session();report.owner_signed=true;
 const content="WAVE UNIFIED OPS | GH2 staging | OpenAI API responses actual inference PASS | mode=solo | model=gpt-4.1-mini | result_sha256="+digest(aiText)+" | no secrets or prompt saved | host_codex_e2e=NOT_PROVEN";
 const key="wave-ops-"+digest(content).slice(0,48);
 const posted=await api("/api/1lss/event",cookie,"POST",{source_surface:"plugin-harness",events:[{role:"system",content}]},{"Idempotency-Key":key});
 const sequence=Number(posted.data?.sequences?.[0]||0);
 if(![200,201].includes(posted.status)||!posted.data?.ok||sequence<1)throw Error("D1_EVENT_WRITE_FAILED");
 report.d1_sequence=sequence;
 const got=await api("/api/1lss/events?after_sequence="+Math.max(0,sequence-1)+"&limit=40",cookie);
 report.d1_readback=got.status===200&&Array.isArray(got.data?.messages)&&got.data.messages.some(x=>Number(x.sequence_no)===sequence&&x.text===content);
 if(!report.d1_readback)throw Error("D1_INDEPENDENT_READBACK_FAILED");
 const dataLog="WAVE NEW DATA | GH2 + OpenAI small paid E2E | D1 seq "+sequence+" | sha256 "+digest(content)+" | status VERIFIED_SCOPE_ONLY";
 const systemLog="WAVE SYSTEM LOG | OPENAI_RESPONSE_VERIFIED → OWNER_SESSION → D1_READBACK → DISCORD | D1 seq "+sequence+" | 7/7_full=NOT_PROVEN";
 const [nd,sl]=await Promise.all([deliverDiscord(cookie,"wave-inbox",dataLog),deliverDiscord(cookie,"workflow-log",systemLog)]);
 report.discord_new_data=nd.ok;report.discord_system_log=sl.ok;
 report.discord_message_ids={new_data:nd.id||null,system_log:sl.id||null};
 if(env.SLACK_WEBHOOK_URL&&/^https:\/\/hooks\.slack\.com\/services\//.test(env.SLACK_WEBHOOK_URL)){
   try{const r=await fetch(env.SLACK_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"WAVE GH2 STAGING — "+systemLog}),signal:AbortSignal.timeout(10000)});
       report.slack=r.ok?"POST_HTTP_2XX":"WEBHOOK_HTTP_"+r.status}catch{report.slack="WEBHOOK_NETWORK_FAILURE"}
 }else if(env.SLACK_BOT_TOKEN&&env.SLACK_CHANNEL_ID){
   try{const r=await fetchJson("https://slack.com/api/chat.postMessage",{method:"POST",headers:{Authorization:"Bearer "+env.SLACK_BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({channel:env.SLACK_CHANNEL_ID,text:systemLog})});report.slack=r.data?.ok?"BOT_MESSAGE_SENT":"SLACK_API_REJECTED"}catch{report.slack="SLACK_NETWORK_FAILED"}
 }
 if((env.STATUSPAGE_API_KEY||env.ATLASSIAN_STATUSPAGE_API_KEY)&&env.STATUSPAGE_PAGE_ID){
   try{const r=await fetchJson("https://api.statuspage.io/v1/pages/"+encodeURIComponent(env.STATUSPAGE_PAGE_ID),{headers:{Authorization:"OAuth "+(env.STATUSPAGE_API_KEY||env.ATLASSIAN_STATUSPAGE_API_KEY)}});report.statuspage=r.status===200?"PAGE_READ_HTTP_200_NO_INCIDENT_MODIFICATION":"READ_HTTP_"+r.status}catch{report.statuspage="READ_NETWORK_FAILED"}
 }
 report.scope_e2e=report.d1_readback&&report.discord_new_data&&report.discord_system_log;
 report.all_system_e2e=false;
}catch(e){report.failure=cleanError(e?.message);report.scope_e2e=false}
console.log("WAVE_UNIFIED_OPS_REAL_E2E="+JSON.stringify(report));
console.log("API_SPEND_ONE_BOUNDED_MODEL_CALL; NO_HOST_COMMAND_OR_PRODUCTION_DEPLOY; NO_API_KEY_OUTPUT");
if(!report.scope_e2e)process.exitCode=39;
