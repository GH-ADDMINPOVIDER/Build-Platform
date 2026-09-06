import { Hono } from "hono";
import providers from "../config/providers.json";
import capabilities from "../config/capabilities.json";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

type Bindings = {
  DB?: D1Like;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  OGENIC_PHASE: string;
  OGENIC_RUNTIME: string;
};

type RouteRequest = { intent?: string };
type RoutePlan = {
  provider: string;
  capability: string;
  mode: "EXECUTE_IF_BOUND" | "RUNTIME_CAPABILITY" | "APPROVAL_REQUIRED";
};

const app = new Hono<{ Bindings: Bindings }>();

const dbRequired = (db?: D1Like) =>
  db ? null : { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" };

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    phase: c.env.OGENIC_PHASE ?? "VI",
    runtime: c.env.OGENIC_RUNTIME ?? "cloudflare",
    database: c.env.DB ? "BOUND" : "UNBOUND",
    toolkit: "OGENIC CORE",
    toolkit_count: 1,
    providers: providers.providers.length,
  }),
);

app.get("/api/capabilities", (c) => c.json(capabilities));

app.get("/api/providers", async (c) => {
  const safeConfig = providers.providers.map(({ secret_ref: _secretRef, ...safe }) => safe);
  if (!c.env.DB) return c.json({ providers: safeConfig, state: "CONFIG_FALLBACK" });

  const bindings = await c.env.DB
    .prepare(
      "SELECT id, provider_id, environment, binding_type, status, last_checked_at, metadata_json, updated_at FROM provider_bindings ORDER BY provider_id, environment",
    )
    .all();

  return c.json({ providers: safeConfig, bindings: bindings.results ?? [], state: "D1" });
});

app.get("/api/state", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const meta = await c.env.DB!.prepare("SELECT key, value FROM system_meta ORDER BY key").all();
  return c.json({ ok: true, meta: meta.results ?? [] });
});

app.get("/api/system", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const db = c.env.DB!;

  const [toolkit, planes, commands, policies, sources] = await Promise.all([
    db.prepare(
      "SELECT id, name, phase, status, entrypoint, control_plane, runtime_provider, database_provider, secret_provider, version, metadata_json, updated_at FROM toolkits WHERE id = 'ogenic-core'",
    ).first(),
    db.prepare("SELECT id, ordinal, name, description, status, source_id, updated_at FROM system_planes ORDER BY ordinal").all(),
    db.prepare("SELECT alias, capability_id, description, enabled, source_id, updated_at FROM command_aliases WHERE enabled = 1 ORDER BY alias").all(),
    db.prepare("SELECT id, scope, rule_text, enforcement, enabled, source_id, updated_at FROM policy_rules WHERE enabled = 1 ORDER BY scope, id").all(),
    db.prepare("SELECT id, provider_id, external_id, title, canonical_url, source_kind, status, precedence, migration_status, source_last_edited_at, content_hash, metadata_json, updated_at FROM canonical_sources ORDER BY precedence, id").all(),
  ]);

  return c.json({
    ok: true,
    phase: c.env.OGENIC_PHASE ?? "VI",
    runtime: c.env.OGENIC_RUNTIME ?? "cloudflare",
    toolkit,
    planes: planes.results ?? [],
    commands: commands.results ?? [],
    policies: policies.results ?? [],
    sources: sources.results ?? [],
  });
});

app.get("/api/knowledge", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const docs = await c.env.DB!
    .prepare(
      "SELECT id, project_id, source_id, title, format, canonical, content_hash, source_last_edited_at, migrated_at, metadata_json, updated_at FROM knowledge_documents ORDER BY canonical DESC, updated_at DESC",
    )
    .all();
  return c.json({ ok: true, documents: docs.results ?? [] });
});

app.get("/api/knowledge/:id", async (c) => {
  const missing = dbRequired(c.env.DB);
  if (missing) return c.json(missing, 503);
  const id = c.req.param("id");
  const doc = await c.env.DB!
    .prepare(
      "SELECT id, project_id, source_id, title, body, format, canonical, content_hash, source_last_edited_at, migrated_at, metadata_json, updated_at FROM knowledge_documents WHERE id = ?",
    )
    .bind(id)
    .first();
  if (!doc) return c.json({ ok: false, code: "NOT_FOUND", id }, 404);
  return c.json({ ok: true, document: doc });
});

function resolveRoute(intent: string): RoutePlan {
  const lowered = intent.toLowerCase();

  if (lowered.includes("production") || lowered.includes("promote")) {
    return { provider: "cloudflare", capability: "deploy_promote", mode: "APPROVAL_REQUIRED" };
  }
  if (lowered.includes("repo") || lowered.includes("github") || lowered.includes("code")) {
    return { provider: "github", capability: "code_search", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("drive") || lowered.includes("file") || lowered.includes("asset")) {
    return { provider: "google_drive", capability: "drive_scan", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("task") || lowered.includes("linear") || lowered.includes("issue")) {
    return { provider: "linear", capability: "agent_delegate", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("deploy") || lowered.includes("cloudflare") || lowered.includes("worker")) {
    return { provider: "cloudflare", capability: "deploy_preview", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("secret") || lowered.includes("identity") || lowered.includes("infisical")) {
    return { provider: "infisical", capability: "identity_health", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("notion") || lowered.includes("knowledge") || lowered.includes("context")) {
    return { provider: "cloudflare", capability: "context_load", mode: "EXECUTE_IF_BOUND" };
  }
  if (lowered.includes("document") || lowered.includes("word") || lowered.includes("pdf")) {
    return { provider: "documents", capability: "app_build", mode: "RUNTIME_CAPABILITY" };
  }
  if (lowered.includes("template")) {
    return { provider: "template_creator", capability: "app_build", mode: "RUNTIME_CAPABILITY" };
  }
  if (lowered.includes("n8n") || lowered.includes("workflow")) {
    return { provider: "n8n", capability: "workflow_run", mode: "EXECUTE_IF_BOUND" };
  }

  return { provider: "control", capability: "intent_route", mode: "RUNTIME_CAPABILITY" };
}

app.post("/api/route", async (c) => {
  const body: RouteRequest = await c.req.json<RouteRequest>().catch(() => ({} as RouteRequest));
  const intent = String(body.intent ?? "").trim();
  if (!intent) return c.json({ ok: false, code: "INVALID_REQUEST", message: "intent is required" }, 400);

  const route = resolveRoute(intent);
  let binding: Record<string, unknown> | null = null;

  if (c.env.DB && route.mode === "EXECUTE_IF_BOUND") {
    binding = await c.env.DB
      .prepare(
        "SELECT provider_id, environment, binding_type, status, last_checked_at, metadata_json FROM provider_bindings WHERE provider_id = ? ORDER BY CASE environment WHEN 'prod' THEN 0 WHEN 'migration' THEN 1 ELSE 2 END LIMIT 1",
      )
      .bind(route.provider)
      .first();
  }

  const executable = route.mode === "RUNTIME_CAPABILITY"
    ? true
    : route.mode === "APPROVAL_REQUIRED"
      ? false
      : Boolean(binding && ["verified", "configured", "active"].includes(String(binding.status ?? "")));

  return c.json({
    ok: true,
    intent,
    route,
    binding,
    executable,
    next: route.mode === "APPROVAL_REQUIRED"
      ? "EXPLICIT_APPROVAL_REQUIRED"
      : executable
        ? "READY"
        : "CAPABILITY_REQUIRED",
  });
});

app.all("/api/*", (c) => c.json({ ok: false, code: "NOT_FOUND" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
