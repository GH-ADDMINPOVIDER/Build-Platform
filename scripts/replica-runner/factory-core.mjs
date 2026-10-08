/**
 * OGE-95 factory core: deterministic, zero-inference work-order + research intake.
 * Pure Node implementation; never deploys, mutates D1, runs shell, or trusts AI output.
 * SOURCE -> DISTILL -> REPRODUCE -> RUBY_VERIFY -> GREEN_RETENTION_ELIGIBLE.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const FACTORY_VERSION = "OGE95_FACTORY_CORE_V1";
export const STAGING_BRANCH = "phase-vi-provider-incentive-metering";
export const ALLOWED_OPERATIONS = Object.freeze(["replica_source_audit", "deepseek_research_ingest"]);
const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const text = (v,max=1024) => String(v ?? "").trim().slice(0,max);
const shaPattern = /^[a-f0-9]{40}$/i;
const taskPattern = /^OGE-95-[a-z0-9-]{3,60}$/i;
const SECRET = /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|(?:api[_-]?key|access[_-]?token|password|session[_-]?cookie)\s*[:=]\s*[^\s,]{6,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/i;

export function planFactoryOrder(raw) {
  const task_id=text(raw?.task_id,90);
  const operation=text(raw?.operation,50);
  const source_sha=text(raw?.source_sha,60);
  const branch=text(raw?.branch,110);
  const errors=[];
  if(!taskPattern.test(task_id))errors.push("TASK_ID_INVALID");
  if(!ALLOWED_OPERATIONS.includes(operation))errors.push("OPERATION_NOT_ALLOWLISTED");
  if(!shaPattern.test(source_sha))errors.push("SOURCE_SHA_REQUIRED");
  if(branch!==STAGING_BRANCH)errors.push("STAGING_BRANCH_ONLY");
  if(raw?.requires_paid_inference!==false)errors.push("PAID_INFERENCE_FORBIDDEN");
  if(raw?.deploy_requested!==false)errors.push("DEPLOY_FORBIDDEN_IN_FACTORY");
  const limits=raw?.limits||{};
  if(limits.max_minutes!==10||limits.max_artifact_bytes!==65536)
    errors.push("LIMITS_NOT_BOUND");
  const fingerprint=sha256([task_id,operation,source_sha,branch].join(":"));
  return {
    ok:errors.length===0,
    status:errors.length===0?"ACCEPTED":"REJECTED",
    version:FACTORY_VERSION, task_id, operation, source_sha, branch,
    idempotency_key:fingerprint,
    limits:{max_minutes:10,max_artifact_bytes:65536},
    transport:"GITHUB_ACTIONS_HOSTED_EPHEMERAL",
    authority:"YELLOW_AUTHORIZATION_REQUIRED_FOR_REAL_EXECUTION",
    paid_inference_allowed:false, staging_deploy_allowed:false,
    errors,
  };
}

export function auditFactorySource(order, read=readFileSync) {
  if(!order?.ok || order.operation!=="replica_source_audit")
    return {ok:false,code:"ORDER_NOT_APPROVED"};
  const paths=[
    "worker/entry-yellow-stone.ts",
    "worker/knowledge-refinery.ts",
    "config/oge-error-memory.json",
    "infra/replica-runner/replica-manifest.json",
    "scripts/replica-runner/verify.mjs",
    ".github/workflows/wave-replica-runner.yml",
  ];
  const files=paths.map(path=>{
    try {const source=read(path);return {path,present:true,sha256:sha256(source)};}
    catch{return {path,present:false,sha256:null};}
  });
  const match=files.every(x=>x.present);
  return {
    ok:match,code:match?"SOURCE_AUDIT_PASS":"SOURCE_AUDIT_FAIL",
    files,side_effects:0,provider_calls:0,
    evidence_hash:sha256(JSON.stringify(files)),
    ruby_verification:"PENDING_INDEPENDENT_CONFIRMATION",
    green_retention_eligible:false
  };
}

export function receiveDeepSeekResearch(payload, meta={}) {
  const source_run_id=Number(meta.run_id);
  const source_sha=text(meta.source_sha,60);
  const errors=[];
  if(!Number.isSafeInteger(source_run_id)||source_run_id<=0)errors.push("RUN_ID_REQUIRED");
  if(!shaPattern.test(source_sha))errors.push("SOURCE_SHA_REQUIRED");
  if(payload?.ok!==true || payload?.http_status!==200)errors.push("NO_SUCCESSFUL_PROVIDER_RESPONSE");
  if(typeof payload?.model!=="string"||!payload.model.startsWith("deepseek-"))errors.push("PROVIDER_MODEL_UNVERIFIED");
  if(payload?.calls!==1||payload?.retries!==0||payload?.fallbacks!==0)errors.push("UNBOUNDED_PROVIDER_USAGE");
  const answer=typeof payload?.answer==="string"?payload.answer.trim():"";
  if(!answer||answer.length>14500)errors.push("ANSWER_MISSING_OR_UNBOUNDED");
  if(SECRET.test(answer))errors.push("SENSITIVE_TEXT_REJECTED");
  const sources=Array.isArray(payload?.source_urls)?payload.source_urls:[];
  if(sources.length===0||sources.length>20||sources.some(s=>!/^https:\/\/(?:developers\.cloudflare\.com|docs\.github\.com|github\.com|api-docs\.deepseek\.com|playwright\.dev)\//.test(String(s))))
    errors.push("SOURCE_PROVENANCE_INVALID");
  if(payload?.inputs!=="PUBLIC_DOCUMENTATION_AND_PUBLIC_REPO_CONTRACTS_ONLY")
    errors.push("SOURCE_SCOPE_UNVERIFIED");
  if(payload?.no_browsing_tools!==true)errors.push("BROWSING_ATTESTATION_MISSING");
  const valid=errors.length===0;
  return {
    schema_version:"OGE95_DEEPSEEK_RECEIPT_V1",
    ok:valid,status:valid?"RECEIVED_UNVERIFIED":"BLOCKED",
    source_provider:"deepseek", source_run_id,source_sha,
    research_source:"PROVIDED_OFFICIAL_DOC_EXCERPTS_NOT_LIVE_WEB_RESEARCH",
    answer_sha256:valid?sha256(answer):null,
    answer:valid?answer:null,
    referenced_sources:valid?sources:[],
    tokens:valid?{
      input:Number(payload?.usage?.prompt_tokens||0),
      output:Number(payload?.usage?.completion_tokens||0),
      total:Number(payload?.usage?.total_tokens||0)}:null,
    evidence_ref:valid?`github-actions-run:${source_run_id}`:null,
    ruby_verification:"NOT_VERIFIED",
    green_retention_eligible:false,
    auto_patch_allowed:false,auto_deploy_allowed:false,
    errors,
  };
}

export function factoryReceipt(order,output) {
  const completed=order?.ok && output?.ok;
  return {
    schema_version:"OGE95_FACTORY_RECEIPT_V1",
    job_id:order?.task_id||null,
    source_sha:order?.source_sha||null,
    idempotency_key:order?.idempotency_key||null,
    stages:[
      {stage:"SOURCE",state:order?.ok?"PASS":"BLOCKED"},
      {stage:"DISTILL",state:order?.operation==="deepseek_research_ingest"?(output?.ok?"RECEIVED_UNVERIFIED":"BLOCKED"):"NOT_APPLICABLE"},
      {stage:"REPRODUCE",state:order?.operation==="replica_source_audit"?(output?.ok?"PASS":"FAIL"):"NOT_APPLICABLE"},
      {stage:"VERIFY",state:"PENDING_RUBY"},
      {stage:"RETAIN",state:"BLOCKED_UNTIL_RUBY"},
    ],
    status:completed?"EVIDENCE_READY":"BLOCKED",
    proof_sha256:sha256(JSON.stringify({job:order?.idempotency_key,output:output?.evidence_hash||output?.answer_sha256||null})),
    auto_deploy:false,retain_in_green:false,
    source:output,
  };
}
