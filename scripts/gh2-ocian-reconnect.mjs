// GH_ADDMIN_POVIDER / OCIAN-S HOST: live reconnect, FAIL CLOSED on unverified SSH host key.
// Exact pinned staging repo only; registration token is ephemeral, sent via SSH stdin, never printed.
import { mkdtempSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const REPO='Wave-Runner-2/Build-Platform',BRANCH='feat/ccs-multi-protocol-docker-20261023';
const TARGET='165.232.174.32',HOSTUSER='wave';
const root='/repos/'+REPO+'/actions/runners';
const token=String(process.env['GH-ID-TOMLOAD-RUNNER-2']||'').trim();
const chose=names=>names.map(name=>({name,value:String(process.env[name]||'')})).find(x=>x.value.length>12);
const secret=chose(['OCIAN_SSH_PRIVATE_KEY','TMN_SSH_PRIVATE_KEY','SSH_PRIVATE_KEY']);
const known=chose(['OCIAN_SSH_KNOWN_HOSTS','SSH_KNOWN_HOSTS','OGENIC_SSH_KNOWN_HOSTS']);
const pin=chose(['OCIAN_SSH_HOST_FINGERPRINT','SSH_HOST_FINGERPRINT','OCIAN_SSH_FINGERPRINT_SHA256']);
const proof={schema:'wave.gh2.host.restore.v1',host:'OCIAN-S HOST',source_repo:REPO,environment:'staging',github_admin:'UNTESTED',gh2_registered_runners:'NOT_QUERIED',gh2_runner_token:'NOT_ATTEMPTED',ssh_host_trust:'UNVERIFIED',ssh_auth:'NOT_ATTEMPTED',registration:'NOT_ATTEMPTED',host_e2e:false,owner_green_orange_changed:false};
if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF_NAME!==BRANCH){throw Error('NO_GH2_STAGING_CONTEXT')}
const api=async(url,method='GET')=>{if(token.length<18)return{http:0,body:{}};try{const res=await fetch('https://api.github.com'+url,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'wave-gh2-staging-recover'},signal:AbortSignal.timeout(12500)});return{http:res.status,body:await res.json().catch(()=>({}))}}catch{return{http:-1,body:{}}}};
const run=(cmd,args,options={})=>spawnSync(cmd,args,{encoding:'utf8',timeout:22000,maxBuffer:100000,stdio:['pipe','pipe','pipe'],...options});
const work=mkdtempSync(join(tmpdir(),'ocian-gh2-reconnect-'));
try{
 const runners=await api(root+'?per_page=100');
 proof.github_admin='RUNNERS_LIST_HTTP_'+runners.http;
 const list=runners.http===200&&Array.isArray(runners.body.runners)?runners.body.runners:[];
 proof.gh2_registered_runners=runners.http===200?list.length:'NOT_ACCESSIBLE';
 const existing=list.find(x=>x.name==='GH_ADDMIN_POVIDER');
 if(existing?.status==='online'){proof.registration='ALREADY_ONLINE';proof.host_e2e=false;proof.gh2_runner_online=true;}
 else{
   const reg=await api(root+'/registration-token','POST');
   proof.gh2_runner_token=reg.http===201&&String(reg.body.token||'').length>=20?'ADMIN_TOKEN_GRANTED':'BLOCKED_HTTP_'+reg.http;
   if(!secret){proof.ssh_auth='BLOCKED_NO_BOUND_SSH_KEY'}
   else if(!known&&!pin){proof.ssh_host_trust='BLOCKED_NO_VERIFIED_HOST_KEY'}
   else if(existing){proof.registration='EXISTING_GH2_RUNNER_NOT_ONLINE_MANUAL_SERVICE_DIAG_REQUIRED'}
   else if(!String(secret.value).includes('PRIVATE KEY')){proof.ssh_auth='BOUND_KEY_FORMAT_UNSUPPORTED'}
   else if(proof.gh2_runner_token!=='ADMIN_TOKEN_GRANTED'){proof.registration='BLOCKED_RUNNER_ADMIN_SCOPE'}
   else{
     const keyPath=join(work,'id'),knownPath=join(work,'known_hosts');
     writeFileSync(keyPath,secret.value.trimEnd()+'\n',{mode:0o600});
     let trusted=false;
     if(known){writeFileSync(knownPath,known.value.trimEnd()+'\n',{mode:0o600});proof.ssh_host_trust='PINNED_KNOWN_HOSTS_CONFIGURED';trusted=true;}
     else{
       const scan=run('ssh-keyscan',['-p','22','-T','7','-t','ed25519',TARGET],{timeout:11000});
       const scanFile=join(work,'scan_hosts');
       writeFileSync(scanFile,scan.stdout||'',{mode:0o600});
       const fp=run('ssh-keygen',['-l','-f',scanFile,'-E','sha256']);
       const expected=pin.value.trim();
       const parsed=(fp.stdout.match(/SHA256:[A-Za-z0-9+/=]+/g)||[]);
       if(fp.status===0&&/^SHA256:[A-Za-z0-9+/=]{35,}$/.test(expected)&&parsed.includes(expected)){
         trusted=true;writeFileSync(knownPath,scan.stdout,{mode:0o600});proof.ssh_host_trust='PINNED_FINGERPRINT_MATCH';
       }else proof.ssh_host_trust='FINGERPRINT_MISMATCH_ABORT';
     }
     if(trusted){
       const sshBase=['-F','/dev/null','-i',keyPath,'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+knownPath,'-o','ConnectTimeout=8'];
       const userhost=HOSTUSER+'@'+TARGET;
       const pre=run('ssh',[...sshBase,userhost,'sh','-c','id -un; hostname; test -d /opt/wave/actions-runner; test ! -e /opt/wave/gh2-actions-runner/.runner'],{timeout:17000});
       if(pre.status!==0){proof.ssh_auth='SSH_AUTH_OR_HOST_PREFLIGHT_FAILED'}
       else if(!pre.stdout.startsWith('wave\n')){proof.ssh_auth='SSH_USER_MISMATCH'}
       else{
         proof.ssh_auth='PINNED_SSH_READONLY_PASS';
         const local='scripts/host-bootstrap/ocian-gh2-attach.sh';
         const script=readFileSync(local,'utf8');
         const remote='/home/wave/.gh2-attach-'+String(process.env.GITHUB_RUN_ID||'staging')+'.sh';
         const sftp=run('scp',[...sshBase,local,userhost+':'+remote],{timeout:22000});
         if(sftp.status!==0){proof.registration='SCRIPT_TRANSFER_FAILED'}
         else{
           const cmd='bash '+remote+' '+REPO+' '+BRANCH;
           const installed=run('ssh',[...sshBase,userhost,cmd],{input:reg.body.token+'\n',timeout:240000,maxBuffer:20000});
           proof.registration=installed.status===0&&installed.stdout.includes('GH2_OCIAN_RUNNER_REGISTERED=YES')?'HOST_SERVICE_REGISTERED':'HOST_INSTALL_OR_SERVICE_FAILED';
           const cleaned=run('ssh',[...sshBase,userhost,'rm -f '+remote],{timeout:14000});
           proof.cleanup=cleaned.status===0?'PASS':'UNVERIFIED';
           if(proof.registration==='HOST_SERVICE_REGISTERED'){
             for(let attempt=0;attempt<3;attempt++){
               const verify=await api(root+'?per_page=100');
               const v=verify.body.runners?.find(x=>x.name==='GH_ADDMIN_POVIDER');
               if(v?.status==='online'){proof.gh2_runner_online=true;proof.host_e2e=false;break;}
               await new Promise(r=>setTimeout(r,3500));
             }
           }
         }
       }
     }
   }
 }
}catch{proof.registration='CONNECTOR_OR_PROBE_EXCEPTION';}
finally{rmSync(work,{recursive:true,force:true});}
console.log('WAVE_GH2_OCIAN_RECOVERY='+JSON.stringify(proof));
console.log('SECRET_VALUES_PRINTED=NO; GH1_ARCHIVE_INSTALL_MODIFIED=NO; GH2_HOST_DOCKER_CODEX_E2E_NOT_CLAIMED');
if(proof.registration!=='ALREADY_ONLINE'&&!proof.gh2_runner_online)process.exitCode=48;
