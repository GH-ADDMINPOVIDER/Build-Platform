export const KNOWLEDGE_REFINERY_VERSION = "KNOWLEDGE_REFINERY_V1";
export const CANONICAL_CONVERSATION = "owner-main";
export const CANONICAL_SESSION = "1LSS_OWNER_MAIN";

export type KnowledgeActorClass = "agent" | "worker" | "gate" | "state";
export type KnowledgeState = "LIVE" | "DEGRADED" | "CONFIGURATION_REQUIRED" | "BRIDGE_ONLY" | "RUNTIME_REQUIRED";
export type KnowledgeStage = "SOURCE" | "DISTILL" | "REPRODUCE" | "FIX" | "SPECIALIST_REVIEW" | "VERIFY" | "RETAIN";
export type SourceAccess = "FULL_CONTEXT" | "DISTILL_ONLY" | "REJECT";
export type VerifyState = "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED";

export type KnowledgeActor = {
  id: string;
  label: string;
  actor_class: KnowledgeActorClass;
  provider: string;
  role: string;
  agent: boolean;
  activation: "ALWAYS_AVAILABLE" | "ON_DEMAND" | "PIPELINE_GATE" | "STATE_TARGET";
  capabilities: string[];
  state: KnowledgeState;
  yellow_authority_required: boolean;
};

export type KnowledgeSource = {
  source_ref: string;
  first_party?: boolean;
  owner_authorized?: boolean;
  public?: boolean;
  reuse_permission?: boolean;
  license_id?: string | null;
};

export type KnowledgePlanInput = {
  intent: string;
  source: KnowledgeSource;
  confidence?: number;
  repeated_failures?: number;
  cross_file_count?: number;
  queue_depth?: number;
  budget_authorized?: boolean;
};

export type KnowledgeRecord = {
  provenance_ref: string;
  distilled_summary: string;
  verification_state: VerifyState;
  ruby_evidence_ref?: string | null;
  source_access: SourceAccess;
  secret_scan_passed: boolean;
  knowledge_value?: number;
};

const SECRET_PATTERN = /(api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie|authorization:\s*bearer|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)/i;

function has(env: Record<string, unknown>, key: string) {
  return typeof env[key] === "string" && String(env[key]).trim().length > 0;
}

export function buildKnowledgeActors(env: Record<string, unknown> = {}): KnowledgeActor[] {
  return [
    {
      id: "deepseek-code-intelligence",
      label: "DeepSeek • Agent • Chief Reasoning Officer",
      actor_class: "agent",
      provider: "deepseek",
      role: "CODE_INTELLIGENCE_RESEARCH",
      agent: true,
      activation: "ALWAYS_AVAILABLE",
      capabilities: ["research", "code_reasoning", "debug_pattern_distill", "source_synthesis"],
      state: has(env, "DEEPSEEK_API_KEY") ? "DEGRADED" : "CONFIGURATION_REQUIRED",
      yellow_authority_required: true,
    },
    {
      id: "docker-sandbox-worker",
      label: "Docker • Worker • Sandbox",
      actor_class: "worker",
      provider: "docker",
      role: "ISOLATED_REPRODUCE_TEST",
      agent: false,
      activation: "ALWAYS_AVAILABLE",
      capabilities: ["reproduce", "sandbox_test", "dependency_isolation", "environment_matrix"],
      state: "RUNTIME_REQUIRED",
      yellow_authority_required: true,
    },
    {
      id: "codex-cto",
      label: "Codex • Agent • CTO",
      actor_class: "agent",
      provider: "openai-selfhost",
      role: "PRIMARY_CODE_FIX",
      agent: true,
      activation: "ALWAYS_AVAILABLE",
      capabilities: ["code_search", "read_file", "write_file", "test", "build", "git_diff"],
      state: has(env, "OPENAI_EXECUTOR_API_KEY") ? "DEGRADED" : "CONFIGURATION_REQUIRED",
      yellow_authority_required: true,
    },
    {
      id: "cursor-debug-specialist",
      label: "Cursor • Agent • Build Director",
      actor_class: "agent",
      provider: "cursor",
      role: "HARD_DEBUG_SPECIALIST",
      agent: true,
      activation: "ON_DEMAND",
      capabilities: ["cross_file_debug", "repo_reasoning", "large_refactor_review"],
      state: "BRIDGE_ONLY",
      yellow_authority_required: true,
    },
    {
      id: "ruby-verifier",
      label: "Ruby Stone • Verification Gate",
      actor_class: "gate",
      provider: "ogenic",
      role: "EVIDENCE_BACKED_VERIFY",
      agent: false,
      activation: "PIPELINE_GATE",
      capabilities: ["test", "evaluate", "score", "evidence_verify"],
      state: "LIVE",
      yellow_authority_required: true,
    },
    {
      id: "green-retention",
      label: "Green Stone • Canonical Retention",
      actor_class: "state",
      provider: "ogenic",
      role: "VERIFIED_KNOWLEDGE_RETENTION",
      agent: false,
      activation: "STATE_TARGET",
      capabilities: ["retain_verified_knowledge", "1lss_reference", "continuity"],
      state: "LIVE",
      yellow_authority_required: false,
    },
  ];
}

