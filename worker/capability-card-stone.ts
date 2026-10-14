import ccsConfig from "../config/capability-card-stone.json";
import { resolveCanonicalAlias } from "./web-toolkit-alias";
import type { UseCardDescriptor } from "./use-card-policy";

export type CcsVerb = "INSERT" | "VERIFY" | "USE" | "LEASE" | "RETURN" | "REVOKE";
export type CcsState =
  | "ABSENT"
  | "INSERTED"
  | "VERIFIED"
  | "IN_USE"
  | "LEASED"
  | "RETURNED"
  | "REVOKED"
  | "BLOCKED";

export type CcsCardView = {
  protocol: "CCS/1.0";
  card_id: string;
  stone_code: string;
  holder: string;
  role: string;
  capability: string;
  scope: {
    environment: string | null;
    permission: string;
  };
  state: string;
  lease: {
    eligible: boolean;
  };
  evidence: {
    required: true;
    verifier: "RUBY";
  };
};

export type CcsTransition = {
  ok: boolean;
  code: string;
  verb: CcsVerb;
  from: CcsState;
  to: CcsState;
  stone_code: string;
  authority: "POLICY_GATED";
};

const transitions: Record<CcsState, Partial<Record<CcsVerb, CcsState>>> = {
  ABSENT: { INSERT: "INSERTED" },
  INSERTED: { VERIFY: "VERIFIED", REVOKE: "REVOKED" },
  VERIFIED: { USE: "IN_USE", LEASE: "LEASED", REVOKE: "REVOKED" },
  IN_USE: { RETURN: "RETURNED", LEASE: "LEASED", REVOKE: "REVOKED" },
  LEASED: { RETURN: "RETURNED", REVOKE: "REVOKED" },
  RETURNED: { INSERT: "INSERTED", REVOKE: "REVOKED" },
  REVOKED: {},
  BLOCKED: { REVOKE: "REVOKED" },
};

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

/** Resolve legacy names to the one canonical CCS Web Toolkit card. */
export function resolveWebToolkitAlias(value: unknown) {
  return resolveCanonicalAlias(value, ccsConfig.primary_card);
}
export function toCcsCardView(card: UseCardDescriptor, role = "capability_holder"): CcsCardView {
  return {
    protocol: "CCS/1.0",
    card_id: clean(card.card_id, 260),
    stone_code: ccsConfig.stone_code,
    holder: clean(card.holder, 120),
    role: clean(role, 120) || "capability_holder",
    capability: clean(card.capability_id, 160),
    scope: {
      environment: card.environment,
      permission: card.permission_class,
    },
    state: card.state,
    lease: {
      eligible: card.lease_eligible,
    },
    evidence: {
      required: true,
      verifier: "RUBY",
    },
  };
}

export function transitionCcsState(from: CcsState, verb: CcsVerb): CcsTransition {
  const next = transitions[from]?.[verb];
  if (!next) {
    return {
      ok: false,
      code: "CCS_TRANSITION_DENIED",
      verb,
      from,
      to: "BLOCKED",
      stone_code: ccsConfig.stone_code,
      authority: "POLICY_GATED",
    };
  }
  return {
    ok: true,
    code: "CCS_TRANSITION_ALLOWED",
    verb,
    from,
    to: next,
    stone_code: ccsConfig.stone_code,
    authority: "POLICY_GATED",
  };
}

export function publicCcsStatus() {
  const card = ccsConfig.primary_card;
  return {
    ok: true,
    protocol: ccsConfig.schema_version,
    name: ccsConfig.display_name,
    stone_code: ccsConfig.stone_code,
    verbs: ccsConfig.verbs,
    public_language: ccsConfig.public_language,
    fail_closed: ccsConfig.policy.fail_closed,
    direct_execution_bypass: ccsConfig.policy.direct_execution_bypass,
    compatibility: {
      use_card_v1: ccsConfig.compatibility.use_card_v1,
      maop_wrapper: ccsConfig.compatibility.maop_wrapper,
    },
    primary_card: {
      card_id: card.card_id,
      display_name: card.display_name,
      protocol: card.protocol,
      canonical: card.canonical,
      aliases: card.aliases,
      alias_resolution: card.alias_resolution,
      components: card.components,
      cost_guard: card.cost_guard,
      safety: card.safety,
    },
  };
}
