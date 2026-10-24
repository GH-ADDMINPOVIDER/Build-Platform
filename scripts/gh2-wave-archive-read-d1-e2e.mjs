// WAVE scoped ARCHIVE read E2E, GH1 is read-only historical source, never primary runner.
// Transport: GH2 OIDC/Infisical -> signed WAVE session -> ATHENA/YELLOW read_file -> D1 -> independent 1LSS events readback.
const BASE='https://wave.ogenicchocolate.com';
const key=String(process.env.OGENIC_OPS_KEY||'').trim();
const result={schema:'wave.legacy_archive.read_to_d1.v1',gha_sha:process.env.GITHUB_SHA||null,archive_source:'RP_STORE(OLD)',operator:'GH_ADDMIN_POVIDER',auth:'UNTESTED',command:'NOT_ATTEMPTED',d1_events_readback:'NOT_ATTEMPTED',archive_read_to_d1_e2e:false,gh2_host_e2e:false,global_seven_e2e:false};
const req=async(path,method,cookie,body)=>{const res=await fetch(BASE+path,{method,headers:{Accept:'application/json',Origin:BASE,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(18000)});return{http:res.status,json:await res.json().catch(()=>({}))};};
try{
 if(key.length<16){result.auth='OWNER_KEY_MISSING';}else{
 const sr=await req('/api/session','POST','',{owner_key:key});
 if(sr.http!==200||!sr.json.authenticated){result.auth='AUTH_DENIED_HTTP_'+sr.http;}else{
 const raw=await fetch(BASE+'/api/session',{method:'POST',headers:{Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify({owner_key:key}),signal:AbortSignal.timeout(15000)});
 const cookie=(raw.headers.get('set-cookie')||'').split(';')[0];
 if(!cookie.startsWith('ogenic_owner_session=')){result.auth='SESSION_COOKIE_UNAVAILABLE';}else{
 result.auth='SIGNED_OWNER_SESSION';
 const input={command:'Verify existing archival source through bounded read',mode:'read',capability:'read_file',provider:'github',environment:'staging',input:{path:'README.md'}};
 const cr=await req('/api/wave/command','POST',cookie,input);
 result.command='HTTP_'+cr.http+'_'+String(cr.json.code||cr.json.verification?.status||'UNKNOWN').slice(0,65);
 const obj=cr.json;const seq=Number(obj.canonical?.sequence||0);
 result.archive_file_sha=typeof obj.result?.sha==='string'?obj.result.sha.slice(0,45):null;
 result.archive_repository=typeof obj.result?.repository==='string'?obj.result.repository:null;
 result.canonical_sequence=Number.isSafeInteger(seq)&&seq>0?seq:null;
 result.verify_state=String(obj.verification?.status||'UNVERIFIED');
 if(cr.http===200&&obj.ok===true&&obj.verification?.status==='verified'&&obj.result?.repository==='Ogenicchocolate21debug/Build-Platform'&&result.canonical_sequence){
 const event=await req('/api/1lss/events?after_sequence='+Math.max(0,seq-1)+'&limit=30','GET',cookie);
 result.d1_events_readback='HTTP_'+event.http;
 const records=Array.isArray(event.json?.messages)?event.json.messages:[];
 result.readback_sequence_found=records.some(x=>Number(x.sequence_no||x.sequence||0)===seq&&typeof x.content==='string'&&x.content.includes(obj.result.sha));
 result.archive_read_to_d1_e2e=result.readback_sequence_found===true;
 }
 }
 }
 }
}catch{result.command='NETWORK_OR_RUNTIME_FAILED';}
console.log('WAVE_ARCHIVE_READ_TO_D1_PROOF='+JSON.stringify(result));
console.log('LEGACY_ARCHIVE_READ_ONLY=true; NO_COPILOT_OR_HOST_EXECUTION=true; NO_SECRET_OUTPUT=true');
if(!result.archive_read_to_d1_e2e)process.exitCode=22;
