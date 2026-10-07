import { Hono } from "hono";
import migrationCatalog from "../config/n8n-legacy-migration.json";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";

type N8nBindings = AuthBindings & {
  N8N_API_KEY?: string;
  N8N_BASE_URL?: string;
  N8N_SELFHOST_API_KEY?: string;
  N8N_SELFHOST_BASE_URL?: string;
};
type Env = { Bindings: N8nBindings };

type N8nWorkflow = {
  id?: string;
  name?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  versionId?: string;
  nodes?: Array<{
    type?: string;
    credentials?: Record<string, unknown>;
  }>;
  tags?: Array<{ id?: string; name?: string }>;
};

type N8nListResponse = {
  data?: N8nWorkflow[];
  nextCursor?: string | null;
};

const KNOWN_LEGACY_WORKFLOW_ID = "iJVOGWcwMj8x7u9S";
const noStore = { "Cache-Control": "no-store" };

function configured(env: N8nBindings) {
  const apiKey = String(env.N8N_API_KEY ?? "").trim();
  const rawBase = String(env.N8N_BASE_URL ?? "").trim();
  if (!apiKey || !rawBase) return { ok: false as const, code: "CONFIGURATION_REQUIRED" };
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    return { ok: false as const, code: "INVALID_N8N_BASE_URL" };
  }
  if (url.protocol !== "https:") return { ok: false as const, code: "N8N_HTTPS_REQUIRED" };
  return {
    ok: true as const,
    apiKey,
    base: url.origin,
    host: url.hostname,
  };
}


function configuredSelfHost(env: N8nBindings) {
  const rawBase = String(env.N8N_SELFHOST_BASE_URL ?? "").trim();
  const apiKey = String(env.N8N_SELFHOST_API_KEY ?? "").trim();
  if (!rawBase) return { ok: false as const, code: "SELFHOST_CONFIGURATION_REQUIRED", apiKeyBound: Boolean(apiKey) };
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    return { ok: false as const, code: "INVALID_N8N_SELFHOST_BASE_URL", apiKeyBound: Boolean(apiKey) };
  }
  if (url.protocol !== "https:") {
    return { ok: false as const, code: "N8N_SELFHOST_HTTPS_REQUIRED", apiKeyBound: Boolean(apiKey) };
  }
  return {
    ok: true as const,
    base: url.origin,
    host: url.hostname,
    apiKey,
    apiKeyBound: Boolean(apiKey),
  };
}

async function selfHostHealth(env: N8nBindings) {
  const cfg = configuredSelfHost(env);
  if (!cfg.ok) return { ...cfg, reachable: false as const };
  try {
    const response = await fetch(`${cfg.base}/healthz`, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "ogenic-maop-n8n-selfhost-readiness" },
    });
    return {
      ok: response.ok,
      reachable: response.ok,
      code: response.ok ? "READY" : `N8N_SELFHOST_HTTP_${response.status}`,
      host: cfg.host,
      apiKeyBound: cfg.apiKeyBound,
      http_status: response.status,
    };
  } catch {
    return {
      ok: false as const,
      reachable: false as const,
      code: "N8N_SELFHOST_UNREACHABLE",
      host: cfg.host,
      apiKeyBound: cfg.apiKeyBound,
    };
  }
}

async function n8nSelfHostGet(env: N8nBindings, path: string) {
  const cfg = configuredSelfHost(env);
  if (!cfg.ok) return { ok: false as const, status: 503, code: cfg.code };
  if (!cfg.apiKey) return { ok: false as const, status: 503, code: "N8N_SELFHOST_API_KEY_REQUIRED" };
  const response = await fetch(`${cfg.base}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-N8N-API-KEY": cfg.apiKey,
      "User-Agent": "ogenic-maop-n8n-selfhost-readonly",
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status === 401 || response.status === 403 ? 401 : 502,
      code: response.status === 401 || response.status === 403 ? "N8N_SELFHOST_REAUTH_REQUIRED" : `N8N_SELFHOST_HTTP_${response.status}`,
    };
  }
  return { ok: true as const, status: 200, body, host: cfg.host };
}

async function n8nGet(env: N8nBindings, path: string) {
  const cfg = configured(env);
  if (!cfg.ok) return { ok: false as const, status: 503, code: cfg.code };
  const response = await fetch(`${cfg.base}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-N8N-API-KEY": cfg.apiKey,
      "User-Agent": "ogenic-maop-n8n-migration-readonly",
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status === 401 || response.status === 403 ? 401 : 502,
      code: response.status === 401 || response.status === 403 ? "N8N_REAUTH_REQUIRED" : `N8N_HTTP_${response.status}`,
    };
  }
  return { ok: true as const, status: 200, body, host: cfg.host };
}

function summarizeWorkflow(workflow: N8nWorkflow) {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const nodeTypes = [...new Set(nodes.map((node) => String(node.type ?? "").trim()).filter(Boolean))].sort();
  const credentialRefCount = nodes.reduce((count, node) => {
    const refs = node.credentials && typeof node.credentials === "object" ? Object.keys(node.credentials).length : 0;
    return count + refs;
  }, 0);
  const webhookCount = nodeTypes.filter((type) => /webhook/i.test(type)).length;
  return {
    id: String(workflow.id ?? ""),
    name: String(workflow.name ?? ""),
    active: workflow.active === true,
    created_at: workflow.createdAt ?? null,
    updated_at: workflow.updatedAt ?? null,
    version_id: workflow.versionId ?? null,
    node_count: nodes.length,
    node_types: nodeTypes.slice(0, 80),
    credential_ref_count: credentialRefCount,
    webhook_type_count: webhookCount,
    tags: Array.isArray(workflow.tags) ? workflow.tags.map((tag) => String(tag.name ?? "")).filter(Boolean).slice(0, 20) : [],
  };
}

