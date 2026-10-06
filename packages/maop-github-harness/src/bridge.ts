import type {
  BridgeBindings,
  GithubReadCapability,
  MaopGithubResult,
  MaopYellowRequest,
  ToolRuntime,
  VerificationState,
  YellowResponse,
} from "./contracts.js";
import { safeObject, validateInput } from "./tools.js";

const verificationState = (yellow: YellowResponse): VerificationState => {
  const state = yellow.verification?.status;
  if (state === "verified" || state === "partially_verified" || state === "unverified" || state === "blocked" || state === "failed") return state;
  if (yellow.ok === false) return "blocked";
  return "unverified";
};

const evidenceRefs = (yellow: YellowResponse, rubyRef?: string) => {
  const refs: string[] = [];
  if (typeof yellow.run_id === "string" && yellow.run_id) refs.push(`yellow:${yellow.run_id}`);
  if (rubyRef) refs.push(rubyRef);
  return refs;
};

const message = (error: unknown) => error instanceof Error ? error.message : String(error ?? "UNKNOWN_ERROR");

export class MaopGithubBridge {
  constructor(private readonly bindings: BridgeBindings) {
    if (!bindings || typeof bindings.executeYellow !== "function") throw new Error("YELLOW_BINDING_REQUIRED");
  }

  async execute(capability: GithubReadCapability, rawInput: unknown, runtime: ToolRuntime = {}): Promise<MaopGithubResult> {
    const actorId = String(runtime.agentId || this.bindings.defaultActorId || "harness-agent").trim().slice(0, 160) || "harness-agent";
    if (runtime.signal?.aborted) {
      return {
        ok: false,
        provider: "github",
        capability,
        actor_id: actorId,
        permission_class: "READ",
        verification_state: "blocked",
        ruby_verified: false,
        evidence_refs: [],
        retention_eligible: false,
        safe_error: { code: "CANCELED" },
      };
    }

    let input: Record<string, unknown>;
    try {
      input = validateInput(capability, rawInput);
    } catch (error) {
      return {
        ok: false,
        provider: "github",
        capability,
        actor_id: actorId,
        permission_class: "READ",
        verification_state: "blocked",
        ruby_verified: false,
        evidence_refs: [],
        retention_eligible: false,
        safe_error: { code: "INVALID_INPUT", message: message(error).slice(0, 240) },
      };
    }

    const request: MaopYellowRequest = {
      actor_id: actorId,
      capability,
      provider: "github",
      environment: "staging",
      permission_class: "READ",
      input,
      signal: runtime.signal,
    };

    let yellow: YellowResponse;
    try {
      yellow = await this.bindings.executeYellow(request);
    } catch (error) {
      return {
        ok: false,
        provider: "github",
        capability,
        actor_id: actorId,
        permission_class: "READ",
        verification_state: "blocked",
        ruby_verified: false,
        evidence_refs: [],
        retention_eligible: false,
        safe_error: { code: "YELLOW_UNAVAILABLE", message: message(error).slice(0, 240) },
      };
    }

    const state = verificationState(yellow);
    let rubyVerified = false;
    let rubyRef: string | undefined;
    if (yellow.ok === true && state === "verified" && this.bindings.verifyRuby) {
      try {
        const ruby = await this.bindings.verifyRuby({ actor_id: actorId, capability, yellow });
        rubyVerified = ruby.verified === true;
        rubyRef = ruby.evidence_ref;
      } catch {
        rubyVerified = false;
      }
    }

    const ok = yellow.ok === true;
    const output = safeObject(yellow.output ?? yellow.result ?? yellow);
    return {
      ok,
      provider: "github",
      capability,
      actor_id: actorId,
      permission_class: "READ",
      verification_state: state,
      ruby_verified: rubyVerified,
      evidence_refs: evidenceRefs(yellow, rubyRef),
      retention_eligible: ok && state === "verified" && rubyVerified,
      ...(ok ? { output } : {
        safe_error: {
          code: String(yellow.code || "YELLOW_BLOCKED").slice(0, 120),
        },
      }),
    };
  }
}
