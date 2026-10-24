// Atlassian organization domain ownership proof. Cloudflare DNS zone only. Never alter WAVE address records.
const zoneName="ogenicchocolate.com", fullName="wave.ogenicchocolate.com";
const txt="atlassian-domain-verification=UFOBpeAoD4SijIdwKSHTmcM2W4yPC6GewVmTpxHa6kSwW6KA67MVj8U85BQw22TT";
const env=process.env;
const get=(keys)=>keys.map(name=>env[name]).find(x=>typeof x==="string"&&x.trim().length>8)?.trim()||"";
const auth=get(["CLOUDFLARE_API_TOKEN","CF_API_TOKEN","CLOUDFLARE_TOKEN","CLOUDFLARE_DNS_API_TOKEN","CF_DNS_API_TOKEN","CLOUDFLARE_AUTH_TOKEN"]);
const configuredZone=get(["CLOUDFLARE_ZONE_ID","CF_ZONE_ID","WAVE_CLOUDFLARE_ZONE_ID"]);
const proof={schema:"wave.atlassian-domain.dns.v1",zone:zoneName,host:fullName,record_type:"TXT",ttl:86400,auth_binding:auth?"BOUND":"MISSING",zone_lookup:"NOT_ATTEMPTED",existing_record:"NOT_CHECKED",dns_write:"NOT_ATTEMPTED",cloudflare_readback:"NOT_ATTEMPTED",public_txt_readback:"NOT_ATTEMPTED",atlassian_organization_verified:"NOT_CHECKED",protected_a_cname_mx_records_modified:false};
async function cf(path,method="GET",data){
 const res=await fetch("https://api.cloudflare.com/client/v4"+path,{method,headers:{Authorization:"Bearer "+auth,"Content-Type":"application/json","Accept":"application/json"},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(18000)});
 return{http:res.status,data:await res.json().catch(()=>({}))};
}
try{
 if(!auth)throw Error("NO_CLOUDFLARE_ZONE_SCOPED_CREDENTIAL");
 let zoneId=configuredZone;
 if(zoneId){
   const check=await cf("/zones/"+encodeURIComponent(zoneId));
   if(check.http!==200||!check.data.success||check.data.result?.name!==zoneName)throw Error("ZONE_ID_NAME_MISMATCH_OR_INACCESSIBLE");
 }else{
   const list=await cf("/zones?name="+encodeURIComponent(zoneName)+"&per_page=30");
   if(list.http!==200||!list.data.success)throw Error("CLOUDFLARE_ZONE_LOOKUP_HTTP_"+list.http);
   const found=(list.data.result||[]).filter(x=>x.name===zoneName);
   if(found.length!==1)throw Error("ZONE_NOT_FOUND_OR_AMBIGUOUS");
   zoneId=found[0].id;
 }
 proof.zone_lookup="EXACT_MATCH";
 const base="/zones/"+encodeURIComponent(zoneId)+"/dns_records";
 const rec=await cf(base+"?name="+encodeURIComponent(fullName)+"&per_page=100");
 if(rec.http!==200||!rec.data.success)throw Error("CLOUDFLARE_DNS_READ_HTTP_"+rec.http);
 const matches=(rec.data.result||[]).filter(x=>x.name===fullName);
 const same=matches.find(x=>x.type==="TXT"&&x.content===txt);
 proof.existing_record=same?"MATCHING_TXT_EXISTS":"NO_MATCHING_TXT";
 if(!same){
   const conflict=matches.filter(x=>x.type==="CNAME");
   if(conflict.length)throw Error("CNAME_PRESENT_AT_TARGET_FAIL_CLOSED_NO_DNS_CHANGES");
   const posted=await cf(base,"POST",{type:"TXT",name:fullName,content:txt,ttl:86400,comment:"Atlassian Owner-initiated organization domain verification, 2026-10-24"});
   proof.dns_write="HTTP_"+posted.http;
   if(posted.http!==200&&posted.http!==201||!posted.data.success)throw Error("DNS_POST_FAILED_HTTP_"+posted.http);
 }else proof.dns_write="ALREADY_EXISTS";
 const final=await cf(base+"?type=TXT&name="+encodeURIComponent(fullName)+"&per_page=100");
 const valid=final.http===200&&final.data.success&&(final.data.result||[]).some(x=>x.type==="TXT"&&x.name===fullName&&x.content===txt);
 proof.cloudflare_readback=valid?"PASS":"FAILED";
 if(!valid)throw Error("INDEPENDENT_CLOUDFLARE_DNS_GET_MISMATCH");
 const doh=await fetch("https://cloudflare-dns.com/dns-query?name="+encodeURIComponent(fullName)+"&type=TXT",{headers:{Accept:"application/dns-json"},signal:AbortSignal.timeout(15000)});
 const d=await doh.json().catch(()=>({}));
 const visible=Array.isArray(d.Answer)&&d.Answer.some(x=>x.type===16&&String(x.data||"").replaceAll('"',"")===txt);
 proof.public_txt_readback=visible?"PASS":"NOT_YET_VISIBLE";
}catch(e){proof.error=String(e?.message||"UNKNOWN").slice(0,115)}
console.log("ATLASSIAN_DOMAIN_CLOUDFLARE_TXT_EVIDENCE="+JSON.stringify(proof));
console.log("STATUSPAGE_CUSTOM_DOMAIN_NOT_CONFIGURED=true; ATLASSIAN_VERIFY_BUTTON_STILL_REQUIRED=true; NO_EXISTING_WAVE_DNS_ROUTE_MODIFIED=true");
if(proof.cloudflare_readback!=="PASS")process.exitCode=63;
