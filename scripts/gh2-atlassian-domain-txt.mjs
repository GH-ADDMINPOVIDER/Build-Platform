// Owner-authorized Atlassian domain ownership TXT: only CREATE one exact record; never edit/delete web routing.
const zoneName="ogenicchocolate.com",recordName="wave.ogenicchocolate.com";
const value="atlassian-domain-verification=UFOBpeAoD4SijIdwKSHTmcM2W4yPC6GewVmTpxHa6kSwW6KA67MVj8U85BQw22TT";
const token=String(process.env.CLOUDFLARE_API_TOKEN||"").trim();
const proof={schema:"wave.atlassian.domain_dns.v1",authority:"CLOUDFLARE",zone:zoneName,record_name:recordName,record_type:"TXT",ttl:86400,zone_api:"NOT_RUN",existing_record_check:"NOT_RUN",dns_write:"NOT_ATTEMPTED",verification:"NOT_CONFIRMED_BY_ATLASSIAN",statuspage_custom_domain:"UNRELATED",web_routing_modified:false,success:false};
const request=async(path,method="GET",body)=>{const r=await fetch("https://api.cloudflare.com/client/v4"+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(18000)});return{http:r.status,data:await r.json().catch(()=>({}))};};
try{
 if(token.length<15)throw Error("CLOUDFLARE_TOKEN_NOT_IN_INFISICAL_STAGING_SCOPE");
 const zones=await request("/zones?name="+encodeURIComponent(zoneName)+"&per_page=50");
 proof.zone_api="HTTP_"+zones.http;
 const all=Array.isArray(zones.data.result)?zones.data.result:[];
 const eligible=all.filter(x=>x.name===zoneName&&x.status==="active");
 if(zones.http!==200||!zones.data.success||eligible.length!==1)throw Error("CLOUDFLARE_CANONICAL_ZONE_AMBIGUOUS_OR_NOT_ACCESSIBLE");
 const id=eligible[0].id;
 const dns=await request("/zones/"+encodeURIComponent(id)+"/dns_records?name="+encodeURIComponent(recordName)+"&per_page=100");
 proof.existing_record_check="HTTP_"+dns.http;
 if(dns.http!==200||!dns.data.success||!Array.isArray(dns.data.result))throw Error("CLOUDFLARE_DNS_READ_REQUIRED");
 const rec=dns.data.result;
 proof.existing_dns_types=[...new Set(rec.map(x=>String(x.type)))];
 if(rec.some(x=>x.type==="TXT"&&x.content===value)){
    proof.dns_write="ALREADY_EXISTS";
    proof.success=true;
 }else{
    if(rec.some(x=>x.type==="CNAME"))throw Error("CNAME_TXT_SAME_NAME_CONFLICT_USE_ATLASSIAN_HTTPS_VERIFICATION");
    const result=await request("/zones/"+encodeURIComponent(id)+"/dns_records","POST",{type:"TXT",name:recordName,content:value,ttl:86400,comment:"OGENIC owner approved Atlassian managed-domain DNS verification; preserve WAVE runtime"});
    proof.dns_write=result.http===200||result.http===201?"POST_ACCEPTED":"POST_REJECTED_HTTP_"+result.http;
    if(!result.data.success)throw Error("DNS_CREATE_FAILED");
    const read=await request("/zones/"+encodeURIComponent(id)+"/dns_records?name="+encodeURIComponent(recordName)+"&type=TXT&per_page=100");
    proof.independent_api_readback="HTTP_"+read.http;
    proof.success=read.http===200&&read.data.success&&Array.isArray(read.data.result)&&read.data.result.some(x=>x.name===recordName&&x.type==="TXT"&&x.content===value);
    if(!proof.success)throw Error("TXT_READBACK_MISMATCH");
 }
}catch(e){proof.blocker=String(e?.message||"PROBE_ERROR").slice(0,110)}
console.log("WAVE_ATLASSIAN_DOMAIN_DNS_PROOF="+JSON.stringify(proof));
console.log("NO_DNS_A_OR_CNAME_CHANGED=TRUE; NO_ATLASSIAN_ADMIN_VERIFICATION_BYPASS=TRUE");
if(!proof.success)process.exitCode=61;