export function createN8nMigrationApi() {
  const api = new Hono<Env>();

  api.use("/api/n8n/migration/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
    }
    await next();
  });

  api.get("/api/n8n/migration/catalog", (c) => {
    return c.json({
      ok: true,
      runtime: "N8N_LEGACY_MIGRATION_CATALOG_V1",
      catalog: migrationCatalog,
      secrets_included: false,
      raw_workflow_parameters_included: false,
    }, 200, noStore);
  });

  api.get("/api/n8n/migration/selfhost/status", async (c) => {
    const health = await selfHostHealth(c.env);
    return c.json({
      ok: health.ok,
      runtime: "N8N_SELFHOST_READINESS_V1",
      destination: {
        configured: health.code !== "SELFHOST_CONFIGURATION_REQUIRED",
        reachable: health.reachable,
        host: "host" in health ? health.host : null,
        api_key_bound: health.apiKeyBound,
      },
      control: {
        execution_authority: "YELLOW_STONE_ONLY",
        workflow_import_allowed: false,
        workflow_execution_allowed: false,
        reason: health.ok ? "SELFHOST_READY_FOR_ADMISSION_NOT_EXECUTION" : health.code,
      },
    }, health.ok ? 200 : 503, noStore);
  });

  api.get("/api/n8n/migration/selfhost/workflows", async (c) => {
    const result = await n8nSelfHostGet(c.env, "/api/v1/workflows?limit=100");
    if (!result.ok) return c.json({ ok: false, code: result.code }, result.status as 401 | 502 | 503, noStore);
    const list = result.body as N8nListResponse;
    const workflows = Array.isArray(list.data) ? list.data : [];
    return c.json({
      ok: true,
      runtime: "N8N_SELFHOST_INVENTORY_V1",
      source: {
        host: result.host,
        api_key_bound: true,
        direct_database_access: false,
      },
      inventory: {
        workflow_count_first_page: workflows.length,
        next_cursor_present: Boolean(list.nextCursor),
        workflows: workflows.map(summarizeWorkflow),
      },
      control: {
        execution_authority: "YELLOW_STONE_ONLY",
        workflow_mutation_allowed: false,
        workflow_execution_allowed: false,
      },
      redaction: {
        node_parameters_returned: false,
        credential_ids_returned: false,
        credential_names_returned: false,
        credential_secrets_returned: false,
      },
    }, 200, noStore);
  });

  api.get("/api/n8n/migration/status", async (c) => {
    const result = await n8nGet(c.env, "/api/v1/workflows?limit=100");
    if (!result.ok) return c.json({ ok: false, code: result.code }, result.status as 401 | 502 | 503, noStore);
    const list = result.body as N8nListResponse;
    const workflows = Array.isArray(list.data) ? list.data : [];
    const known = workflows.find((workflow) => String(workflow.id ?? "") === KNOWN_LEGACY_WORKFLOW_ID);
    return c.json({
      ok: true,
      runtime: "N8N_LEGACY_SOURCE_BRIDGE_V1",
      source: {
        mode: "N8N_CLOUD_PUBLIC_API_READ_ONLY",
        host: result.host,
        direct_database_access: false,
        api_key_bound: true,
      },
      inventory: {
        workflow_count_first_page: workflows.length,
        next_cursor_present: Boolean(list.nextCursor),
        known_legacy_workflow_id: KNOWN_LEGACY_WORKFLOW_ID,
        known_legacy_workflow_found: Boolean(known),
        known_legacy_workflow: known ? summarizeWorkflow(known) : null,
      },
      migration_policy: {
        preserve_before_rebuild: true,
        workflow_execution_allowed: false,
        workflow_mutation_allowed: false,
        credential_secret_export_allowed: false,
        destination_required_for_import: true,
      },
    }, 200, noStore);
  });

  api.get("/api/n8n/migration/workflow/:id", async (c) => {
    const id = String(c.req.param("id") ?? "").trim().slice(0, 120);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return c.json({ ok: false, code: "INVALID_WORKFLOW_ID" }, 400, noStore);
    }
    const result = await n8nGet(c.env, `/api/v1/workflows/${encodeURIComponent(id)}`);
    if (!result.ok) return c.json({ ok: false, code: result.code }, result.status as 401 | 502 | 503, noStore);
    const workflow = result.body as N8nWorkflow;
    return c.json({
      ok: true,
      runtime: "N8N_LEGACY_SOURCE_BRIDGE_V1",
      source_host: result.host,
      workflow: summarizeWorkflow(workflow),
      redaction: {
        node_parameters_returned: false,
        credential_ids_returned: false,
        credential_names_returned: false,
        credential_secrets_returned: false,
      },
      read_only: true,
    }, 200, noStore);
  });

  return api;
}
