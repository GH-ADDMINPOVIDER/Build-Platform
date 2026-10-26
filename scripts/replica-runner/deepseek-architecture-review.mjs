/**
 * OGE-95 research review, one-off: official public documentation + source facts
 * supplied by orchestrator; DeepSeek chat model has no browser tool in this request.
 * ONE bounded paid request, no retry, no fallback, no direct code/D1 mutations.
 */
import { writeFileSync } from "node:fs";

const key = String(process.env.DEEPSEEK_API_KEY || "").trim();
const proofPath = "/tmp/oge95-deepseek-architecture-review.json";
const stamp = (payload) => writeFileSync(proofPath, JSON.stringify(payload, null, 2) + "\n");
if (!key) {
  stamp({ok:false,code:"CONFIGURATION_REQUIRED",requests:0});
  process.exit(2);
}

const research = [
  "ROLE: DeepSeek infrastructure reviewer for WAVE Replica Runner OGE-95. Answer in Thai with 5 specific improvements prioritized P0/P1, a safe execution lane, and exact parity measurement. Do not claim independent web browsing.",
  "PROVEN: staging repo Wave-Runner-2/Build-Platform on phase-vi-provider-incentive-metering; Cloudflare Worker+workerd, local D1 15 migrations, GitHub-hosted Node22 runner, one existing self-hosted staging deploy runner.",
  "GitHub proof run 37749673030: 348/348 tests; 12/12 local runtime; 10/10 selected public route/auth-denial contracts. NOT 1:1: lacks owner-authenticated session behavior, realistic 1LSS state, Ruby retain proof, third-party mock contract parity, mobile UI, real deploy proof.",
  "Factory SOURCE->DISTILL->REPRODUCE->RUBY VERIFY->GREEN retain; Yellow is existing execution authority. Must NOT invent a new DB, gate, cloud machine, or paid model loop.",
  "Architecture requirements: code commit pinned, synthetic D1 only, isolated ephemeral agent tasks with fixed allowlisted operations and time limits; provable idempotency and evidence; safe staged deployment via existing human-selected workflow (never production).",
  "Official source references provided by orchestrator (no independent browsing): https://developers.cloudflare.com/workers/local-development/ ; https://developers.cloudflare.com/d1/best-practices/local-development/ ; https://developers.cloudflare.com/workers/testing/ ; https://docs.github.com/en/actions/reference/security/secure-use",
  "REQUEST: Return 1) P0 top 3 code changes and tests; 2) 1:1 parity plan with 10-20 weighted cases, critical fail-closed checks, measured coverage; 3) READ -> run -> Ruby verify -> Green criteria; 4) risks and what cannot be 1:1. Be implementation-specific, max 750 Thai words."
].join("\n");

let once = false;
try {
  once = true;
  if (research.length > 6000) throw new Error("CONTEXT_BUDGET_EXCEEDED");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${key}`},
    body:JSON.stringify({
      model:"deepseek-flash", thinking:{type:"disabled"}, stream:false,
      messages:[
        {role:"system",content:"You are a precise infrastructure architect and security reviewer. Treat supplied official docs as externally retrieved references, never as firsthand browsing; explain uncertainty. Respond Thai, concrete plan; no secrets, no side effects."},
        {role:"user",content:research}
      ],
      max_tokens:1100
    }),
    signal:AbortSignal.timeout(40000)
  });
  const data=await response.json().catch(()=>({}));
  const answer=typeof data?.choices?.[0]?.message?.content==="string" ? data.choices[0].message.content.trim():"";
  const sanitized=answer.replace(/(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,})/gi,"[REDACTED]").slice(0,14500);
  const info={
    ok:response.status===200&&Boolean(sanitized),
    http_status:response.status,
    model:typeof data.model==="string"?data.model:null,
    usage:{prompt_tokens:Number(data?.usage?.prompt_tokens||0),completion_tokens:Number(data?.usage?.completion_tokens||0),total_tokens:Number(data?.usage?.total_tokens||0)},
    calls:1,retries:0,fallbacks:0,
    max_output_tokens:1100,
    source_urls:[...new Set([...research.join(" ").matchAll(/https:\/\/(?:developers\.cloudflare\.com|docs\.github\.com)\/[^\s;]+/g)].map(match=>match[0]))],
    inputs:"PUBLIC_DOCUMENTATION_AND_PUBLIC_REPO_CONTRACTS_ONLY",
    no_browsing_tools:true,
    no_code_mutation:true,
    reviewed_by_ruby:false,
    answer:response.status===200?sanitized:null
  };
  stamp(info);
  console.log(JSON.stringify({ok:info.ok,http_status:info.http_status,model:info.model,usage:info.usage,answer_length:sanitized.length,artifact:proofPath}));
  if (info.ok) {
    console.log("OGE95_DEEPSEEK_REVIEW_BEGIN");
    console.log(sanitized);
    console.log("OGE95_DEEPSEEK_REVIEW_END");
  } else process.exitCode=1;
} catch (error) {
  const cause = error instanceof Error ? error : null;
  const safeType = cause?.name === "TimeoutError" || cause?.name === "AbortError" ? "REQUEST_TIMEOUT" : "TRANSPORT_EXCEPTION";
  const possibleCode = String(cause?.cause?.code ?? "").slice(0,70);
  const allowedCodes = new Set(["ETIMEDOUT","ECONNRESET","ENOTFOUND","EAI_AGAIN","ECONNREFUSED","UND_ERR_CONNECT_TIMEOUT","UND_ERR_SOCKET","CERT_HAS_EXPIRED","SELF_SIGNED_CERT_IN_CHAIN"]);
  const reasonCode = allowedCodes.has(possibleCode) ? possibleCode : null;
  stamp({ok:false,code:"DEEPSEEK_REVIEW_REQUEST_FAILED",reason:safeType,transport_code:reasonCode,requests:once?1:0,retries:0});
  console.log(JSON.stringify({request_status:"FAILED",cause:safeType,transport_code:reasonCode}));
  console.log("OGE95_DEEPSEEK_REVIEW_BLOCKED");
  process.exitCode=1;
}
