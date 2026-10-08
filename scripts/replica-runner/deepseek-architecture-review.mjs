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
  "ROLE: independent Architecture Reviewer for OGENIC/WAVE OGE-95; respond in Thai, concise yet actionable. Your model is supplied with verified documentation snippets; do NOT claim you browsed the web yourself. Separate verified facts, implementation proposals, and unverified assumptions.",
  "",
  "CURRENT SOURCE STATE (actual repo staging evidence):",
  "Repo Ogenicchocolate21debug/Build-Platform branch phase-vi-provider-incentive-metering. Cloudflare Worker: worker/entry-yellow-stone.ts. Cloudflare Vite build, Node22, Wrangler4, D1 DB canonical (staging not prod), 15 SQL migrations. Existing self-hosted wave-runner-01 (1 vCPU 1 GB) handles secrets+staging deploy. GitHub-hosted ubuntu-latest executes replica proof with zero model calls.",
  "OGE-95 proof https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37749673030 PASS: 348/348 tests, 12/12 local checks, 10/10 selected public/auth-denial HTTP contract comparisons. 10/10 is NOT 100% whole-runtime equivalence: no authorized session/canonical D1 data, external provider, agent side effects, browser real UX or edge behavior. 0.9:1 system parity still UNPROVEN.",
  "Current replica: npm run check -> compile same Worker assets -> scripts/replica-runner/prepare.mjs strips remote routes/secrets and forces disposable LOCAL D1 -> wrangler d1 migrations apply --local -> wrangler dev --local -> scripts/replica-runner/verify.mjs and compare.mjs -> artifact. Optional workflow_dispatch deploy_staging=true triggers existing protected staging deployment only after local proof and exact HEAD check (not yet trialed). NO automatic deploy.",
  "Project architecture WAVE/ATHENA -> Yellow execution/permissions -> Agents/Ruby verification -> Green owner-main/1LSS. One canonical source/CI GitHub and canonical live state D1, no second memory DB, no policy gates or duplicate Linear tasks.",
  "",
  "VERIFIED UPSTREAM DOCS (researcher supplied, links source of each statement):",
  "https://developers.cloudflare.com/workers/local-development/  Wrangler local uses Miniflare executing production workerd engine; bindings simulated by default, remote:true may hit actual backend; --local can disable remote bindings.",
  "https://developers.cloudflare.com/d1/best-practices/local-development/ Local D1 is isolated but starts empty; migration execution / persistence can be tested.",
  "https://developers.cloudflare.com/workers/local-development/bindings-per-env/ Some services simulate locally (D1, Browser Run, Assets); others like Workers AI need remote and cannot be truly emulated.",
  "https://developers.cloudflare.com/workers/testing/  Cloudflare recommends Workers Vitest and createTestHarness() to test app integration and binding state; isolated storage per test file.",
  "https://docs.github.com/en/actions/reference/runners/self-hosted-runners GitHub recommends ephemeral registered self-hosted for autoscale; persistent secrets runner cannot be considered clean per job.",
  "https://docs.github.com/en/actions/reference/security/secure-use  Self-hosted runner with trusted secrets is risky for untrusted code; GitHub-hosted ephemeral runner for untrusted build/test.",
  "https://api-docs.deepseek.com/api/create-chat-completion/ This call has function tools only, no web browser enabled; no hidden provider loops.",
  "",
  "REQUEST: Propose a practical COMPLETE EDITION of Replica Runner (near 0.9:1) using existing GitHub-hosted + workerd + local D1 + n8n/Yellow tools. Respond with:",
  "1) Top 5 functional gaps ordered by risk/ROI, especially auth sessions + 1LSS event choreography; real D1 fixture realism; external integrations safe mocks; UI mobile Safari; deploy staging.",
  "2) Architecture of an ephemeral AGENT EXECUTOR: scope, run command allowlist, limits CPU/RAM/time/network, artifact capture, no hidden secrets, deterministic idempotency, how Yellow sends job and Ruby validates result, WITHOUT inventing second memory.",
  "3) Realistic parity measurement: define 10-20 meaningful weighted scenarios, comparison rubric, 0.9 pass criteria, failure handling and why public 10/10 not enough.",
  "4) Safest deployment route: after tests trigger existing staging deploy only with explicit human selection; no extra cloud resources; no production.",
  "5) Provide 3 concrete P0 changes in existing files with example pseudocode or test strategy; avoid buying VPS/new DB.",
  "6) 3 risks/unverified claims/assumptions. Include source URLs where useful. No hallucinated API support.",
  "Keep response roughly 650-1000 Thai words. Avoid generic high-level marketing."
].join("\n");

let once = false;
try {
  once = true;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${key}`},
    body:JSON.stringify({
      model:"deepseek-flash", thinking:{type:"disabled"}, stream:false,
      messages:[
        {role:"system",content:"You are a precise infrastructure architect and security reviewer. Treat supplied official docs as externally retrieved references, never as firsthand browsing; explain uncertainty. Respond Thai, concrete plan; no secrets, no side effects."},
        {role:"user",content:research}
      ],
      max_tokens:2200
    }),
    signal:AbortSignal.timeout(70000)
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
    max_output_tokens:2200,
    source_urls:research.filter(line=>line.startsWith("https://")).map(line=>line.split(" ")[0]),
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
} catch {
  stamp({ok:false,code:"DEEPSEEK_REVIEW_REQUEST_FAILED",requests:once?1:0,retries:0});
  console.log("OGE95_DEEPSEEK_REVIEW_BLOCKED");
  process.exitCode=1;
}
