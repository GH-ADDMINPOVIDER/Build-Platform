// Read-only, independent authoritative + public DNS validation for Owner's Atlassian TXT.
// No tokens, secrets, DNS mutations, or Statuspage configuration.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
const hostname="wave.ogenicchocolate.com";
const expected="atlassian-domain-verification=UFOBpeAoD4SijIdwKSHTmcM2W4yPC6GewVmTpxHa6kSwW6KA67MVj8U85BQw22TT";
const report={schema:"wave.atlassian.domain.dns.public.v1",hostname,expected_sha256:createHash("sha256").update(expected).digest("hex"),providers:[],record_publicly_verified:false,atlassian_organization_verified:"NOT_CHECKED",dns_changes:0};
for(const server of ["pam.ns.cloudflare.com","piers.ns.cloudflare.com","1.1.1.1","8.8.8.8"]){
  const result=spawnSync("dig",["+short","TXT",hostname,"@"+server],{encoding:"utf8",timeout:12000,maxBuffer:20000});
  const strings=String(result.stdout||"").split("\n").map(s=>s.trim().replace(/"\s+"/g,"").replace(/^"|"$/g,"")).filter(Boolean);
  const matched=result.status===0&&strings.includes(expected);
  report.providers.push({resolver:server,response_available:result.status===0,matched_exact_token:matched});
}
report.record_publicly_verified=report.providers.slice(0,2).every(x=>x.matched_exact_token)&&report.providers.slice(2).some(x=>x.matched_exact_token);
console.log("WAVE_ATLASSIAN_PUBLIC_DNS_INDEPENDENT_PROOF="+JSON.stringify(report));
console.log("NO_DNS_CHANGE=true; NO_STATUSPAGE_INCIDENT_STATUS_CHANGE=true");
if(!report.record_publicly_verified)process.exitCode=65;
