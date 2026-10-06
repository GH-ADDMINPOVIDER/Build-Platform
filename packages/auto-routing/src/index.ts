export type PermissionClass = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";
export type ReadinessState = "VERIFIED" | "DEGRADED" | "CONFIGURATION_REQUIRED" | "OFFLINE" | "NOT_MEASURED";
export type CostState = "ZERO_COST" | "INCLUDED" | "METERED" | "NOT_MEASURED" | "BLOCKED" | "EXHAUSTED";
export type CapMetricState = "MEASURED" | "NOT_MEASURED";

export type AutoRouteCandidate = {
  agent_id: string;
  provider_id: string;
  capability_id: string;
  environment: string;
  permission_class: PermissionClass;
  readiness: ReadinessState;
  cost_state: CostState;
  capsig: {
    generated_by: "RUBY_STONE";
    self_scored: false;
    dimension: string;
    state: CapMetricState;
    score: number | null;
    sample_size: number;
    evidence_refs: string[];
  };
  model_name?: string;
};

export type AutoRouteRequest = {
  capability_id: string;
  environment: string;
  permission_class: PermissionClass;
  dimension: string;
  allow_unmeasured_cost?: boolean;
};

export type AutoRouteDecision =
  | {
      state: "SELECTED";
      candidate: AutoRouteCandidate;
      approval_required: boolean;
      execution_authority: "YELLOW_STONE_ONLY";
      direct_execution_bypass: false;
      provider_fallback: "DENIED";
      evidence_refs: string[];
    }
  | {
      state: "NO_ELIGIBLE_ROUTE";
      code: "AUTO_ROUTE_NOT_FOUND";
      approval_required: boolean;
      execution_authority: "YELLOW_STONE_ONLY";
      direct_execution_bypass: false;
      provider_fallback: "DENIED";
      evidence_refs: [];
    };

const SAFE_COST_ORDER: Record<Exclude<CostState, "NOT_MEASURED" | "BLOCKED" | "EXHAUSTED">, number> = {
  ZERO_COST: 3,
  INCLUDED: 2,
  METERED: 1,
};

function eligible(candidate: AutoRouteCandidate, request: AutoRouteRequest) {
  if (candidate.capability_id !== request.capability_id) return false;
  if (candidate.environment !== request.environment) return false;
  if (candidate.permission_class !== request.permission_class) return false;
  if (candidate.readiness !== "VERIFIED") return false;
  if (candidate.cost_state === "BLOCKED" || candidate.cost_state === "EXHAUSTED") return false;
  if (candidate.cost_state === "NOT_MEASURED" && request.allow_unmeasured_cost !== true) return false;
  if (candidate.capsig.generated_by !== "RUBY_STONE" || candidate.capsig.self_scored !== false) return false;
  if (candidate.capsig.dimension !== request.dimension) return false;
  if (candidate.capsig.state !== "MEASURED") return false;
  if (!Number.isFinite(candidate.capsig.score) || candidate.capsig.score === null) return false;
  if (!Number.isFinite(candidate.capsig.sample_size) || candidate.capsig.sample_size <= 0) return false;
  return true;
}

function costRank(state: CostState) {
  if (state === "NOT_MEASURED") return 0;
  if (state === "BLOCKED" || state === "EXHAUSTED") return -1;
  return SAFE_COST_ORDER[state];
}

export function selectAutoRoute(candidates: AutoRouteCandidate[], request: AutoRouteRequest): AutoRouteDecision {
  const approvalRequired = request.permission_class !== "READ";
  const ranked = candidates.filter((candidate) => eligible(candidate, request)).sort((left, right) => {
    const scoreDelta = Number(right.capsig.score) - Number(left.capsig.score);
    if (scoreDelta) return scoreDelta;
    const sampleDelta = right.capsig.sample_size - left.capsig.sample_size;
    if (sampleDelta) return sampleDelta;
    const costDelta = costRank(right.cost_state) - costRank(left.cost_state);
    if (costDelta) return costDelta;
    const agent = left.agent_id.localeCompare(right.agent_id);
    if (agent) return agent;
    return left.provider_id.localeCompare(right.provider_id);
  });

  const candidate = ranked[0];
  if (!candidate) {
    return {
      state: "NO_ELIGIBLE_ROUTE",
      code: "AUTO_ROUTE_NOT_FOUND",
      approval_required: approvalRequired,
      execution_authority: "YELLOW_STONE_ONLY",
      direct_execution_bypass: false,
      provider_fallback: "DENIED",
      evidence_refs: [],
    };
  }

  return {
    state: "SELECTED",
    candidate,
    approval_required: approvalRequired,
    execution_authority: "YELLOW_STONE_ONLY",
    direct_execution_bypass: false,
    provider_fallback: "DENIED",
    evidence_refs: [...new Set(candidate.capsig.evidence_refs.filter(Boolean))],
  };
}
