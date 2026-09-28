import { Hono } from "hono";
import providerConfig from "../config/providers.json";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import {
  resolveCapability,
  type ResolverCandidate,
  type ResolverRequest,
} from "./capability-resolver";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type CapabilityResolverBindings = AuthBindings & {
  DB?: D1Like;
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

async function readCandidates(db: D1Like) {
  const rows = await db.prepare(
    `SELECT
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
     FROM provider_capabilities pc
     JOIN capabilities c ON c.id = pc.capability_id
     JOIN providers p ON p.id = pc.provider_id
     LEFT JOIN provider_bindings b ON b.provider_id = p.id
     ORDER BY pc.priority ASC, c.id ASC, p.id ASC, b.environment ASC, b.id ASC`,
  ).all<CandidateRow>();
  return (rows.results ?? []).map(candidateFromRow);
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
    const request: ResolverRequest = {
      intent: compact(body.intent, 1200),
      capability: compact(body.capability, 160),
      provider: compact(body.provider, 120),
      environment: compact(body.environment, 40) || "staging",
      allowMigration: body.allowMigration === true,
      allowOptional: body.allowOptional === true,
    };

    if (!request.intent && !request.capability && !request.provider) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "intent, capability or provider is required" }, 400);
    }

    const candidates = await readCandidates(c.env.DB);
    const result = resolveCapability(request, candidates);
    const status = result.ok
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
      policy: "NO_PROVIDER_SIDE_EFFECTS",
    }, status, { "Cache-Control": "no-store" });
  });

  return api;
}