export function sourceAccess(source: KnowledgeSource): SourceAccess {
  if (!source.source_ref || SECRET_PATTERN.test(source.source_ref)) return "REJECT";
  if (source.first_party || source.owner_authorized) return "FULL_CONTEXT";
  if (source.public) return "DISTILL_ONLY";
  return "REJECT";
}

export function mayReuseCode(source: KnowledgeSource) {
  return Boolean(source.first_party || source.owner_authorized || source.reuse_permission);
}

export function shouldEscalateToCursor(input: KnowledgePlanInput) {
  const confidence = Math.max(0, Math.min(1, Number(input.confidence ?? 1)));
  const repeated = Math.max(0, Number(input.repeated_failures ?? 0));
  const crossFiles = Math.max(0, Number(input.cross_file_count ?? 0));
  return confidence < 0.65 || repeated >= 2 || crossFiles >= 8;
}

export function buildKnowledgePlan(input: KnowledgePlanInput) {
  const access = sourceAccess(input.source);
  if (!String(input.intent || "").trim()) return { ok: false as const, code: "INTENT_REQUIRED" };
  if (access === "REJECT") return { ok: false as const, code: "SOURCE_NOT_ALLOWED", source_access: access };

  const stages: Array<{ stage: KnowledgeStage; actor_id: string; side_effects: boolean }> = [
    { stage: "SOURCE", actor_id: "deepseek-code-intelligence", side_effects: false },
    { stage: "DISTILL", actor_id: "deepseek-code-intelligence", side_effects: false },
    { stage: "REPRODUCE", actor_id: "docker-sandbox-worker", side_effects: false },
    { stage: "FIX", actor_id: "codex-cto", side_effects: true },
  ];
  if (shouldEscalateToCursor(input)) stages.push({ stage: "SPECIALIST_REVIEW", actor_id: "cursor-debug-specialist", side_effects: false });
  stages.push(
    { stage: "VERIFY", actor_id: "ruby-verifier", side_effects: false },
    { stage: "RETAIN", actor_id: "green-retention", side_effects: false },
  );

  return {
    ok: true as const,
    version: KNOWLEDGE_REFINERY_VERSION,
    canonical: { conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION },
    source_access: access,
    code_reuse: mayReuseCode(input.source) ? "PERMISSION_PRESENT" : "REFERENCE_AND_DISTILL_ONLY",
    yellow_execution_authority: "YELLOW_STONE_ONLY",
    violet_orchestration: true,
    ruby_verification_required: true,
    green_retention_requires_verified_evidence: true,
    stages,
  };
}

export function buildIdleResearchDecision(input: KnowledgePlanInput) {
  const access = sourceAccess(input.source);
  const queueEmpty = Number(input.queue_depth ?? 0) === 0;
  const budgetAuthorized = input.budget_authorized === true;
  const permitted = queueEmpty && budgetAuthorized && access !== "REJECT";
  return {
    mode: "BUDGET_GATED",
    permitted,
    permission_class: "READ",
    side_effects: false,
    reason: !queueEmpty ? "WORK_QUEUE_NOT_IDLE" : !budgetAuthorized ? "BUDGET_APPROVAL_REQUIRED" : access === "REJECT" ? "SOURCE_NOT_ALLOWED" : "IDLE_RESEARCH_ALLOWED",
  };
}

export function sanitizeDistilledKnowledge(value: unknown) {
  const text = String(value ?? "").trim().slice(0, 12000);
  if (!text) return "";
  if (SECRET_PATTERN.test(text)) return "[REDACTED_SENSITIVE_KNOWLEDGE]";
  return text;
}

export function retentionDecision(record: KnowledgeRecord) {
  const summary = sanitizeDistilledKnowledge(record.distilled_summary);
  const value = Math.max(0, Math.min(1, Number(record.knowledge_value ?? 1)));
  const retain = Boolean(
    record.provenance_ref &&
    record.source_access !== "REJECT" &&
    record.secret_scan_passed &&
    record.verification_state === "PASS" &&
    record.ruby_evidence_ref &&
    summary &&
    summary !== "[REDACTED_SENSITIVE_KNOWLEDGE]" &&
    value >= 0.6
  );
  return {
    retain,
    target: retain ? "GREEN_1LSS" : "RESEARCH_EVIDENCE_ONLY",
    event_type: retain ? "KNOWLEDGE_RETAINED" : "KNOWLEDGE_NOT_PROMOTED",
    reason: retain ? "RUBY_VERIFIED_HIGH_VALUE" : "VERIFICATION_OR_POLICY_INCOMPLETE",
  };
}

export const KNOWLEDGE_EVENT_TYPES = [
  "KNOWLEDGE_DISCOVERED",
  "KNOWLEDGE_DISTILLED",
  "KNOWLEDGE_REPRODUCED",
  "KNOWLEDGE_FIX_PROPOSED",
  "KNOWLEDGE_RUBY_VERIFIED",
  "KNOWLEDGE_RETAINED",
] as const;

// Contract: this layer reuses existing operational evidence/state. It does not create or alter D1 tables.
