export const KNOWLEDGE_REFINERY_V2_VERSION = "KNOWLEDGE_REFINERY_V2";

export const KNOWLEDGE_KINDS = [
  "code_pattern",
  "debug_rule",
  "build_recipe",
  "creation_template",
  "decision_rule",
  "formula",
] as const;

export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number];
export type RuleVerificationState = "UNVERIFIED" | "PASS" | "FAIL" | "INVALIDATED";
export type LicensePolicy = "FIRST_PARTY" | "OWNER_AUTHORIZED" | "PUBLIC_LICENSED";

export type RuleEnvelope = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  problem_signature: string;
  trigger_conditions: string[];
  inputs: string[];
  procedure_or_expression: string;
  expected_outputs: string[];
  constraints: string[];
  confidence: number;
  evidence_refs: string[];
  provenance_refs: string[];
  license_policy: LicensePolicy;
  version: number;
  invalidation_conditions: string[];
  created_at: string;
  verified_at: string | null;
  verification_state: RuleVerificationState;
};

export type RubyVerificationReceipt = {
  verifier: "RUBY_STONE";
  state: "PASS" | "FAIL";
  evidence_refs: string[];
  verified_at: string;
};

export type RuleReuseFeedback = {
  outcome: "SUCCESS" | "FAILURE";
  evidence_ref: string;
  invalidation_matched?: boolean;
};

const SECRET_PATTERN = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie|authorization:\s*bearer|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/i;
const REQUIRED_CONFIDENCE = 0.6;

const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const list = (value: unknown, maxItems = 32, maxLength = 800) =>
  Array.isArray(value)
    ? value.map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];

function unique(values: string[]) {
  return [...new Set(values)];
}

function safeText(value: unknown) {
  const text = clean(value, 12_000);
  return text && !SECRET_PATTERN.test(text);
}

export function validateRuleEnvelope(candidate: RuleEnvelope) {
  const errors: string[] = [];
  if (!clean(candidate.id, 160)) errors.push("ID_REQUIRED");
  if (!KNOWLEDGE_KINDS.includes(candidate.kind)) errors.push("KIND_INVALID");
  if (!safeText(candidate.title)) errors.push("TITLE_INVALID");
  if (!safeText(candidate.problem_signature)) errors.push("PROBLEM_SIGNATURE_INVALID");
  if (!list(candidate.trigger_conditions).length) errors.push("TRIGGER_CONDITIONS_REQUIRED");
  if (!list(candidate.inputs).length) errors.push("INPUTS_REQUIRED");
  if (!safeText(candidate.procedure_or_expression)) errors.push("PROCEDURE_OR_EXPRESSION_INVALID");
  if (!list(candidate.expected_outputs).length) errors.push("EXPECTED_OUTPUTS_REQUIRED");
  if (!list(candidate.constraints).length) errors.push("CONSTRAINTS_REQUIRED");
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) errors.push("CONFIDENCE_INVALID");
  if (!list(candidate.evidence_refs).length) errors.push("EVIDENCE_REQUIRED");
  if (!list(candidate.provenance_refs).length) errors.push("PROVENANCE_REQUIRED");
  if (!["FIRST_PARTY", "OWNER_AUTHORIZED", "PUBLIC_LICENSED"].includes(candidate.license_policy)) errors.push("LICENSE_POLICY_INVALID");
  if (!Number.isInteger(candidate.version) || candidate.version < 1) errors.push("VERSION_INVALID");
  if (!list(candidate.invalidation_conditions).length) errors.push("INVALIDATION_CONDITIONS_REQUIRED");
  if (!clean(candidate.created_at, 80)) errors.push("CREATED_AT_REQUIRED");
  if (SECRET_PATTERN.test(JSON.stringify(candidate))) errors.push("SECRET_LIKE_CONTENT_REJECTED");
  return {
    ok: errors.length === 0,
    code: errors.length ? "RULE_ENVELOPE_REJECTED" : "RULE_ENVELOPE_ADMITTED",
    errors,
    blue_admission: errors.length === 0 ? "ADMITTED" : "REJECTED",
    execution_authority: "YELLOW_STONE_ONLY",
  } as const;
}

