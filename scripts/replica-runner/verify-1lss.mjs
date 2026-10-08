// OGE-95 / Stone Runner — stateful 1LSS write-read-replay probe.
// Local workerd and disposable D1 ONLY. Never target remote staging/production.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const base=process.env.REPLICA_URL||"http://127.0.0.1:8787";
const key=process.env.REPLICA_TEST_OPS_KEY||"";
if(!/^https?:\/\/127\.0\.0\.1:(8787|[0-9]{4,5})$/.test(base))
  throw new Error("LOCAL_LOOPBACK_RUNTIME_REQUIRED");
if(!key || key.length<32)throw new Error("EPHEMERAL_TEST_ACCESS_KEY_REQUIRED");
const run=String(process.env.GITHUB_RUN_ID||"local").slice(0,60);
const evidence={schema_version:"STONE_RUNNER_1LSS_LOCAL_V1",
  source_sha:process.env.GITHUB_SHA||"local",mode:"LOCAL_WORKER_DISPOSABLE_D1",
  live_stage_access:false,remote_d1_access:false,provider_calls:0,
  external_secrets_used:false,checks:{},status:"LOCAL_1LSS_NOT_PROVEN"};
const check=(name,pass,detail)=>{evidence.checks[name]=Boolean(pass);assert.ok(pass,name+": "+detail);};
const url=(p)=>base+p;
async function request(path,options={}){
  const r=await fetch(url(path),{...options,signal:AbortSignal.timeout(9000)});
  const body=await r.json().catch(()=>({}));
  return {status:r.status,body};
}
const headers={"x-ogenic-ops-key":key};
async function post(source,events,idempotency){
  return request("/api/1lss/event",{
    method:"POST",
    headers:{"Content-Type":"application/json",...headers,
      ...(idempotency?{"Idempotency-Key":idempotency}:{})},
    body:JSON.stringify({source_surface:source,events})
  });
}

try{
  // No secret/owner cookie in request: fail closed.
  const unauthorized=await request("/api/1lss/events?after_sequence=0");
  check("unauthorized_read_denied",unauthorized.status===401&&unauthorized.body.code==="REAUTH_REQUIRED",unauthorized.status);
  const baseline=await request("/api/1lss/events?after_sequence=0&limit=2",{headers});
  check("authorized_read",baseline.status===200&&baseline.body.conversation_id==="owner-main"&&
    baseline.body.session_line==="1LSS_OWNER_MAIN",baseline.status);
  const start=Number(baseline.body.latest_sequence||0);
  check("baseline_sequence_valid",Number.isSafeInteger(start)&&start>=0,start);
  const missing=await post("chatgpt-app",[{role:"user",content:"replica synthetic no idem "+run}],null);
  check("external_idempotency_required",missing.status===400&&missing.body.code==="IDEMPOTENCY_KEY_REQUIRED",missing.status);
  const id="oge95-stone-runner-fixture-"+run;
  const events=[{role:"user",content:"synthetic OGE95 local cross-surface input "+run},
    {role:"assistant",content:"synthetic OGE95 local reply "+run,model:"replica-fixture"}];
  const first=await post("chatgpt-app",events,id);
  const sequences=first.body.sequences||[];
  check("first_batch_write",first.status===201&&first.body.replayed_count===0&&sequences.length===2,first.status);
  check("sequence_monotonic",sequences[0]===start+1&&sequences[1]===start+2,JSON.stringify(sequences));
  const repeat=await post("chatgpt-app",events,id);
  check("retry_is_deduplicated",repeat.status===200&&repeat.body.replayed_count===2&&
    JSON.stringify(repeat.body.sequences)===JSON.stringify(sequences),repeat.status);
  const web=await post("ogenic-web",[{role:"user",content:"synthetic OGE95 web turn "+run}],id+"-web");
  check("cross_surface_continuity",web.status===201&&web.body.sequences?.[0]===start+3,web.status);
  const firstPage=await request("/api/1lss/events?after_sequence="+start+"&limit=2",{headers});
  check("cursor_page_one",firstPage.status===200&&firstPage.body.messages?.length===2&&
    firstPage.body.cursor===start+2&&firstPage.body.latest_sequence===start+3,firstPage.status);
  check("source_metadata_preserved",firstPage.body.messages.every(x=>x.source_surface==="chatgpt-app"),"source mismatch");
  const secondPage=await request("/api/1lss/events?after_sequence="+(start+2)+"&limit=2",{headers});
  check("cursor_page_two",secondPage.status===200&&secondPage.body.messages?.length===1&&
    secondPage.body.messages[0].sequence_no===start+3&&
    secondPage.body.messages[0].source_surface==="ogenic-web",secondPage.status);
  const secret=await post("chatgpt-app",[{role:"user",content:"password:synthetic123456789"}],id+"-secret");
  check("sensitive_content_rejected",secret.status===400&&secret.body.code==="SECRET_LIKE_CONTENT_REJECTED",secret.status);
  const final=await request("/api/1lss/events?after_sequence="+start+"&limit=10",{headers});
  check("replay_not_duplicated",final.status===200&&final.body.messages?.length===3&&
    final.body.latest_sequence===start+3,final.status);
  evidence.status="LOCAL_1LSS_PASS";
  evidence.message_sequence_start=start;
  evidence.message_sequence_after=start+3;
  evidence.source_surfaces=["chatgpt-app","ogenic-web"];
  evidence.unique_inserted=3;
  evidence.duplicate_retry_prevented=2;
}catch(e){
  evidence.status="LOCAL_1LSS_FAIL";
  evidence.error=String(e?.message||e).slice(0,250);
  process.exitCode=1;
}finally{
  evidence.checks_passed=Object.values(evidence.checks).filter(Boolean).length;
  evidence.checks_total=Object.keys(evidence.checks).length;
  writeFileSync("replica-1lss-evidence.json",JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks_passed+"/"+evidence.checks_total,
    remote_d1:false,provider_calls:0,artifact:"replica-1lss-evidence.json",error:evidence.error||null}));
}
