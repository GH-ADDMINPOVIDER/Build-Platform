import {
  MAOP_LIFECYCLE,
  MAOP_PROTOCOL_VERSION,
  type AdapterContext,
  type AdapterResult,
  type LifecycleStage,
  type MaopActor,
  type MaopAdapter,
  type MaopCapability,
  type MaopCredentialRef,
  type MaopEvidence,
  type MaopResult,
  type MaopRuntimeBindings,
  type MaopTask,
} from "./contracts.js";

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|private[_-]?key)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._~+/=-]{12,})/i;

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function safeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeObject);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE.test(value)) return "[REDACTED_SECRET_LIKE]";
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : safeObject(current);
  }
  return out;
}

function containsSecretLike(value: unknown) {
  const text = JSON.stringify(value ?? {});
  return SECRET_VALUE.test(text) || Object.keys((value && typeof value === "object" && !Array.isArray(value)) ? value as Record<string, unknown> : {}).some((key) => SECRET_KEY.test(key));
}

function evidence(task: MaopTask, capability: MaopCapability, actor: MaopActor, refs: string[], state: MaopEvidence["verification_state"]): MaopEvidence[] {
  return refs.filter(Boolean).map((sourceRef, index) => ({
    evidence_id: `${task.task_id}:evidence:${index + 1}`,
    provider_id: capability.provider_id,
    capability_id: capability.capability_id,
    actor_id: actor.actor_id,
    source_ref: clean(sourceRef, 500),
    created_at: "2026-10-06T00:00:00.000Z",
    verification_state: state,
  }));
}

function baseResult(
  task: MaopTask,
  actor: MaopActor,
  capability: MaopCapability,
  adapter: MaopAdapter,
  lifecycle: LifecycleStage[],
  replayed = false,
): Omit<MaopResult, "ok" | "evidence" | "ruby_verified" | "retention_eligible"> {
  return {
    task_id: task.task_id,
    capability_id: capability.capability_id,
    provider_id: capability.provider_id,
    actor_id: actor.actor_id,
    permission_class: capability.permission_class,
    versions: {
      protocol_version: MAOP_PROTOCOL_VERSION,
      capability_version: capability.capability_version,
      adapter_version: adapter.version,
    },
    lifecycle,
    replayed,
  };
}

export class MaopReferenceRuntime {
  private readonly actors = new Map<string, MaopActor>();
  private readonly capabilities = new Map<string, MaopCapability>();
  private readonly adapters = new Map<string, MaopAdapter<Record<string, unknown>, unknown>>();
  private readonly replay = new Map<string, MaopResult>();

  constructor(private readonly bindings: MaopRuntimeBindings) {
    if (!bindings || typeof bindings.yellow_authorize !== "function") throw new Error("YELLOW_BINDING_REQUIRED");
    if (typeof bindings.ruby_verify !== "function") throw new Error("RUBY_BINDING_REQUIRED");
  }

  registerActor(actor: MaopActor) {
    if (!clean(actor.actor_id, 160)) throw new Error("ACTOR_ID_REQUIRED");
    this.actors.set(actor.actor_id, { ...actor, capabilities: [...actor.capabilities] });
  }

  registerCapability(capability: MaopCapability) {
    if (!clean(capability.capability_id, 180)) throw new Error("CAPABILITY_ID_REQUIRED");
    this.capabilities.set(capability.capability_id, { ...capability });
  }

  registerAdapter(adapter: MaopAdapter<Record<string, unknown>, unknown>) {
    if (!clean(adapter.id, 180)) throw new Error("ADAPTER_ID_REQUIRED");
    this.adapters.set(adapter.id, adapter);
  }

