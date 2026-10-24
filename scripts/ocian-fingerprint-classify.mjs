import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const saved=String(process.env.SSH_FINGER_PRINT_KEY||'').trim();
const publicValue=String(process.env.SSH_PUBLIC_KEY||'').trim();
const privateValue=String(process.env.SSH_PRIVATE_KEY||'').trim();
const sshKey=String(process.env.SSH_KEY||'').trim();
const p={schema:'wave.ocian.fingerprint.classify.v1',fingerprint_binding_present:!!saved,format:'OTHER',matches_ocian_server:false,matches_ssh_client:false,stored_public_key_matches_ocian:false,can_pin_host:false,ssh_auth_attempted:false,values_logged:false};
const fp=saved.match(/SHA256:[A-Za-z0-9+/=]{35,}|MD5:(?:[a-f0-9]{2}:){15}[a-f0-9]{2}/i)?.[0]||'';
p.format=fp.startsWith('SHA256:')?'SHA256_FINGERPRINT':fp.startsWith('MD5:')?'MD5_FINGERPRINT':/ssh-(ed25519|rsa)|ecdsa-sha2/.test(saved)?'SSH_PUBLIC_OR_KNOWN_HOST':saved?'OTHER_STRING':'EMPTY';
const dir=mkdtempSync(join(tmpdir(),'wave-pin-'));
const run=(cmd,args,ms=14000)=>spawnSync(cmd,args,{encoding:'utf8',timeout:ms,stdio:['ignore','pipe','pipe']});
const file=(name,value)=>{const path=join(dir,name);writeFileSync(path,value,{mode:0o600});return path};
const fprint=(path,type='sha256')=>{const r=run('ssh-keygen',['-lf',path,'-E',type]);return r.status===0?(r.stdout.match(type==='sha256'?/SHA256:[A-Za-z0-9+/=]+/:/MD5:(?:[a-f0-9]{2}:){15}[a-f0-9]{2}/i)?.[0]||''):''};
try{
 const scan=run('ssh-keyscan',['-T','7','-p','22','-t','ed25519','165.232.174.32']);
 p.host_key_observed=scan.status===0&&/^165\.232\.174\.32\s+ssh-ed25519\s+/m.test(scan.stdout);
 if(p.host_key_observed){
  const path=file('server',scan.stdout);
  const s256=fprint(path),smd5=fprint(path,'md5');
  p.matches_ocian_server=!!fp&&(fp===s256||fp.toLowerCase()===smd5.toLowerCase());
  if(publicValue.startsWith('ssh-ed25519 ')){
   const pp=file('stored_pub','165.232.174.32 '+publicValue+'\n');
   p.stored_public_key_matches_ocian=fprint(pp)===s256;
  }
  if(/^(?:165\.232\.174\.32|\[165\.232\.174\.32\]:22)\s+ssh-/.test(saved)){
   p.matches_ocian_server=fprint(file('known',saved+'\n'))===s256;
  }
  // A stored host key can use a DNS hostname or even plain OpenSSH public-key syntax.
  // Evaluate the actual key body, independent of the prefix, without logging bytes.
  const m=saved.match(/(?:^|\\s)(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256)\\s+([A-Za-z0-9+/=]{40,})/);
  if(m){
   const stored=file('stored_fingerprint_key',m[1]+' '+m[2]+'\\n');
   p.fingerprint_key_is_matching_server=fprint(stored)===s256;
   p.matches_ocian_server=p.matches_ocian_server||p.fingerprint_key_is_matching_server;
  }
  p.can_pin_host=p.matches_ocian_server||p.stored_public_key_matches_ocian;
 }
 if(privateValue.includes('PRIVATE KEY')){
  const pk=file('client_private',privateValue.trimEnd()+'\n');
  const r=run('ssh-keygen',['-y','-f',pk]);
  if(r.status===0&&r.stdout.startsWith('ssh-')){
   const cp=file('client_public',r.stdout);
   p.matches_ssh_client=!!fp&&(fp===fprint(cp)||fp.toLowerCase()===fprint(cp,'md5').toLowerCase());
   p.stored_public_key_matches_client=!!publicValue&&publicValue.split(' ').slice(0,2).join(' ')===r.stdout.trim().split(' ').slice(0,2).join(' ');
  }
 }
 
 // Cross-check across all OCIAN public host key algorithms; an Infisical key may be RSA/ECDSA instead of Ed25519.
 const scans=run('ssh-keyscan',['-T','7','-p','22','165.232.174.32']);
 p.trusted_source_match_any_host_algo=false;
 p.infisical_key_matches_digitalocean_client=false;
 if(scans.status===0){
  const entries=scans.stdout.split('\\n').map(x=>x.trim().split(/\\s+/)).filter(x=>x.length>=3&&x[1].startsWith('ssh-')||x.length>=3&&x[1].startsWith('ecdsa-'));
  const candidates=[['SSH_FINGER_PRINT_KEY',saved],['SSH_PUBLIC_KEY',publicValue],['SSH_KEY',sshKey]];
  const digitalOceanClientMD5='70:66:fc:1e:e7:18:99:65:b0:d4:82:9d:c7:b8:79:fa';
  p.host_algorithms=entries.map(e=>e[1]);
  p.matches_by_name=[];
  for(const [name,val] of candidates){
   const token=val.match(/(?:^|\\s)(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521)\\s+([A-Za-z0-9+/=]{40,})/);
   if(!token)continue;
   const keyFile=file('candidate_'+name,token[1]+' '+token[2]+'\\n');
   const md5=fprint(keyFile,'md5').replace(/^MD5:/,'');
   if(md5===digitalOceanClientMD5){p.infisical_key_matches_digitalocean_client=true;p.digitalocean_client_binding_name=name;}
   const match=entries.some(e=>e[1]===token[1]&&e[2]===token[2]);
   if(match){p.trusted_source_match_any_host_algo=true;p.matches_by_name.push(name)}
  }
  p.can_pin_host=p.can_pin_host||p.trusted_source_match_any_host_algo;
 }
 p.ssh_key_type=sshKey.includes('PRIVATE KEY')?'PRIVATE_KEY':sshKey.startsWith('ssh-')?'PUBLIC_KEY':sshKey.startsWith('SHA256:')?'FINGERPRINT':sshKey?'OTHER':'EMPTY';
}catch{p.probe_error=true}
finally{rmSync(dir,{recursive:true,force:true})}
console.log('OCIAN_INFISICAL_SSH_PIN_CLASSIFICATION='+JSON.stringify(p));