export type PermissionClass = "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";

export type ReadinessState =
  | "VERIFIED"
  | "DEGRADED"
  | "CONFIGURATION_REQUIRED"
  | "OFFLINE"
  | "NOT_MEASURED";

export type VerificationState =
  | "verified"
  | "partially_verified"
  | "unverified"
  | "blocked"
  | "failed";

export type InterfaceFamily =
  | "mcp"
  | "sdk"
  | "rest"
  | "graphql"
  | "webhook"
  | "oauth"
  | "cli"
  | "agent_api";

export type LifecycleStage =
  | "DISCOVER"
  | "ADMIT"
  | "CHECK_READINESS"
  | "CHECK_COST"
  | "CHECK_POLICY"
  | "SELECT_ROUTE"
  | "APPROVE_IF_REQUIRED"
  | "OPERATE"
  | "VERIFY"
  | "RETAIN";

export const MAOP_PROTOCOL_VERSION = "0.1.0";
export const MAOP_LIFECYCLE: readonly LifecycleStage[] = [
  "DISCOVER",
  "ADMIT",
  "CHECK_READINESS",
  "CHECK_COST",
  "CHECK_POLICY",
  "SELECT_ROUTE",
  "APPROVE_IF_REQUIRED",
  "OPERATE",
  "VERIFY",
  "RETAIN",
] as const;

export interface MaopVersionEnvelope {
  protocol_version: string;
  capability_version: string;
  adapter_version: string;
}

export interface MaopActor {
  actor_id: string;
  actor_class: "controller" | "agent" | "worker" | "human" | "service";
  role: string;
  provider: string;
  runtime: string;
  capabilities: string[];
  readiness: ReadinessState;
}

export interface MaopCapability {
  capability_id: string;
  provider_id: string;
  adapter_id: string;
  permission_class: PermissionClass;
  environment: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  evidence_required: boolean;
  capability_version: string;
}

export interface MaopCredentialRef {
  credential_ref: string;
  provider_id: string;
  scopes: string[];
  environment: string;
  expires_at?: string;
  rotation_state?: "CURRENT" | "ROTATE_SOON" | "EXPIRED" | "NOT_MEASURED";
}

export interface MaopTask {
  task_id: string;
  actor_id: string;
  capability_id: string;
  intent: string;
  input: Record<string, unknown>;
  environment: string;
  idempotency_key: string;
  requested_permission: PermissionClass;
  supported_protocol_versions: string[];
  approval_ref?: string;
}

export interface MaopEvidence {
  evidence_id: string;
  provider_id: string;
  capability_id: string;
  actor_id: string;
  source_ref: string;
  created_at: string;
  digest?: string;
  verification_state: VerificationState;
}

export interface MaopSafeError {
  code: string;
  message?: string;
}

export interface MaopResult<T = unknown> {
  ok: boolean;
  task_id: string;
  capability_id: string;
  provider_id: string;
  actor_id: string;
  permission_class: PermissionClass;
  versions: MaopVersionEnvelope;
  lifecycle: LifecycleStage[];
  output?: T;
  safe_error?: MaopSafeError;
  evidence: MaopEvidence[];
  ruby_verified: boolean;
  retention_eligible: boolean;
  replayed: boolean;
}

export interface AdapterContext {
  actor: MaopActor;
  capability: MaopCapability;
  credential_ref?: MaopCredentialRef;
  signal?: AbortSignal;
}

export interface AdapterReadiness {
  state: ReadinessState;
  checked_at: string;
  evidence_ref?: string;
}

export interface AdapterResult<T = unknown> {
  ok: boolean;
  output?: T;
  safe_error?: MaopSafeError;
  evidence_refs: string[];
}

export interface MaopAdapter<I = Record<string, unknown>, O = unknown> {
  id: string;
  version: string;
  interface_family: InterfaceFamily;
  discover?(): Promise<MaopCapability[]>;
  readiness(context: AdapterContext): Promise<AdapterReadiness>;
  execute(input: I, context: AdapterContext): Promise<AdapterResult<O>>;
}

export interface YellowDecision {
  allowed: boolean;
  approval_required: boolean;
  code: string;
}

export interface RubyDecision {
  verified: boolean;
  evidence_ref?: string;
  detail?: string;
}

export interface MaopRuntimeBindings {
  yellow_authorize(input: {
    task: MaopTask;
    actor: MaopActor;
    capability: MaopCapability;
    readiness: AdapterReadiness;
  }): Promise<YellowDecision>;
  ruby_verify(input: {
    task: MaopTask;
    actor: MaopActor;
    capability: MaopCapability;
    adapter_result: AdapterResult;
  }): Promise<RubyDecision>;
  check_cost?(input: {
    task: MaopTask;
    capability: MaopCapability;
  }): Promise<{ allowed: boolean; code: string }>;
}
