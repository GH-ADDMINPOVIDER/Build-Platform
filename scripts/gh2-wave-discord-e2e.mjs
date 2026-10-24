// Staging-only live Discord provider loop through existing WAVE Owner-sign session.
// Two bounded test receipts: New Data -> wave-inbox/new-data; System Log -> workflow-log/system-log.
// No secrets/log contents emitted, no channel/bootstrap creation, no @mentions, no paid service.
import {createHash} from 'node:crypto';
const base='https://wave.ogenicchocolate.com';
const key=String(process.env.OGENIC_OPS_KEY||'').trim();
const result={schema:'wave.discord.provider_e2e.v1',source_sha:process.env.GITHUB_SHA,owner_session:'NOT_PROVEN',channels:'NOT_PROVEN',proofs:[],provider_send_get_e2e:false,d1_receipt:false,global_7_e2e:false};
const api=async(path,cookie,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(16000)});let b={};try{b=await r.json()}catch{}return{http:r.status,data:b};};
if(key.length>=16){
 try{const a=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({owner_key:key}),signal:AbortSignal.timeout(15000)});const b=await a.json().catch(()=>({}));const cookie=(a.headers.get('set-cookie')||'').split(';')[0];
 if(a.status===200&&b.authenticated===true&&cookie.startsWith('ogenic_owner_session=')){result.owner_session='SIGNED_OWNER_SESSION';
 const c=await api('/api/discord/channels',cookie);result.channels='HTTP_'+c.http;
 if(c.http===200&&Array.isArray(c.data.channels)){
 const available=c.data.channels.filter(x=>x.type===0||x.type===5||x.type===15);
 const targets=[{kind:'NEW_DATA',names:['new-data','wave-inbox']},{kind:'SYSTEM_LOG',names:['system-log','workflow-log']}];
 for(const t of targets){
  const target=t.names.map(n=>available.find(x=>x.name===n)).find(Boolean);
  if(!target){result.proofs.push({kind:t.kind,status:'REQUIRED_CHANNEL_NOT_FOUND'});continue;}
  const task='wave-discord-'+String(process.env.GITHUB_SHA||'').slice(0,12)+'-'+t.kind.toLowerCase();
  const content='WAVE / OGENIC | STAGING_ONLY | '+t.kind+' | task_id='+task+' | Owner-signed WAVE→Discord→GET readback | no secrets | no production action';
  const path='/api/discord/channels/'+target.id+'/messages';
  const prior=await api(path+'?limit=50',cookie);
  let existing=prior.http===200?(prior.data.messages||[]).find(m=>m.content===content):null;
  let posted='REUSED_EXISTING_RECEIPT';
  if(!existing){const created=await api(path,cookie,'POST',{content});posted='HTTP_'+created.http;existing=created.http===201?created.data.message:null;}
  if(!existing||!existing.id){result.proofs.push({kind:t.kind,channel:target.name,status:'SEND_FAILED_'+posted});continue;}
  const check=await api(path+'?limit=50',cookie);
  const echoed=check.http===200?(check.data.messages||[]).find(m=>m.id===existing.id&&m.content===content):undefined;
  result.proofs.push({kind:t.kind,channel:target.name,message_id:existing.id,content_sha256:createHash('sha256').update(content).digest('hex'),write:posted,readback_http:check.http,verified:!!echoed});
 }
 result.provider_send_get_e2e=result.proofs.length===2&&result.proofs.every(p=>p.verified===true);
 }
 }else result.owner_session='AUTH_DENIED_HTTP_'+a.status;
 }catch{result.owner_session='NETWORK_OR_PROVIDER_ERROR'}
}else result.owner_session='OWNER_KEY_NOT_BOUND';
console.log('WAVE_DISCORD_STAGING_E2E_RECEIPT='+JSON.stringify(result));
console.log('OWNER_SIGNED_NO_SECRET_OUTPUT=true; CHANNEL_BOOTSTRAP_NOT_EXECUTED=true; ALL_SEVEN_END_TO_END=NOT_CLAIMED');
