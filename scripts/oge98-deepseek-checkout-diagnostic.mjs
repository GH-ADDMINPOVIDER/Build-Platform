// OGE-98 owner-requested one-shot DeepSeek READ diagnosis via EXISTING Yellow capability execution.
// Only sanitized, public technical facts. Never touches OpenAI keys, canonical D1, runner workspace or code.
import { writeFileSync } from "node:fs";
const out="oge98-deepseek-checkout-diagnostic.json";
const sha=String(process.env.GITHUB_SHA||"");
const key=String(process.env.OGENIC_OPS_KEY||"");
const proof={schema_version:"OGE98_DEEPSEEK_DIAG_V1",source_sha:sha,
  source:"PUBLIC_OPENAI_LINEAR_DOCS_AND_SANITIZED_CODEX_AGENT_RESULT",model_provider:"deepseek",
  access_path:"EXISTING_YELLOW_READ",calls_attempted:0,retries:0,provider_fallbacks:0,
  no_main_or_production_changes:true,no_d1_mutations:true,ruby_verified:false,
  status:"NOT_STARTED"};
const save=()=>writeFileSync(out,JSON.stringify(proof,null,2)+"\n");
const prompt=[
 "You are a READ-ONLY DeepSeek architecture reviewer. Respond in Thai, at most 650 words. Do not claim web browsing.",
 "Goal: repair OGENIC/WAVE OGE-98 existing OpenAI Agent integration without creating a new Runner, DB, tool authority or cloud service.",
 "Verified GitHub HEAD on allowed staging branch: "+sha+". Repo Wave-Runner-2/Build-Platform, allowed branch phase-vi-provider-incentive-metering.",
 "The existing self-host GitHub host wave-runner-01 has codex CLI+exec-server and Git remote READ ready on correct staging HEAD.",
 "Four Linear @Codex Cloud delegated tasks all received WRONG_BASE_BRANCH; their cloud workspace was /workspace/Build-Platform but branch work at d7b331947bafec293edfb1799246f30c8a6a652a, no origin remote, and not the staging Worker source tree. No files changed.",
 "Existing OGE-28 workflow has two GitHub Actions jobs, control prepares an OpenAI Agents API self-host session, executor connects codex exec-server using restricted environment key via Infisical; OGE-28 run has been triggered and final proof not yet established.",
 "OpenAI official: https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted",
 "Linear Codex integration: https://linear.app/integrations/codex ; https://learn.chatgpt.com/docs/third-party/linear",
 "RESEARCH REQUEST: rank 4 exact remediations for wrong Codex Cloud checkout/environment repo map while guarding main; explain whether mapping can be corrected by Linear issue text versus Codex Cloud Environment settings and account authentication. Compare existing GitHub self-host Agent API proof fallback. Include safe diagnostic commands and STOP conditions.",
 "Return minimal practical instructions for agent + owner; distinguish validated source facts, hypotheses, external account limitations and what must be tested. Zero credential details, no new server, no production, main, Candy, D1 schema changes; no fabricated successful session."
].join("\n");
if(!/^[a-f0-9]{40}$/.test(sha)||process.env.GITHUB_REF_NAME!=="phase-vi-provider-incentive-metering"){
  proof.status="BLOCKED_INVALID_STAGING_CONTEXT";save();process.exit(2)
}
if(!key){proof.status="BLOCKED_OWNER_KEY_NOT_INJECTED";save();process.exit(2)}
try{
  proof.calls_attempted=1;
  const res=await fetch("https://wave.ogenicchocolate.com/api/capabilities/execute",{
    method:"POST",
    headers:{"x-ogenic-ops-key":key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({provider:"deepseek",capability:"context_load",environment:"staging",input:{prompt}}),
    signal:AbortSignal.timeout(45000)
  });
  const body=await res.json().catch(()=>({}));
  const result=body?.result||{};
  const message=typeof result.text==="string"?result.text.trim():"";
  const clean=message.replace(/(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/g,"[REDACTED]");
  proof.http_status=res.status;
  proof.status=res.ok&&body.ok===true&&result.provider==="deepseek"&&clean?"RESEARCH_RECEIVED_UNVERIFIED":"BLOCKED";
  proof.error_code=proof.status==="BLOCKED"?String(body.code||result.code||"YELLOW_RESPONSE_INVALID").slice(0,80):null;
  proof.model=proof.status==="RESEARCH_RECEIVED_UNVERIFIED"?result.model:null;
  proof.answer=proof.status==="RESEARCH_RECEIVED_UNVERIFIED"?clean:null;
  proof.output_complete=result.output_complete===true;
  proof.usage=proof.status==="RESEARCH_RECEIVED_UNVERIFIED"?result.usage:null;
  proof.yellow_run_id=body.run_id||null;
}catch(e){
  proof.status="BLOCKED_TRANSPORT";
  proof.error_code=e?.name==="TimeoutError"?"TIMEOUT":"TRANSPORT_ERROR";
}
save();
console.log(JSON.stringify({status:proof.status,http_status:proof.http_status||null,
  calls_attempted:proof.calls_attempted,source_sha:proof.source_sha,model:proof.model||null,
  tokens:proof.usage?.total_tokens||null,output_complete:proof.output_complete||false,
  error_code:proof.error_code||null,artifact:out}));
if(proof.status!=="RESEARCH_RECEIVED_UNVERIFIED")process.exitCode=1;
