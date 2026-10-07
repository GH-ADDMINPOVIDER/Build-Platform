import { Hono } from "hono";
import providerConfig from "../config/providers.json";
import readinessAttestations from "../config/provider-readiness-attestations.json";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import {
  resolveCapability,
  type ResolverCandidate,
  type ResolverRequest,
} from "./capability-resolver";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
export type CapabilityResolverPrepared = {
  bind: (...values: unknown[]) => CapabilityResolverPrepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
export type CapabilityResolverD1 = { prepare: (query: string) => CapabilityResolverPrepared };

export type CapabilityResolverBindings = AuthBindings & {
  DB?: CapabilityResolverD1;
  GEMINI_API_KEY?: string;
};

type ResolverEnv = { Bindings: CapabilityResolverBindings };

type CandidateRow = {
  capability_id: string;
  capability_description: string | null;
  permission_class: "READ" | "WRITE" | "EXECUTE" | "DANGEROUS";
  capability_enabled: number;
  provider_id: string;
  provider_status: string;
  provider_auth_type: string | null;
  provider_capability_enabled: number;
  priority: number;
  binding_id: string | null;
  binding_type: string | null;
  binding_status: string | null;
  binding_environment: string | null;
};

const providerStatuses = new Map(
  providerConfig.providers.map((provider) => [provider.id, provider.status] as const),
);

const compact = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function candidateFromRow(row: CandidateRow): ResolverCandidate {
  return {
    capability_id: compact(row.capability_id, 160),
    capability_description: row.capability_description,
    permission_class: row.permission_class,
    capability_enabled: Number(row.capability_enabled) === 1,
    provider_id: compact(row.provider_id, 120),
    provider_status: providerStatuses.get(row.provider_id) ?? compact(row.provider_status, 40),
    provider_capability_enabled: Number(row.provider_capability_enabled) === 1,
    priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 100,
    binding_id: row.binding_id,
    binding_type: row.binding_type,
    binding_status: row.binding_status,
    binding_environment: row.binding_environment,
    runtime_capability: row.provider_auth_type === "runtime_capability",
  };
}

export function normalizeResolverRequest(body: ResolverRequest): ResolverRequest {
  return {
    intent: compact(body.intent, 1200),
    capability: compact(body.capability, 160),
    provider: compact(body.provider, 120),
    environment: compact(body.environment, 40) || "staging",
    allowMigration: body.allowMigration === true,
    allowOptional: body.allowOptional === true,
  };
}

function supplementalConfigCandidates(env: CapabilityResolverBindings): ResolverCandidate[] {
  const gemini = providerConfig.providers.find((provider) => provider.id === "gemini");
  const attestation = (readinessAttestations as {
    providers?: Record<string, { verification_state?: string; api?: string; quota?: string; billing?: string }>;
  }).providers?.gemini;
  const keyPresent = typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim().length > 0;
  const verified =
    attestation?.verification_state === "VERIFIED" &&
    attestation.api === "REACHABLE" &&
    attestation.quota === "AVAILABLE" &&
    attestation.billing === "ACTIVE";

  if (!gemini || gemini.status !== "active" || !keyPresent || !verified) return [];
  return [{
    capability_id: "context_load",
    capability_description: "Load bounded context through verified Gemini READ reasoning.",
    permission_class: "READ",
    capability_enabled: true,
    provider_id: "gemini",
    provider_status: "active",
    provider_capability_enabled: true,
    priority: 5,
    binding_id: "runtime:gemini",
    binding_type: "server_secret",
    binding_status: "verified",
    binding_environment: "staging",
    runtime_capability: false,
  }];
}

export async function readResolverCandidates(db: CapabilityResolverD1, env: CapabilityResolverBindings = {}) {
  const rows = await db.prepare(
    `WITH compatibility_map(provider_id, capability_id, priority) AS (
       VALUES
         ('github', 'code_search', 10),
         ('github', 'read_file', 11),
         ('google_drive', 'drive_scan', 10),
         ('linear', 'agent_delegate', 10),
         ('cloudflare', 'deploy_preview', 10),
         ('cloudflare', 'deploy_promote', 10),
         ('cloudflare', 'context_load', 20),
         ('cloudflare', 'runtime_verify', 10),
         ('infisical', 'identity_health', 10),
         ('documents', 'app_build', 10),
         ('template_creator', 'app_build', 10),
         ('n8n', 'workflow_run', 10)
     ),
     effective_map(provider_id, capability_id, priority, enabled) AS (
       SELECT provider_id, capability_id, priority, enabled
       FROM provider_capabilities
       UNION ALL
       SELECT provider_id, capability_id, priority, 1
       FROM compatibility_map
       WHERE NOT EXISTS (SELECT 1 FROM provider_capabilities)
     )
     SELECT
       c.id AS capability_id,
       c.description AS capability_description,
       c.permission_class AS permission_class,
       c.enabled AS capability_enabled,
       p.id AS provider_id,
       p.status AS provider_status,
       p.auth_type AS provider_auth_type,
       pc.enabled AS provider_capability_enabled,
       pc.priority AS priority,
       b.id AS binding_id,
       b.binding_type AS binding_type,
       b.status AS binding_status,
       b.environment AS binding_environment
     FROM effective_map pc
     JOIN capabilities c ON c.id = pc.capability_id
     JOIN providers p ON p.id = pc.provider_id
     LEFT JOIN provider_bindings b ON b.provider_id = p.id
     ORDER BY pc.priority ASC, c.id ASC, p.id ASC, b.environment ASC, b.id ASC`,
  ).all<CandidateRow>();
  const databaseCandidates = (rows.results ?? []).map(candidateFromRow);
  const supplemental = supplementalConfigCandidates(env);
  const seen = new Set(databaseCandidates.map((candidate) =>
    `${candidate.provider_id}:${candidate.capability_id}:${candidate.binding_environment ?? ""}`
  ));
  return [
    ...databaseCandidates,
    ...supplemental.filter((candidate) =>
      !seen.has(`${candidate.provider_id}:${candidate.capability_id}:${candidate.binding_environment ?? ""}`)
    ),
  ];
}

export function createCapabilityResolverApi() {
  const api = new Hono<ResolverEnv>();

  api.post("/api/capabilities/resolve", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    if (!c.env.DB) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    }

    const body = await c.req.json<ResolverRequest>().catch(() => ({} as ResolverRequest));
    const request = normalizeResolverRequest(body);

    if (!request.intent && !request.capability && !request.provider) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "intent, capability or provider is required" }, 400);
    }

    const candidates = await readResolverCandidates(c.env.DB, c.env);
    const result = resolveCapability(request, candidates);
    const status: 200 | 404 | 409 | 503 = result.ok
      ? 200
      : result.status === "AMBIGUOUS"
        ? 409
        : result.status === "CONFIGURATION_REQUIRED"
          ? 503
          : 404;

    return c.json({
      ...result,
      read_only: true,
      runtime: "YELLOW_STONE_CAPABILITY_RESOLVER_V1",
      mapping: "D1_PROVIDER_CAPABILITIES_OR_PHASE_VI_COMPATIBILITY_MAP",
      policy: "NO_PROVIDER_SIDE_EFFECTS",
    }, status, { "Cache-Control": "no-store" });
  });

  return api;
}