export function applyRubyVerification(candidate: RuleEnvelope, receipt: RubyVerificationReceipt): RuleEnvelope {
  const validation = validateRuleEnvelope(candidate);
  if (!validation.ok) return { ...candidate, verification_state: "INVALIDATED", verified_at: null, confidence: 0 };
  if (receipt.verifier !== "RUBY_STONE") return { ...candidate, verification_state: "INVALIDATED", verified_at: null, confidence: Math.max(0, candidate.confidence - 0.25) };
  if (receipt.state !== "PASS" || !list(receipt.evidence_refs).length) {
    return {
      ...candidate,
      verification_state: "FAIL",
      verified_at: clean(receipt.verified_at, 80) || null,
      confidence: Math.max(0, Number((candidate.confidence - 0.15).toFixed(3))),
      evidence_refs: unique([...candidate.evidence_refs, ...list(receipt.evidence_refs, 32, 500)]),
    };
  }
  return {
    ...candidate,
    verification_state: "PASS",
    verified_at: clean(receipt.verified_at, 80),
    confidence: Math.min(1, Number((candidate.confidence + 0.05).toFixed(3))),
    evidence_refs: unique([...candidate.evidence_refs, ...list(receipt.evidence_refs, 32, 500)]),
  };
}

export function applyRuleReuseFeedback(rule: RuleEnvelope, feedback: RuleReuseFeedback): RuleEnvelope {
  const evidence = clean(feedback.evidence_ref, 500);
  if (!evidence) return { ...rule, verification_state: "INVALIDATED", confidence: 0 };
  const success = feedback.outcome === "SUCCESS";
  const confidence = success
    ? Math.min(1, Number((rule.confidence + 0.03).toFixed(3)))
    : Math.max(0, Number((rule.confidence - 0.15).toFixed(3)));
  const invalidated = feedback.invalidation_matched === true || (!success && confidence < REQUIRED_CONFIDENCE);
  return {
    ...rule,
    confidence,
    evidence_refs: unique([...rule.evidence_refs, evidence]),
    verification_state: invalidated ? "INVALIDATED" : rule.verification_state,
    verified_at: invalidated ? rule.verified_at : rule.verified_at,
  };
}

export function ruleRetentionDecision(rule: RuleEnvelope) {
  const validation = validateRuleEnvelope(rule);
  const retain = Boolean(
    validation.ok &&
    rule.verification_state === "PASS" &&
    rule.verified_at &&
    rule.confidence >= REQUIRED_CONFIDENCE &&
    rule.evidence_refs.length &&
    rule.provenance_refs.length
  );
  return {
    retain,
    target: retain ? "GREEN_1LSS" : "RESEARCH_EVIDENCE_ONLY",
    event_type: retain ? "KNOWLEDGE_RULE_RETAINED" : "KNOWLEDGE_RULE_NOT_PROMOTED",
    reason: retain ? "RUBY_VERIFIED_RULE" : "RULE_NOT_VERIFIED_OR_CONFIDENCE_TOO_LOW",
    raw_repository_retention: false,
    second_memory_database: false,
  } as const;
}

export function normalizeRuleEnvelope(candidate: RuleEnvelope): RuleEnvelope {
  return {
    ...candidate,
    id: clean(candidate.id, 160),
    title: clean(candidate.title, 300),
    problem_signature: clean(candidate.problem_signature, 1200),
    trigger_conditions: list(candidate.trigger_conditions),
    inputs: list(candidate.inputs),
    procedure_or_expression: clean(candidate.procedure_or_expression, 8000),
    expected_outputs: list(candidate.expected_outputs),
    constraints: list(candidate.constraints),
    evidence_refs: unique(list(candidate.evidence_refs, 32, 500)),
    provenance_refs: unique(list(candidate.provenance_refs, 32, 500)),
    invalidation_conditions: list(candidate.invalidation_conditions),
  };
}

// Contract: V2 only distills verified reusable knowledge. It never creates D1 tables,
// never stores raw provider secrets, and never replaces Green/1LSS canonical state.
