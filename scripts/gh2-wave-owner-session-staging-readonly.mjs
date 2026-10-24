// Owner-signed staging WAVE *read-only* live path proof. Never prints keys, cookies or tokens.
const BASE='https://wave.ogenicchocolate.com';
const result={schema:'wave.staging.owner_session.readonly.v1',source_sha:process.env.GITHUB_SHA,owner_session:'NOT_PROVEN',manifest_get:'NOT_ATTEMPTED',mcp_state_get:'NOT_ATTEMPTED',discord_status_get:'NOT_ATTEMPTED',discord_channels_get:'NOT_ATTEMPTED',command_status_gate:'NOT_ATTEMPTED',d1_canonical_receipt:'NOT_PROVEN',chatgpt_callback:'NOT_PROVEN',full_e2e:false};
const key=String(process.env.OGENIC_OPS_KEY||'').trim();
const get=async(path,cookie)=>{const r=await fetch(BASE+path,{method:'GET',headers:{'Cookie':cookie,'Accept':'application/json'},signal:AbortSignal.timeout(12000)});let b={};try{b=await r.json()}catch{}return {http:r.status,code:typeof b.code==='string'?b.code:'',ok:b.ok===true,authenticated:b.authenticated===true}};
if(key.length<16){result.owner_session='INFISICAL_STAGING_OWNER_KEY_MISSING';}
else {
 try{const r=await fetch(BASE+'/api/session',{method:'POST',headers:{'Content-Type':'application/json','Origin':BASE},body:JSON.stringify({owner_key:key}),signal:AbortSignal.timeout(12000)});
  const body=await r.json().catch(()=>({}));
  if(r.status!==200||body.authenticated!==true){result.owner_session='DENIED_HTTP_'+r.status+'_'+String(body.code||'UNKNOWN').slice(0,60)}
  else{const setCookie=r.headers.get('set-cookie')||'';const cookie=setCookie.split(';',1)[0];if(!cookie.startsWith('ogenic_owner_session='))result.owner_session='SESSION_COOKIE_NOT_RETURNED';
    else{const s=await get('/api/session',cookie);result.owner_session=s.http===200&&s.authenticated?'SIGNED_SESSION_READBACK_PASS':'READBACK_HTTP_'+s.http;
      if(result.owner_session==='SIGNED_SESSION_READBACK_PASS'){
        const m=await get('/api/connector-endpoint/v1/manifest',cookie);result.manifest_get='HTTP_'+m.http+(m.ok?'_OK':'');
        const n=await get('/api/mcp-config/state',cookie);result.mcp_state_get='HTTP_'+n.http+(n.ok?'_OK':'');
        const discord=await get('/api/discord/status',cookie);result.discord_status_get='HTTP_'+discord.http+'_'+discord.code;
        if(discord.http===200){const rooms=await get('/api/discord/channels',cookie);result.discord_channels_get='HTTP_'+rooms.http+'_'+rooms.code;}
        const c=await get('/api/wave/command/status?task_id=invalid',cookie);result.command_status_gate='HTTP_'+c.http+'_'+c.code;
      }
    }
  }
 }catch{result.owner_session='NETWORK_OR_PARSE_FAILURE'}
}
console.log('WAVE_OWNER_SESSION_READONLY_PROOF='+JSON.stringify(result));
console.log('NOT_A_REAL_WAVE_TASK_DISPATCH=true; AUTHORIZED_ONLY_FROM_OWNER_KEY=true; NO_SECRET_OUTPUT=true');