  async run(task: MaopTask, credentialRef?: MaopCredentialRef, signal?: AbortSignal): Promise<MaopResult> {
    const existing = this.replay.get(task.idempotency_key);
    if (existing) return { ...existing, replayed: true };

    const stages: LifecycleStage[] = ["DISCOVER"];
    const actor = this.actors.get(task.actor_id);
    const capability = this.capabilities.get(task.capability_id);

    const missingActor = !actor;
    const missingCapability = !capability;
    if (missingActor || missingCapability) {
      const fallbackActor: MaopActor = actor ?? {
        actor_id: task.actor_id || "unknown",
        actor_class: "agent",
        role: "unknown",
        provider: "unknown",
        runtime: "unknown",
        capabilities: [],
        readiness: "NOT_MEASURED",
      };
      const fallbackCapability: MaopCapability = capability ?? {
        capability_id: task.capability_id || "unknown",
        provider_id: "unknown",
        adapter_id: "unknown",
        permission_class: task.requested_permission,
        environment: task.environment,
        input_schema: {},
        output_schema: {},
        evidence_required: true,
        capability_version: "0",
      };
      const fallbackAdapter = {
        id: "missing",
        version: "0",
        interface_family: "sdk" as const,
        readiness: async () => ({ state: "OFFLINE" as const, checked_at: "" }),
        execute: async () => ({ ok: false, evidence_refs: [] }),
      };
      return {
        ...baseResult(task, fallbackActor, fallbackCapability, fallbackAdapter, stages),
        ok: false,
        safe_error: { code: missingActor ? "ACTOR_NOT_FOUND" : "CAPABILITY_NOT_FOUND" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    stages.push("ADMIT");
    if (!actor.capabilities.includes(capability.capability_id)) {
      return {
        ...baseResult(task, actor, capability, { id: "unselected", version: "0", interface_family: "sdk", readiness: async () => ({ state: "OFFLINE", checked_at: "" }), execute: async () => ({ ok: false, evidence_refs: [] }) }, stages),
        ok: false,
        safe_error: { code: "ACTOR_CAPABILITY_DENIED" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }
    if (task.environment !== capability.environment || task.requested_permission !== capability.permission_class) {
      return {
        ...baseResult(task, actor, capability, { id: capability.adapter_id, version: "0", interface_family: "sdk", readiness: async () => ({ state: "OFFLINE", checked_at: "" }), execute: async () => ({ ok: false, evidence_refs: [] }) }, stages),
        ok: false,
        safe_error: { code: "TASK_SCOPE_MISMATCH" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }
    if (!task.idempotency_key || containsSecretLike(task.input) || (credentialRef && containsSecretLike(credentialRef))) {
      return {
        ...baseResult(task, actor, capability, { id: capability.adapter_id, version: "0", interface_family: "sdk", readiness: async () => ({ state: "OFFLINE", checked_at: "" }), execute: async () => ({ ok: false, evidence_refs: [] }) }, stages),
        ok: false,
        safe_error: { code: !task.idempotency_key ? "IDEMPOTENCY_KEY_REQUIRED" : "SECRET_LIKE_INPUT_REJECTED" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    const adapter = this.adapters.get(capability.adapter_id);
    if (!adapter) {
      return {
        ...baseResult(task, actor, capability, { id: capability.adapter_id, version: "0", interface_family: "sdk", readiness: async () => ({ state: "OFFLINE", checked_at: "" }), execute: async () => ({ ok: false, evidence_refs: [] }) }, stages),
        ok: false,
        safe_error: { code: "ADAPTER_NOT_FOUND" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    const context: AdapterContext = { actor, capability, credential_ref: credentialRef, signal };
    stages.push("CHECK_READINESS");
    const readiness = await adapter.readiness(context);
    if (readiness.state !== "VERIFIED") {
      return {
        ...baseResult(task, actor, capability, adapter, stages),
        ok: false,
        safe_error: { code: `READINESS_${readiness.state}` },
        evidence: evidence(task, capability, actor, readiness.evidence_ref ? [readiness.evidence_ref] : [], "blocked"),
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    stages.push("CHECK_COST");
    const cost = this.bindings.check_cost ? await this.bindings.check_cost({ task, capability }) : { allowed: true, code: "ZERO_COST_FIXTURE" };
    if (!cost.allowed) {
      return {
        ...baseResult(task, actor, capability, adapter, stages),
        ok: false,
        safe_error: { code: cost.code || "COST_BLOCKED" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    stages.push("CHECK_POLICY");
    const yellow = await this.bindings.yellow_authorize({ task, actor, capability, readiness });
    if (!yellow.allowed) {
      return {
        ...baseResult(task, actor, capability, adapter, stages),
        ok: false,
        safe_error: { code: yellow.code || "YELLOW_BLOCKED" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    stages.push("SELECT_ROUTE");
    stages.push("APPROVE_IF_REQUIRED");
    if (yellow.approval_required && !task.approval_ref) {
      return {
        ...baseResult(task, actor, capability, adapter, stages),
        ok: false,
        safe_error: { code: "HUMAN_APPROVAL_REQUIRED" },
        evidence: [],
        ruby_verified: false,
        retention_eligible: false,
      };
    }

    stages.push("OPERATE");
    let adapterResult: AdapterResult;
    try {
      adapterResult = await adapter.execute(task.input, context);
    } catch (error) {
      adapterResult = {
        ok: false,
        safe_error: { code: "ADAPTER_FAILED", message: clean(error instanceof Error ? error.message : error, 240) },
        evidence_refs: [],
      };
    }

    stages.push("VERIFY");
    const ruby = adapterResult.ok
      ? await this.bindings.ruby_verify({ task, actor, capability, adapter_result: adapterResult })
      : { verified: false };
    const normalizedEvidence = evidence(
      task,
      capability,
      actor,
      [...adapterResult.evidence_refs, ...(ruby.evidence_ref ? [ruby.evidence_ref] : [])],
      ruby.verified ? "verified" : adapterResult.ok ? "unverified" : "failed",
    );

    stages.push("RETAIN");
    const result: MaopResult = {
      ...baseResult(task, actor, capability, adapter, stages),
      ok: adapterResult.ok,
      ...(adapterResult.ok ? { output: safeObject(adapterResult.output) } : {
        safe_error: adapterResult.safe_error ?? { code: "ADAPTER_FAILED" },
      }),
      evidence: normalizedEvidence,
      ruby_verified: ruby.verified === true,
      retention_eligible: adapterResult.ok && ruby.verified === true && normalizedEvidence.length > 0,
    };

    if (result.ok || result.safe_error?.code === "HUMAN_APPROVAL_REQUIRED") {
      this.replay.set(task.idempotency_key, result);
    }
    return result;
  }

  lifecycle() {
    return [...MAOP_LIFECYCLE];
  }
}
