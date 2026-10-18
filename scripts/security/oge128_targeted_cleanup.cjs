'use strict';
/* OGE-128: Remove ONLY cryptographically revalidated ephemeral localhost mTLS test server files.
   No raw content, paths, certificate fingerprints, keys or other credentials are logged. */
const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), crypto=require('node:crypto');
if(process.env.RUNNER_NAME!=='wave-runner-01' ||
   process.env.GITHUB_REPOSITORY!=='Ogenicchocolate21debug/Build-Platform' ||
   process.env.GITHUB_REF_NAME!=='task/oge-128-runtime-certificate-20261018')
  throw new Error('STAGING_GUARD_DENIED');
const tmp=os.tmpdir(), now=Date.now(), owner=process.getuid();
const report={
  status:'NOT_RUN',source_run:'39161934049',deleted_folders:0,
  private_key_files_deleted:0,remaining_folders:-1,unexpected_items:0,
  private_key_material_logged:false,production_mutated:false,
  infisical_leaf_mutated:false,run_id:process.env.GITHUB_RUN_ID
};
function check(condition,code){if(!condition)throw new Error(code);}
function names() {
  return fs.readdirSync(tmp,{withFileTypes:true})
    .filter(x=>x.name.startsWith('oge128-local-tls-'));
}
function validate(entry){
  check(entry.isDirectory()&&!entry.isSymbolicLink(),'DIRECTORY_TYPE_GUARD');
  const dir=path.join(tmp,entry.name);
  const stat=fs.lstatSync(dir);
  check(stat.isDirectory()&&!stat.isSymbolicLink(),'DIRECTORY_SYMLINK_GUARD');
  check(stat.uid===owner&&(stat.mode&0o077)===0,'DIRECTORY_OWNER_OR_PERMISSIONS');
  const listing=fs.readdirSync(dir).sort();
  check(listing.length===2&&listing[0]==='server.crt'&&listing[1]==='server.key','UNEXPECTED_FILES');
  const kp=path.join(dir,'server.key'),cp=path.join(dir,'server.crt');
  const keyStat=fs.lstatSync(kp),certStat=fs.lstatSync(cp);
  check(keyStat.isFile()&&!keyStat.isSymbolicLink() &&
        certStat.isFile()&&!certStat.isSymbolicLink(),'NON_REGULAR_FILE');
  check(keyStat.uid===owner&&certStat.uid===owner,'FILE_OWNER_GUARD');
  check((keyStat.mode&0o077)===0,'PRIVATE_KEY_PERMISSIONS_GUARD');
  check(keyStat.size>=100&&keyStat.size<=12000&&certStat.size>=100&&certStat.size<=12000,'FILE_SIZE_GUARD');
  const O=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0);
  let fk,fc;
  try{
    fk=fs.openSync(kp,O);
    fc=fs.openSync(cp,O);
    const key=crypto.createPrivateKey(fs.readFileSync(fk));
    const cert=new crypto.X509Certificate(fs.readFileSync(fc));
    const a=crypto.createPublicKey(key).export({type:'spki',format:'der'});
    const b=cert.publicKey.export({type:'spki',format:'der'});
    check(a.equals(b),'NOT_MATCHED_KEY_PAIR');
    check(cert.subject===cert.issuer&&cert.verify(cert.publicKey),'NOT_SELF_SIGNED');
    check(/CN\s*=\s*localhost(?:\n|$)/.test(cert.subject),'NON_LOCAL_SUBJECT');
    const san=cert.subjectAltName||'';
    check(san.includes('DNS:localhost')&&san.includes('IP Address:127.0.0.1'),'SAN_GUARD');
    const from=Date.parse(cert.validFrom),to=Date.parse(cert.validTo);
    check(Number.isFinite(from)&&Number.isFinite(to)&&to-from>0&&to-from<=2*86400000 &&
          from<=now+86400000,'CERT_VALIDITY_GUARD');
  }finally{
    if(fk!==undefined)fs.closeSync(fk);
    if(fc!==undefined)fs.closeSync(fc);
  }
  return {dir,kp,cp,stat,keyStat,certStat};
}
try{
  const entries=names();
  check(entries.length===2,'EXPECTED_TWO_TEST_DIRECTORIES');
  const candidates=entries.map(validate);
  // Revalidate identity metadata immediately before mutation; refuse changed files.
  for(const v of candidates){
    for(const [p,old] of [[v.dir,v.stat],[v.kp,v.keyStat],[v.cp,v.certStat]]){
      const current=fs.lstatSync(p);
      check(current.dev===old.dev&&current.ino===old.ino &&
        current.mode===old.mode&&current.uid===old.uid&&current.size===old.size,
        'FILES_CHANGED_SINCE_PROOF');
    }
  }
  for(const v of candidates){
    fs.unlinkSync(v.kp);report.private_key_files_deleted++;
    fs.unlinkSync(v.cp);
    fs.rmdirSync(v.dir);report.deleted_folders++;
  }
  report.remaining_folders=names().length;
  check(report.deleted_folders===2&&report.private_key_files_deleted===2 &&
      report.remaining_folders===0,'POST_CLEANUP_RESIDUE');
  report.status='PASS';
}catch{
  report.status='FAIL_CLOSED_REQUIRES_REVIEW';
}
const out=path.join(process.env.RUNNER_TEMP,'oge128-targeted-cleanup-result.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});
for(const [name,val] of Object.entries(report)) {
  if(name==='run_id')continue;
  console.log('OGE128_CLEANUP_'+name.toUpperCase()+'='+String(val));
}
if(report.status!=='PASS')process.exitCode=1;
