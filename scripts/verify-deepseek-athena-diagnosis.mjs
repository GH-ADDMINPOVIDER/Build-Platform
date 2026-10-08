// OGENIC one-off bounded architecture diagnosis. One paid provider call max.
// Prompt is built from public, secret-free code contracts; never sends D1/user data.
import { writeFileSync } from "node:fs";

const key = String(process.env.DEEPSEEK_API_KEY || "").trim();
const resultPath = "/tmp/oge-athena-deepseek-diagnosis.json";
function fail(code, http_status = null) {
  const result = {ok:false, code, http_status, paid_requests_max:1, verified:false};
  writeFileSync(resultPath, JSON.stringify(result)+"\n");
  console.log(JSON.stringify(result));
  process.exitCode=1;
}
if (!key) {
  fail("CONFIGURATION_REQUIRED");
} else {
  const prompt = [
    "You are a senior API/CI incident reviewer. Analyze ONLY these observed facts; do not invent D1 contents. Return at most 5 concise lines, in Thai, root cause, confidence, discriminator, safe fix, and anti-regression test.",
    "Facts: On 2026-10-08 OGE-35 and OGE-36 ATHENA live test expected HTTP 409 HUMAN_APPROVAL_REQUIRED for provider=cloudflare capability=deploy_promote, but got HTTP 404. Authenticated GitHub READ passed earlier in scripts.",
    "Current deterministic Planner for 'promote production deployment' creates READY capability=deploy_promote/provider=cloudflare; explicit request same capability. ATHENA delegates to /api/capabilities/execute.",
    "In capability-resolver.ts: resolveCapability filters candidates on enabled, provider status, requested capability/provider. If zero eligible, status=UNAVAILABLE; HTTP becomes 404. If eligible but no ready binding, status=CONFIGURATION_REQUIRED HTTP503. Only a resolved non-READ capability reaches executor HUMAN_APPROVAL_REQUIRED HTTP409. ",
    "In capability-resolver-api.ts: D1 provider_capabilities plus compatibility_map fallback; compatibility entries included only when D1 provider_capabilities is empty EXCEPT github/read_file absent explicit row. No guarantee cloudflare/deploy_promote is present/active.",
    "Question: Most probable explanation for 404 versus 409? Explain which evidence would distinguish absent mapping from disabled capability, and propose safe minimal fix WITHOUT whitelisting an unverified write capability or bypassing approvals. Never ask for secrets or paid provider calls."
  ].join("\n");

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method:"POST",
      headers: {Authorization:`Bearer ${key}`, "Content-Type":"application/json", Accept:"application/json"},
      body: JSON.stringify({
        model:"deepseek-flash",
        stream:false,
        thinking:{type:"disabled"},
        messages:[{role:"system",content:"Diagnose honestly from given evidence only. A missing capability must remain blocked; avoid invented fixes or disabling gates."},{role:"user",content:prompt}],
        max_tokens:512,
      }),
      signal:AbortSignal.timeout(35000)
    });
    const payload=await response.json().catch(()=>({}));
    const answer=typeof payload?.choices?.[0]?.message?.content==="string"?payload.choices[0].message.content.trim():"";
    const usage=payload?.usage||{};
    const safeText=answer
      .replace(/(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,})/gi,"[REDACTED]")
      .slice(0,2400);
    const out={
      ok:response.status===200&&Boolean(safeText),
      status:response.status===200?"COMPLETED":"PROVIDER_FAILED",
      http_status:response.status,
      model: typeof payload?.model==="string"?payload.model:null,
      answer:response.status===200?safeText:null,
      finish_reason:payload?.choices?.[0]?.finish_reason||null,
      usage:{prompt_tokens:Number(usage.prompt_tokens||0),completion_tokens:Number(usage.completion_tokens||0),total_tokens:Number(usage.total_tokens||0)},
      calls:1,retries:0,fallbacks:0,
      context:"PUBLIC_CODE_ONLY",
      ruby_verified:false,
      output_persistence:"GITHUB_ARTIFACT_ONLY"
    };
    writeFileSync(resultPath,JSON.stringify(out,null,2)+"\n");
    console.log(JSON.stringify({ok:out.ok,http_status:out.http_status,model:out.model,usage:out.usage,artifact:resultPath,answer_present:Boolean(safeText)}));
    if(!out.ok)process.exitCode=1;
  }catch{
    fail("DEEPSEEK_DIAGNOSTIC_UNREACHABLE");
  }
}
