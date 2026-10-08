import providerCatalog from "../config/providers.json";
import attestations from "../config/provider-readiness-attestations.json";
import rulesCenter from "../config/oge95-rules-center.json";
const onboardingPolicy = rulesCenter.runtime_contracts.provider_onboarding;
import type { ProviderReadiness } from "./provider-readiness";

type OnboardingAction =
  | "SET_UP_SECRET"
  | "VERIFY_RUNTIME_ONCE"
  | "RECONCILE_CATALOG"
  | "IMPLEMENT_ADAPTER"
  | "READY_EXPLICIT_ONLY"
  | "READY_AUTO_READ";

type Stage = "REGISTERED" | "KEY_BOUND" | "RUNTIME_VERIFIED" | "ROUTE_ELIGIBLE";
type ReadRoute = {
  capability_id: string;
  permission_class: string;
  selection: "EXPLICIT_ONLY" | "AUTO_READ_EXISTING";
};

const routeProfiles = onboardingPolicy.verified_read_routes as Record<string, ReadRoute | undefined>;
const proofRegistry = attestations.providers as Record<string, {
  verification_state?: string;
  http_status?: number;
  evidence_ref?: string;
  api?: string;
  quota?: string;
  billing?: string;
} | undefined>;

/** One zero-cost decision per provider. This never handles key values or invokes a provider. */
export function buildProviderOnboardingPreflight(reports: ProviderReadiness[]) {
  return reports.map((report) => {
    const catalog = providerCatalog.providers.find((provider) => provider.id === report.provider);
    const proof = proofRegistry[report.provider];
    const route = routeProfiles[report.provider];
    const runtimeVerified = report.readiness === "VERIFIED" &&
      report.api_reachable === "REACHABLE" &&
      report.quota_state === "AVAILABLE" &&
      report.billing_state === "ACTIVE";
    const evidenceVerified = proof?.verification_state === "VERIFIED" &&
      proof.http_status === 200 &&
      typeof proof.evidence_ref === "string" && proof.evidence_ref.length > 0;
    let stage: Stage = "REGISTERED";
    let nextAction: OnboardingAction = "SET_UP_SECRET";

    if (report.key_present) {
      stage = "KEY_BOUND";
      nextAction = "VERIFY_RUNTIME_ONCE";
      if (runtimeVerified && evidenceVerified) {
        stage = "RUNTIME_VERIFIED";
        nextAction = catalog?.status === "active" ? "IMPLEMENT_ADAPTER" : "RECONCILE_CATALOG";
        if (catalog?.status === "active" && route?.permission_class === "READ") {
          stage = "ROUTE_ELIGIBLE";
          nextAction = route.selection === "EXPLICIT_ONLY" ? "READY_EXPLICIT_ONLY" : "READY_AUTO_READ";
        }
      }
    }

    return {
      provider: report.provider,
      stage,
      next_action: nextAction,
      readiness: report.readiness,
      registered: Boolean(catalog),
      key_present: report.key_present,
      evidence_verified: evidenceVerified && runtimeVerified,
      adapter_ready: Boolean(route?.permission_class === "READ"),
      // Advisory hint only; the actual Yellow resolver decides at execution.
      route_eligible: stage === "ROUTE_ELIGIBLE",
      route_status: "NOT_CHECKED_YELLOW",
      preflight_required: false,
      route_capability: stage === "ROUTE_ELIGIBLE" ? route?.capability_id : null,
      selection: stage === "ROUTE_ELIGIBLE" ? route?.selection : null,
      paid_preflight_calls: 0,
    };
  });
}

export const PROVIDER_ONBOARDING_POLICY = {
  schema_version: onboardingPolicy.schema_version,
  stages: onboardingPolicy.stages,
  runtime_preflight: onboardingPolicy.runtime_preflight,
  execution_flow: onboardingPolicy.execution_flow,
  hard_gates: onboardingPolicy.hard_gates,
} as const;
