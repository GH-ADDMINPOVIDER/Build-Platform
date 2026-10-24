// Scoped Notion source snapshot -> WAVE D1 independent readback (NO native Notion live API claim).
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const item=JSON.parse(readFileSync('config/wave-notion-rag-master.staging.json','utf8'));
const base='https://wave.ogenicchocolate.com',key=String(process.env.OGENIC_OPS_KEY||'').trim();
const proof={schema:'wave.notion.source_snapshot_d1.v1',upstream:'Notion RAG MASTER verified by separate connected Notion source',snapshot_date:item.connector_snapshot_as_of,metadata_import:'NOT_PROVEN',d1_persist:'NOT_PROVEN',independent_readback:'NOT_PROVEN',native_notion_api:'NOT_CONFIGURED',full_notion_wave_e2e:false};
const content='Notion RAG MASTER | metadata/source provenance only | id='+item.canonical_page_id+' | edited='+item.source_page_last_edited_at+' | verified_chatgpt_notion_fetch=TRUE | destination=WAVE_D1_1LSS | source_not_runtime_live';
const auth=async()=>{const res=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({owner_key:key}),signal:AbortSignal.timeout(14000)});return{status:res.status,json:await res.json().catch(()=>({})),cookie:(res.headers.get('set-cookie')||'').split(';')[0]};};
const call=async(path,method,cookie,body,requestKey)=>{const res=await fetch(base+path,{method,headers:{Origin:base,Accept:'application/json','Content-Type':'application/json',Cookie:cookie,...(requestKey?{'Idempotency-Key':requestKey}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(16000)});return{http:res.status,data:await res.json().catch(()=>({}))}};
try{
 if(!/^[0-9a-f-]{36}$/i.test(item.canonical_page_id))throw Error('SOURCE_ID_INVALID');
 if(key.length<16)throw Error('OWNER_KEY_MISSING');
 const authResult=await auth();if(authResult.status!==200||authResult.json.authenticated!==true||!authResult.cookie.startsWith('ogenic_owner_session='))throw Error('SIGNED_OWNER_SESSION_REQUIRED');
 const idKey='notion-rag-meta-'+createHash('sha256').update(content).digest('hex').slice(0,40);
 const posted=await call('/api/1lss/event','POST',authResult.cookie,{source_surface:'plugin-harness',events:[{role:'system',content}]},idKey);
 proof.metadata_import='HTTP_'+posted.http;
 const seq=Number(posted.data?.sequences?.[0]||0);proof.d1_sequence=seq||null;proof.d1_persist=posted.data.ok&&seq>0?'PASS':'NOT_PROVEN';
 if(seq>0){const after=await call('/api/1lss/events?after_sequence='+Math.max(0,seq-1)+'&limit=40','GET',authResult.cookie);
 const expectedHash=createHash('sha256').update(content).digest('hex');
 const match=after.http===200&&Array.isArray(after.data.messages)&&after.data.messages.some(m=>Number(m.sequence_no)===seq&&m.text===content);
 proof.record_sha256=expectedHash;proof.independent_readback=match?'PASS':'FAILED_OR_NOT_VISIBLE';proof.snapshot_to_d1_e2e=match;
 }
}catch{proof.metadata_import='BLOCKED';proof.snapshot_to_d1_e2e=false}
console.log('NOTION_TO_WAVE_SOURCE_SNAPSHOT_D1_EVIDENCE='+JSON.stringify(proof));
console.log('LIVE_NOTION_TOKEN_CREDENTIAL_AND_PULL=NOT_PROVEN; NO_SECRETS_NO_PRIVATE_CONTENT_EXPORTED=true');
if(!proof.snapshot_to_d1_e2e)process.exitCode=26;
