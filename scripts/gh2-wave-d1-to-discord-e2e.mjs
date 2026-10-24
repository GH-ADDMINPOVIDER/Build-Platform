// Owner-scoped GH2 staging: read a verified Notion provenance event from live WAVE D1 then forward sanitized two-channel receipts to Discord.
import {createHash} from 'node:crypto';
const base='https://wave.ogenicchocolate.com';const key=String(process.env.OGENIC_OPS_KEY||'').trim();
const proof={schema:'wave.d1_to_discord.two_channels.v1',source:'1LSS D1 Notion RAG metadata snapshot',d1_readback:'NOT_VERIFIED',new_data:'NOT_VERIFIED',system_log:'NOT_VERIFIED',automatic_trigger:'GH2_STAGING_WORKFLOW_PUSH',green_stone_verifier:'NOT_IN_THIS_PROOF',two_channel_d1_discord_e2e:false,global_7_e2e:false};
const api=async(path,cookie,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,Accept:'application/json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(16000)});return{http:r.status,body:await r.json().catch(()=>({}))};};
try{
 if(key.length<16)throw Error('OWNER_NOT_BOUND');
 const a=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({owner_key:key}),signal:AbortSignal.timeout(14000)});
 const auth=await a.json().catch(()=>({}));const cookie=(a.headers.get('set-cookie')||'').split(';')[0];
 if(a.status!==200||!auth.authenticated||!cookie.startsWith('ogenic_owner_session='))throw Error('OWNER_SESSION_INVALID');
 const events=await api('/api/1lss/events?after_sequence=480&limit=60',cookie);
 const record=events.http===200&&Array.isArray(events.body.messages)?events.body.messages.find(x=>x.sequence_no===481&&x.source_surface==='plugin-harness'&&String(x.text||'').includes('Notion RAG MASTER | metadata/source provenance only')):null;
 if(!record){proof.d1_readback='MISSING_NOTION_SEQ481';throw Error('SOURCE_D1_READBACK_FAILED');}
 proof.d1_readback='PASS_SEQUENCE_481';
 const fingerprint=createHash('sha256').update(String(record.text)).digest('hex');
 const ch=await api('/api/discord/channels',cookie);if(ch.http!==200||!Array.isArray(ch.body.channels))throw Error('CHANNELS_NOT_AVAILABLE');
 for(const t of [{name:'new_data',channel:'wave-inbox',description:'Notion RAG MASTER new provenance metadata'},{name:'system_log',channel:'workflow-log',description:'WAVE D1 source-event accepted and read back'}]){
  const room=ch.body.channels.find(x=>x.name===t.channel&&[0,5,15].includes(x.type));
  if(!room){proof[t.name]='CHANNEL_MISSING';continue}
  const content='WAVE '+t.name.toUpperCase()+' | STAGING | source=D1/1LSS | seq=481 | event_hash='+fingerprint+' | '+t.description+' | owner_sign=verified | no private data';
  const endpoint='/api/discord/channels/'+room.id+'/messages';
  let read=await api(endpoint+'?limit=50',cookie);let msg=Array.isArray(read.body.messages)?read.body.messages.find(x=>x.content===content):null;
  let http_post='EXISTING';
  if(!msg){const sent=await api(endpoint,cookie,'POST',{content});http_post=sent.http;msg=sent.body.message}
  if(!msg?.id){proof[t.name]='DISCORD_POST_FAILED_'+http_post;continue}
  read=await api(endpoint+'?limit=50',cookie);const echoed=read.http===200&&Array.isArray(read.body.messages)&&read.body.messages.some(x=>x.id===msg.id&&x.content===content);
  proof[t.name]=echoed?'PASS':'READBACK_MISMATCH';proof[t.name+'_message_id']=msg.id;proof[t.name+'_http_post']=http_post;proof[t.name+'_http_get']=read.http;
 }
 proof.two_channel_d1_discord_e2e=proof.d1_readback.startsWith('PASS')&&proof.new_data==='PASS'&&proof.system_log==='PASS';
}catch{proof.two_channel_d1_discord_e2e=false;}
console.log('WAVE_D1_TO_DISCORD_TWO_CHANNEL_E2E='+JSON.stringify(proof));
console.log('NO_FULL_NOTION_LIVE_PULL_OR_GREENSTONE_VERIFICATION=true; NO_SECRETS_PRINTED=true');
if(!proof.two_channel_d1_discord_e2e)process.exitCode=31;
