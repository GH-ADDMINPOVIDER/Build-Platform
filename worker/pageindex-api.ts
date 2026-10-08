import { Hono } from "hono";
import pageIndexAdapter from "../config/pageindex-adapter.json";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";

type Env = { Bindings: AuthBindings };

/**
 * Register the official PageIndex Python-side capability with Yellow.
 * No Python interpreter exists in Cloudflare Workers: this route is
 * an honest discovery/health surface, not an active indexing service.
 */
export function createPageIndexApi() {
  const api = new Hono<Env>();
  api.get("/api/pageindex/status", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    return c.json({
      ok: true,
      runtime: pageIndexAdapter.schema_version,
      provider: pageIndexAdapter.name,
      source: pageIndexAdapter.upstream_repository,
      sdk: pageIndexAdapter.python_package,
      version: pageIndexAdapter.pinned_version,
      license: pageIndexAdapter.upstream_license,
      registered: true,
      execution_host: pageIndexAdapter.host,
      cloudflare_worker_executes_python: false,
      indexing_enabled: false,
      llm_calls_enabled: false,
      automatic_paid_provider_calls: false,
      next_action: "USE_OPTIONAL_PYTHON_RUNNER_FOR_LOCAL_PDF_OUTLINE",
      features: pageIndexAdapter.capabilities,
    }, 200, { "Cache-Control": "no-store" });
  });
  return api;
}
