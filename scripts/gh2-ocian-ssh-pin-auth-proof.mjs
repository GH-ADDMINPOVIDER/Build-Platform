// Staging-only OCIAN SSH authentication proof. Requires trusted host key pin; never use StrictHostKeyChecking=no.
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const keys=['OCIAN_SSH_PRIVATE_KEY','TMN_SSH_PRIVATE_KEY','SSH_PRIVATE_KEY'];
const hostpins=['OCIAN_SSH_KNOWN_HOSTS','SSH_KNOWN_HOSTS','OGENIC_SSH_KNOWN_HOSTS'];
const fingerprints=['OCIAN_SSH_HOST_FINGERPRINT','SSH_HOST_FINGERPRINT','OCIAN_SSH_FINGERPRINT_SHA256'];
const chosen=arr=>arr.map(name=>({name,value:process.env[name]||''})).find(x=>x.value.length>=12);
const key=chosen(keys),known=chosen(hostpins),fingerprint=chosen(fingerprints);
const result={schema:'wave.tmns.ssh.auth.v1',environment:'staging',principal:'GH_ADDMIN_POVIDER',ssh_key_bound:!!key,trusted_host_pin_bound:!!known||!!fingerprint,auth:'NOT_EXECUTED',runner_registration:'NO_GH2_SELFHOST_RUNNER_AS_OF_PREFLIGHT',command:'READ_ONLY_HOST_PROBE',e2e:false};
const run=(cmd,args,opts={})=>spawnSync(cmd,args,{encoding:'utf8',timeout:11000,stdio:['ignore','pipe','pipe'],...opts});
const tmp=mkdtempSync(join(tmpdir(),'wave-ssh-probe-'));
try {
 if(!key){result.auth='BLOCKED_PRIVATE_KEY_NOT_BOUND';}
 else if(!known&&!fingerprint){result.auth='BLOCKED_NO_PINNED_HOST_IDENTITY';}
 else if(!/BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY/.test(key.value)){result.auth='BLOCKED_BOUND_KEY_NOT_PEM';}
 else{
  const identity=join(tmp,'identity'), kh=join(tmp,'known_hosts');
  writeFileSync(identity,key.value.endsWith('\n')?key.value:key.value+'\n',{mode:0o600});
  if(known){writeFileSync(kh,known.value+'\n',{mode:0o600});}
  else {
   const fetched=run('ssh-keyscan',['-T','5','-p','22','-t','ed25519','165.232.174.32']);
   if(fetched.status!==0||!fetched.stdout.trim())result.auth='BLOCKED_HOST_KEY_FETCH_FAILED';
   else{
    const scan=join(tmp,'scan');writeFileSync(scan,fetched.stdout,{mode:0o600});
    const f=run('ssh-keygen',['-lf',scan]);
    const pinned=fingerprint.value.trim();
    if(f.status!==0||!f.stdout.includes(pinned)||!/^SHA256:[A-Za-z0-9+/]{32,50}$/.test(pinned)){result.auth='BLOCKED_HOST_FINGERPRINT_MISMATCH';}
    else writeFileSync(kh,fetched.stdout,{mode:0o600});
   }
  }
  if(result.auth==='NOT_EXECUTED'){
    const remote="set -eu; printf 'OCIAN_SSH_READBACK=YES\\n'; printf 'GH2_PRINCIPAL=%s\\n' \"$(id -un)\"; printf 'HOSTNAME=%s\\n' \"$(hostname)\"; if command -v docker >/dev/null 2>&1; then printf 'DOCKER_CLI=YES\\n'; else printf 'DOCKER_CLI=NO\\n'; fi; if command -v codex >/dev/null 2>&1; then printf 'CODEX_CLI=YES\\n'; else printf 'CODEX_CLI=NO\\n'; fi;";
    const s=run('ssh',['-F','/dev/null','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+kh,'-o','ConnectTimeout=8','-i',identity,'wave@165.232.174.32','sh','-c',remote]);
    if(s.status===0&&s.stdout.includes('OCIAN_SSH_READBACK=YES')){result.auth='HOST_READONLY_AUTHENTICATED';result.readback=s.stdout.trim().split('\n').filter(x=>/^(OCIAN_SSH_READBACK|GH2_PRINCIPAL|HOSTNAME|DOCKER_CLI|CODEX_CLI)=/.test(x));}
    else result.auth='BLOCKED_SSH_AUTH_OR_USER_OR_KEY_SCOPE';
  }
 }
} catch {result.auth='BLOCKED_PROBE_INTERNAL_ERROR'}
finally{rmSync(tmp,{recursive:true,force:true});}
console.log('OCIAN_SSH_PINNED_AUTH_PROOF='+JSON.stringify(result));
console.log('NO_SUDO_NO_GH2_RUNNER_REGISTRATION_NO_DOCKER_MUTATION_NO_SECRETS_OUTPUT=true');
