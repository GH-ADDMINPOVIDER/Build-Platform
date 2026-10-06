import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ONE_PASS_POLICY_VERSION = "OGE48_ONE_PASS_RUNTIME_REFINERY_V1";
export const CANONICAL = {
  repository: "Ogenicchocolate21debug/Build-Platform",
  branch: "phase-vi-provider-incentive-metering",
  conversation: "owner-main",
  session_line: "1LSS_OWNER_MAIN",
};

const VERIFIED = "VERIFIED";

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function bool(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function fingerprint(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function buildOnePassPlan(input = {}) {
  const task = clean(input.task, 4000);
  const taskId = clean(input.task_id || "task", 120);
  const worker = clean(input.worker || "coordinator", 80).toLowerCase();
  const researchProvider = clean(input.research_provider || "perplexity", 80).toLowerCase();
  const readiness = clean(input.research_readiness || "NOT_MEASURED", 80).toUpperCase();
  const taskFingerprint = fingerprint(task);
  const previousFingerprint = clean(input.previous_task_fingerprint, 128);
  const newEvidence = input.new_evidence === true;
  const researchEvidenceRef = clean(input.research_evidence_ref, 500);
  const sameTaskNoEvidence = Boolean(previousFingerprint && previousFingerprint === taskFingerprint && !newEvidence);

  const policy = {
    think_budget: 1,
    attempt_budget: 1,
    verify_budget: 1,
    auto_retry: false,
    self_repair: false,
    auto_strategy_switch: false,
    provider_fallback: "DENIED_WITHIN_ATTEMPT",
    no_new_evidence_no_model_call: true,
    blocked_transition: "DEFERRED",
    hitl_after_batch: true,
    canonical_write: "SERIAL_REDUCER_YELLOW_ONLY",
    raw_reasoning_retention: "DENIED",
    green_retention: "RUBY_VERIFIED_ONLY",
  };

  if (!task) {
    return {
      ok: false,
      state: "REJECTED",
      code: "TASK_REQUIRED",
      policy,
      canonical: CANONICAL,
      provider_call_allowed: false,
    };
  }

  if (sameTaskNoEvidence) {
    return {
      ok: true,
      state: "WAITING_FOR_NEW_EVIDENCE",
      code: "DUPLICATE_TASK_NO_NEW_EVIDENCE",
      task_id: taskId,
      task_fingerprint: taskFingerprint,
      worker,
      policy,
      canonical: CANONICAL,
      provider_call_allowed: false,
      hitl_queue: false,
      stages: {
        athena: "ADMITTED_PREVIOUSLY",
        violet: "NO_REDISPATCH",
        research: "WAITING_FOR_NEW_EVIDENCE",
        docker: "SKIPPED",
        ruby: "SKIPPED",
        refinery: "SKIPPED",
        green: "UNCHANGED",
      },
    };
  }

  const researchVerified = readiness === VERIFIED;
  if (!researchVerified) {
    return {
      ok: true,
      state: "DEFERRED",
      code: "RESEARCH_PROVIDER_NOT_VERIFIED",
      task_id: taskId,
      task_fingerprint: taskFingerprint,
      worker,
      policy,
      canonical: CANONICAL,
      provider_call_allowed: false,
      hitl_queue: true,
      blocker: {
        stage: "RESEARCH",
        provider: researchProvider,
        readiness,
        exact_reason: "SELECTED_RESEARCH_PROVIDER_IS_NOT_VERIFIED",
        retry_allowed: false,
        strategy_switch_allowed: false,
      },
      stages: {
        athena: "ADMITTED",
        violet: "ROUTED_ONCE",
        research: "DEFERRED",
        docker: "WAITING_FOR_RESEARCH_EVIDENCE",
        ruby: "WAITING",
        refinery: "WAITING",
        green: "UNCHANGED",
      },
    };
  }

  const hasResearchEvidence = Boolean(researchEvidenceRef);
  return {
    ok: true,
    state: hasResearchEvidence ? "READY_FOR_DOCKER_RUN_ONCE" : "READY_FOR_RESEARCH_RUN_ONCE",
    code: hasResearchEvidence ? "RESEARCH_EVIDENCE_PRESENT" : "RESEARCH_PROVIDER_VERIFIED",
    task_id: taskId,
    task_fingerprint: taskFingerprint,
    worker,
    policy,
    canonical: CANONICAL,
    provider_call_allowed: !hasResearchEvidence,
    selected_research_provider: researchProvider,
    research_readiness: readiness,
    research_evidence_ref: researchEvidenceRef || null,
    hitl_queue: false,
    stages: {
      athena: "ADMITTED",
      violet: "ROUTED_ONCE",
      research: hasResearchEvidence ? "DONE_EVIDENCE_PRESENT" : "RUN_ONCE",
      docker: hasResearchEvidence ? "RUN_ONCE" : "WAITING_FOR_RESEARCH_EVIDENCE",
      ruby: "VERIFY_ONCE_AFTER_DOCKER",
      refinery: "DISTILL_ONLY_AFTER_RUBY_PASS",
      green: "RETAIN_ONLY_AFTER_RUBY_PASS",
    },
  };
}

function readEvidenceRef(path) {
  const value = clean(path, 1000);
  if (!value || !existsSync(value)) return "";
  const raw = readFileSync(value, "utf8");
  if (!raw.trim()) return "";
  return value;
}

export function cli(argv = process.argv.slice(2), env = process.env) {
  const args = new Map();
  for (const value of argv) {
    if (!value.startsWith("--")) continue;
    const [key, ...rest] = value.slice(2).split("=");
    args.set(key, rest.join("="));
  }

  const task = args.get("task") || env.OGENIC_AGENT_TASK || "";
  const output = resolve(args.get("output") || ".ogenic-refinery/one-pass-plan.json");
  const researchProvider = args.get("research") || env.OGENIC_RESEARCH_PROVIDER || "perplexity";
  const readinessKey = researchProvider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const readiness =
    args.get("readiness") ||
    env[`OGENIC_READINESS_${readinessKey}_STATE`] ||
    "NOT_MEASURED";
  const evidenceRef = readEvidenceRef(args.get("research-evidence") || "");
  const plan = buildOnePassPlan({
    task,
    task_id: args.get("task-id") || env.OGENIC_TASK_ID || "task",
    worker: args.get("worker") || env.AI_WORKER_NAME || "coordinator",
    research_provider: researchProvider,
    research_readiness: readiness,
    research_evidence_ref: evidenceRef,
    previous_task_fingerprint: args.get("previous-fingerprint") || env.OGENIC_PREVIOUS_TASK_FINGERPRINT || "",
    new_evidence: bool(args.get("new-evidence") || env.OGENIC_NEW_EVIDENCE),
  });

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(plan, null, 2) + "\n");
  process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
  return plan;
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) cli();
