// Owner-authorized Atlassian domain verification: Cloudflare authoritative DNS only.
// Add one TXT for wave.ogenicchocolate.com, never touch DNS web traffic or other records.
// Token value is a DNS-public proof, NOT an Owner Key or Cloudflare secret.
const zoneName="ogenicchocolate.com";
const fqdn="wave.ogenicchocolate.com";
const expected="atlassian-domain-verification=UFOBpeAoD4SijIdwKSHTmcM2W4yPC6GewVmTpxHa6kSwW6KA67MVj8U85BQw22TT";
const github=process.env.GITHUB_REPOSITORY||"";
const branch=process.env.GITHUB_REF_NAME||"";
const token=["CLOUDFLARE_API_TOKEN","CF_API_TOKEN","CLOUDFLARE_TOKEN","CF_TOKEN"].map(x=>process.env[x]).find(x=>typeof x==="string"&&x.length>=18);
const zoneBinding=["CLOUDFLARE_ZONE_ID","CF_ZONE_ID","CLOUDFLARE_ACCOUNT_ZONE_ID"].map(x=>process.env[x]).find(x=>typeof x==="string"&&/^[0-9a-f]{32}$/.test(x));
const proof={schema:"wave.atlassian.domain.txt.v1",dns_provider:"Cloudflare",zone:zoneName,target:fqdn,record_type:"TXT",source:"OWNER_PROVIDED_VERIFICATION_RECORD",gh2_branch:branch,credential_found:!!token,zone_verified:false,record:"NOT_CHECKED",api_readback:"NOT_ATTEMPTED",public_dns_readback:"NOT_CHECKED",atlassian_admin_verification:"NOT_RUN",production_a_cname_untouched:true};
const emit=()=>console.log("WAVE_ATLASSIAN_DOMAIN_DNS_PROOF="+JSON.stringify(proof));
async function cf(path,method="GET",body){
 const resp=await fetch("https://api.cloudflare.com/client/v4"+path,{
  method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const data=await resp.json().catch(()=>({}));
 return{http:resp.status,data};
}
function checked(result){return result.http>=200&&result.http<300&&result.data.success===true}
try{
 if(github!=="Wave-Runner-2/Build-Platform"||branch!=="feat/ccs-multi-protocol-docker-20261023")throw Error("GH2_STAGING_ONLY");
 if(!token){proof.record="BLOCKED_NO_CLOUDFLARE_API_TOKEN_BOUND";throw Error("MISSING_SCOPED_DNS_TOKEN")}
 let zone=null;
 if(zoneBinding){
   const one=await cf("/zones/"+zoneBinding);
   if(checked(one)&&one.data.result?.name===zoneName)zone=one.data.result;
 }
 if(!zone){
   const zones=await cf("/zones?name="+encodeURIComponent(zoneName)+"&per_page=25");
   if(!checked(zones))throw Error("ZONE_LIST_FORBIDDEN_HTTP_"+zones.http);
   const matches=Array.isArray(zones.data.result)?zones.data.result.filter(z=>z.name===zoneName):[];
   if(matches.length!==1)throw Error("EXPECTED_EXACTLY_ONE_AUTHORIZED_ZONE");
   zone=matches[0];
 }
 if(zone.name!==zoneName||!zone.id)throw Error("ZONE_IDENTITY_MISMATCH");
 proof.zone_verified=true;
 const prefix="/zones/"+encodeURIComponent(zone.id)+"/dns_records";
 const query="?name="+encodeURIComponent(fqdn)+"&per_page=100";
 const list=await cf(prefix+query);
 if(!checked(list))throw Error("DNS_READ_BLOCKED_HTTP_"+list.http);
 const records=Array.isArray(list.data.result)?list.data.result:[];
 if(records.some(x=>x.name===fqdn&&x.type==="NS")){
   proof.record="BLOCKED_DELEGATED_SUBZONE_USE_CHILD_ZONE";
   throw Error("DNS_DELEGATION_REQUIRES_CHILD_ZONE");
 }
 const matching=records.filter(x=>x.name===fqdn&&x.type==="TXT"&&x.content===expected);
 if(matching.length>0){
   proof.record="ALREADY_PRESENT";
 }else{
   if(records.some(x=>x.name===fqdn&&x.type==="CNAME")){
     proof.record="BLOCKED_CNAME_TXT_SAME_NAME";
     throw Error("CNAME_CONFLICT_USE_ATLASSIAN_HTTPS_VERIFICATION");
   }
   const created=await cf(prefix,"POST",{type:"TXT",name:fqdn,content:expected,ttl:300,comment:"Atlassian domain verification for wave.ogenicchocolate.com; owner approved 2026-10-24"});
   if(!checked(created)){
     proof.record="POST_BLOCKED_HTTP_"+created.http;
     throw Error("CLOUDFLARE_DNS_CREATE_FAILED");
   }
   proof.record="CREATED";
 }
 const after=await cf(prefix+query);
 proof.api_readback=checked(after)&&Array.isArray(after.data.result)&&after.data.result.some(x=>x.name===fqdn&&x.type==="TXT"&&x.content===expected)?"PASS":"FAIL";
 if(proof.api_readback!=="PASS")throw Error("CLOUDFLARE_RECORD_READBACK_FAILED");
 try{
   const dns=await fetch("https://dns.google/resolve?name="+encodeURIComponent(fqdn)+"&type=TXT",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)}).then(r=>r.json());
   const answers=Array.isArray(dns.Answer)?dns.Answer:[];
   const wanted=expected.replaceAll('"',"");
   proof.public_dns_readback=answers.some(x=>x.type===16&&String(x.data||"").replaceAll('"',"")===wanted)?"PASS":"WAIT_DNS_PROPAGATION";
 }catch{proof.public_dns_readback="QUERY_UNAVAILABLE"}
}catch(e){proof.failure=String(e?.message||"DNS_ERROR").slice(0,110)}
emit();
console.log("NO_DNS_A_CNAME_CHANGES=TRUE; NO_CLOUDFLARE_TOKEN_IN_LOGS=TRUE; ATLASSIAN_VERIFY_UI_NOT_CLAIMED");
if(proof.api_readback!=="PASS")process.exitCode=72;
