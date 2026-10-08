import { Hono } from "hono";
import browserAdapter from "../config/moli-browser-adapter.json";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";

type Env = { Bindings: AuthBindings };

/**
 * Owner/ops authenticated Yellow capability discovery ONLY.
 * Cloudflare Workers cannot execute native Moli binaries.
 * No direct browser navigation or tool execution in this route.
 */
export function createMoliBrowserApi() {
  const api = new Hono<Env>();
  api.get("/api/moli/status", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    return c.json({
      ok: true,
      schema: browserAdapter.schema_version,
      browser: browserAdapter.name,
      provider: browserAdapter.provider,
      release: browserAdapter.pinned_version,
      license: browserAdapter.license,
      registered: browserAdapter.registered,
      yellow_capability: browserAdapter.lane,
      execution_host: browserAdapter.host,
      installed_persistently: browserAdapter.installed_persistently,
      workflow_verified_at_registration: browserAdapter.workflow_verified,
      direct_execution_enabled: browserAdapter.browser_automation_api_active,
      existing_cloudflare_browser_unchanged: browserAdapter.cloud_browser_runtime_unchanged,
      plugins_and_mcp_unchanged: browserAdapter.existing_plugin_and_mcp_routes_unchanged,
      paid_cloud_required: browserAdapter.paid_lexmount_cloud,
      smoke_only: browserAdapter.deployment_mode,
      next_action: browserAdapter.next_action,
      capabilities: browserAdapter.capabilities,
    }, 200, { "Cache-Control": "no-store" });
  });
  return api;
}
