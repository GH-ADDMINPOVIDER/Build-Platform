// WAVE owner scope 7/7 — read-only GH2 / OCIAN preflight; no action execution or credential logging.
import {connect} from 'node:net';
const repo='Wave-Runner-2/Build-Platform';
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF_NAME!=='feat/ccs-multi-protocol-docker-20261023'){throw new Error('STAGING_SCOPE_REQUIRED')}
const token=process.env['GH-ID-TOMLOAD-RUNNER-2']||process.env.GITHUB_TOKEN||'';
const proof={schema:'wave.e2e.preflight.v1',source_sha:process.env.GITHUB_SHA,origin:'GH_ADDMIN_POVIDER',runner_registration:'UNKNOWN',host_ssh_tcp:'UNTESTED',oidc_identity:process.env.INFISICAL_IDENTITY_ID?'CONFIGURED':'MISSING',notion_credential_binding:'UNVERIFIED',discord_credential_binding:'UNVERIFIED',wave_d1_e2e:'NOT_PROVEN',chatgpt_2_account_e2e:'NOT_PROVEN',full_e2e:false};
for(const [name,keys] of Object.entries({notion_credential_binding:['NOTION_API_KEY','NOTION_TOKEN','NOTION_SECRET'],discord_credential_binding:['DISCORD_WEBHOOK_URL','DISCORD_BOT_TOKEN','DISCORD_WEBHOOK'],linear_credential_binding:['LINEAR_API_KEY','LINEAR_TOKEN','LINEAR_AUTH_TOKEN'],manus_credential_binding:['MANUS_API_KEY','MANUS_API_TOKEN','MANUS_TOKEN'],notion_integration_identity:['NOTION_INTEGRATION_TOKEN','NOTION_API_KEY','NOTION_TOKEN','NOTION_SECRET'],wave_owner_authority_binding:['OGENIC_OPS_KEY'],ssh_credential_binding:['OCIAN_SSH_PRIVATE_KEY','SSH_PRIVATE_KEY','TMN_SSH_PRIVATE_KEY']})){
  proof[name]=keys.some(k=>String(process.env[k]||'').length>=12)?'NAME_PRESENT_AUTH_NOT_PROVEN':'NOT_FOUND_IN_ROOT_STAGING';
}
const ssh=()=>new Promise(resolve=>{const sock=connect({host:'165.232.174.32',port:22,timeout:4500});let done=false;const finish=v=>{if(done)return;done=true;try{sock.destroy()}catch{}resolve(v)};sock.once('connect',()=>finish('TCP_ACCEPTED_AUTH_NOT_PROVEN'));sock.once('timeout',()=>finish('TCP_TIMEOUT'));sock.once('error',()=>finish('TCP_UNAVAILABLE'));});
proof.host_ssh_tcp=await ssh();
if(token){
 try{const r=await fetch('https://api.github.com/repos/'+repo+'/actions/runners?per_page=100',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(9500)});
 if(r.status===403||r.status===401){proof.runner_registration='API_PERMISSION_MISSING_HTTP_'+r.status}
 else if(!r.ok){proof.runner_registration='API_HTTP_'+r.status}
 else{const d=await r.json();const rs=Array.isArray(d.runners)?d.runners:[];const matched=rs.filter(x=>x.name==='wave-runner-01');proof.runner_inventory_size=rs.length;proof.runner_registration=matched.length?matched[0].status==='online'?matched[0].busy?'ONLINE_BUSY':'ONLINE':'REGISTERED_OFFLINE':'NOT_REGISTERED_TO_GH2';proof.runner_labels=matched.length?(matched[0].labels||[]).map(x=>x.name).filter(x=>['self-hosted','linux','x64','wave'].includes(x)):[];}
 }catch{proof.runner_registration='API_CONNECTION_ERROR'}
}else proof.runner_registration='TOKEN_NOT_AVAILABLE';
console.log('WAVE_7_E2E_READONLY_PREFLIGHT='+JSON.stringify(proof));
console.log('OWNER_SIGN_OR_TASK_DISPATCH=NOT_ATTEMPTED; HOST_COMMANDS=NONE; PROVIDER_INFERENCE=NONE; STAGING_ONLY=true');
