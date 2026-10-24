// Scoped staging proof: authorized Linear provider GET issue -> owner-signed WAVE 1LSS/D1 -> independent GET readback.
import {createHash} from 'node:crypto';
const linearKey=String(process.env.LINEAR_API_KEY||process.env.LINEAR_TOKEN||'').trim(),ownerKey=String(process.env.OGENIC_OPS_KEY||'').trim();
const base='https://wave.ogenicchocolate.com';
const result={schema:'wave.linear.source_to_d1.v1',linear_provider:'NOT_ATTEMPTED',source_issue:'OGE-130',owner_sign:'NOT_ATTEMPTED',d1_write:'NOT_ATTEMPTED',d1_readback:'NOT_ATTEMPTED',provider_to_d1_e2e:false,manus_bridge_e2e:false,global_seven_e2e:false};
const api=async(path,cookie,method='GET',body,key)=>{const r=await fetch(base+path,{method,headers:{Origin:base,Accept:'application/json','Content-Type':'application/json',Cookie:cookie,...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(18000)});return{http:r.status,data:await r.json().catch(()=>({}))}};
try{
 if(linearKey.length<12||ownerKey.length<16){result.linear_provider='MISSING_WORKLOAD_CREDENTIAL';throw Error('CREDENTIAL_MISSING')}
 const lr=await fetch('https://api.linear.app/graphql',{method:'POST',headers:{Authorization:linearKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:'query($id:String!){issue(id:$id){id identifier updatedAt url state{name}}}',variables:{id:'OGE-130'}}),signal:AbortSignal.timeout(18000)});
 const lj=await lr.json().catch(()=>({}));const issue=lj?.data?.issue;
 if(lr.status!==200||!issue||issue.identifier!=='OGE-130'||!issue.id){result.linear_provider='ERROR_HTTP_'+lr.status;throw Error('LINEAR_PROVIDER_READ_FAILED')}
 result.linear_provider='ISSUE_READ_200';result.linear_updated_at=issue.updatedAt;result.linear_state=issue.state?.name||null;
 const ar=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({owner_key:ownerKey}),signal:AbortSignal.timeout(16000)});
 const a=await ar.json().catch(()=>({}));const cookie=(ar.headers.get('set-cookie')||'').split(';')[0];
 if(ar.status!==200||!a.authenticated||!cookie.startsWith('ogenic_owner_session=')){result.owner_sign='BLOCKED';throw Error('AUTH_FAILED')}
 result.owner_sign='PASS';
 const content='LINEAR_LIVE_SOURCE_VERIFIED | OGE-130 | issue_id='+issue.id+' | updated_at='+String(issue.updatedAt||'')+' | state='+String(issue.state?.name||'')+' | WAVE_D1_READBACK_STAGING | no private issue body';
 const hash=createHash('sha256').update(content).digest('hex');
 const posted=await api('/api/1lss/event',cookie,'POST',{source_surface:'plugin-harness',events:[{role:'system',content}]},'linear-oge130-'+hash.slice(0,48));
 const seq=Number(posted.data?.sequences?.[0]||0);result.d1_write='HTTP_'+posted.http;result.sequence=seq||null;result.sha256=hash;
 if(!posted.data?.ok||!(seq>0)){throw Error('D1_PERSISTENCE_NOT_VERIFIED')}
 const get=await api('/api/1lss/events?after_sequence='+Math.max(0,seq-1)+'&limit=25',cookie);
 const match=get.http===200&&Array.isArray(get.data.messages)&&get.data.messages.some(x=>Number(x.sequence_no)===seq&&x.text===content);
 result.d1_readback=match?'PASS':'FAILED';
 result.provider_to_d1_e2e=match;
}catch{result.provider_to_d1_e2e=false;}
console.log('WAVE_LINEAR_LIVE_TO_D1_E2E='+JSON.stringify(result));
console.log('LINEAR_PROVIDER_READ_ONLY=true; NO_MANUS_AUTHORITY_CLAIM=true; NO_SECRETS_PRINTED=true');
if(!result.provider_to_d1_e2e)process.exitCode=43;
