/**
 * OGE-95 existing Yellow READ adapter, the ONLY metered provider route.
 * No external secrets enter the research output, one call per job.
 */
import { writeFileSync } from "node:fs";
const endpoint = "https://wave.ogenicchocolate.com/api/capabilities/execute";
const key = String(process.env.OGENIC_OPS_KEY || "").trim();
const path = "/tmp/oge95-deepseek-architecture-review.json";
const sources = [
  "https://developers.cloudflare.com/workers/local-development/",
  "https://developers.cloudflare.com/d1/best-practices/local-development/",
  "https://developers.cloudflare.com/workers/testing/",
  "https://docs.github.com/en/actions/reference/security/secure-use"
];
const research = [
  "OGE-95 WAVE Replica Runner. Think like a Cloudflare/CI architect, answer in Thai concisely.",
  "Current proof: Node22 GitHub-hosted workerd + local D1 (15 migrations); 348 tests, 12/12 local, 10/10 SELECTED anonymous web/API route contracts matched staging. Overall 1:1 NOT proven.",
  "Architecture: WAVE/ATHENA -> Yellow -> ephemeral agent executor -> Ruby verifies -> Green 1LSS stores only verified evidence; D1 remains sole canonical state.",
  "Suggest 3 prioritized implementation steps to reach measured 1:1 behavioral parity. Include deterministic synthetic owner-main/1LSS sessions, provider mocks, bounded job execution, a 20-case comparison rubric with critical security constraints, and staged deployment on existing runner only.",
  "No new server, new DB, main/prod changes, duplicate policy gates, or recurring model calls. Indicate limitations clearly. Official reference URLs supplied: " + sources.join(", ")
].join("\n");
const stamp = (x) => writeFileSync(path, JSON.stringify(x,null,2)+"\n");
if(!key) {
  stamp({ok:false,code:"CONFIGURATION_REQUIRED_YELLOW_OWNER_ACCESS",requests:0});
  process.exitCode=2;
}else{
  try{
    if(research.length>5000)throw new Error("CONTEXT_LIMIT_EXCEEDED");
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"x-ogenic-ops-key":key,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({provider:"deepseek",capability:"context_load",environment:"staging",input:{prompt:research}}),
      signal:AbortSignal.timeout(45000)
    });
    const body=await response.json().catch(()=>({}));
    const result=body?.result||{};
    const answer=typeof result.text==="string"?result.text.trim():"";
    const clean=answer.replace(/(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,})/g,"[REDACTED]").slice(0,4500);
    const ok=response.status===200&&body?.ok===true&&result.provider==="deepseek"&&clean.length>0;
    const proof={
      ok,http_status:ok?200:response.status,
      model:ok?String(result.model||"deepseek-flash"):null,
      answer:ok?clean:null,
      source_urls:sources,
      inputs:"PUBLIC_DOCUMENTATION_AND_PUBLIC_REPO_CONTRACTS_ONLY",
      no_browsing_tools:true,calls:1,retries:0,fallbacks:0,
      usage:ok?result.usage:null,
      yellow_run_id:body?.run_id||null,
      yellow_verification:body?.verification?.status||"NOT_VERIFIED",
      ruby_verified:false,
      status:ok?"RESEARCH_RECEIVED_UNVERIFIED":"BLOCKED",
      error_code:ok?null:String(body?.code||result?.code||"YELLOW_RESPONSE_INVALID").slice(0,110),
      retention_eligible:false
    };
    stamp(proof);
    console.log(JSON.stringify({ok,http_status:response.status,model:proof.model,tokens:result?.usage?.total_tokens||null,verification:proof.yellow_verification,error_code:proof.error_code,artifact:path}));
    if(ok) {console.log("OGE95_YELLOW_DEEPSEEK_BEGIN");console.log(clean);console.log("OGE95_YELLOW_DEEPSEEK_END");}
    else process.exitCode=1;
  }catch(e){
    const kind=e?.name==="TimeoutError"||e?.name==="AbortError"?"TIMEOUT":"TRANSPORT_ERROR";
    stamp({ok:false,code:"YELLOW_REQUEST_FAILED",reason:kind,requests:1});
    console.log(JSON.stringify({ok:false,code:"YELLOW_REQUEST_FAILED",reason:kind}));
    process.exitCode=1;
  }
}
