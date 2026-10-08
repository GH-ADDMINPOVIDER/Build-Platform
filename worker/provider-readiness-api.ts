import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { readProviderReadiness, routeVerifiedProvider, type ProviderReadinessEnv } from "./provider-readiness";
import { buildProviderOnboardingPreflight, PROVIDER_ONBOARDING_POLICY } from "./provider-onboarding-policy";

export type ProviderReadinessBindings = AuthBindings & ProviderReadinessEnv;
type Env = { Bindings: ProviderReadinessBindings };

type RouteBody = { task?: unknown; probe?: unknown };
const clean = (value: unknown, max = 100) => String(value ?? "").trim().slice(0, max);

export function createProviderReadinessApi() {
  const api = new Hono<Env>();

  api.use("/api/provider-readiness/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/provider-readiness", async (c) => {
    const probe = c.req.query("probe") === "1";
    const providers = await readProviderReadiness(c.env, { probe, signal: c.req.raw.signal });
    return c.json({
      ok: true,
      runtime: "PROVIDER_READINESS_V1",
      probe_mode: probe ? "READ_ONLY_METADATA_GET" : "LOCAL_ATTESTATION_ONLY",
      paid_completion_calls: false,
      routing_policy: "VERIFIED_ONLY_FAIL_CLOSED",
      providers,
    }, 200, { "Cache-Control": "no-store" });
  });

  // Compact, secret-free admission status for all current and future agents.
  // Probe=false: no external metadata or billable completion calls.
  api.get("/api/provider-readiness/onboarding", async (c) => {
    const reports = await readProviderReadiness(c.env, { probe: false });
    return c.json({
      ok: true,
      runtime: "PROVIDER_ONBOARDING_PREFLIGHT_V1",
      read_only: true,
      paid_completion_calls: false,
      policy: PROVIDER_ONBOARDING_POLICY,
      providers: buildProviderOnboardingPreflight(reports),
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/provider-readiness/route", async (c) => {
    const body = await c.req.json<RouteBody>().catch(() => ({} as RouteBody));
    const task = clean(body.task, 80);
    if (!task) return c.json({ ok: false, code: "TASK_REQUIRED" }, 400);
    const probe = body.probe === true;
    const providers = await readProviderReadiness(c.env, { probe, signal: c.req.raw.signal });
    const route = routeVerifiedProvider(task, providers);
    return c.json({
      ok: route.ok,
      runtime: "PROVIDER_READINESS_V1",
      route,
      providers: providers.map((provider) => ({
        provider: provider.provider,
        readiness: provider.readiness,
        key_present: provider.key_present,
        api_reachable: provider.api_reachable,
        quota_state: provider.quota_state,
        billing_state: provider.billing_state,
        cost_mode: provider.cost_mode,
        last_checked_at: provider.last_checked_at,
      })),
      policy: "READ_ONLY_ROUTE_DECISION_NO_EXECUTION",
    }, route.ok ? 200 : 409, { "Cache-Control": "no-store" });
  });

  return api;
}
