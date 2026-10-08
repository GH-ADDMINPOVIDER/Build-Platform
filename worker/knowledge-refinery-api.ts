import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { lookupOgeIncident, OGE_ERROR_MEMORY_VERSION } from "./oge-error-memory";
import {
  KNOWLEDGE_REFINERY_VERSION,
  CANONICAL_CONVERSATION,
  CANONICAL_SESSION,
  buildKnowledgeActors,
  buildKnowledgePlan,
  buildIdleResearchDecision,
  type KnowledgePlanInput,
} from "./knowledge-refinery";

export type KnowledgeRefineryBindings = AuthBindings & Record<string, unknown>;
type Env = { Bindings: KnowledgeRefineryBindings };

type PlanRequest = KnowledgePlanInput;

export function createKnowledgeRefineryApi() {
  const api = new Hono<Env>();

  api.use("/api/knowledge-refinery/*", async (c, next) => {
    if (c.req.path === "/api/knowledge-refinery/health") return next();
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/knowledge-refinery/health", (c) => c.json({
    ok: true,
    runtime: KNOWLEDGE_REFINERY_VERSION,
    lifecycle: ["SOURCE", "DISTILL", "REPRODUCE", "FIX", "SPECIALIST_REVIEW", "VERIFY", "RETAIN"],
    yellow_execution_authority: "YELLOW_STONE_ONLY",
    violet_orchestration: true,
    ruby_verification_required: true,
    green_retention_target: "GREEN_1LSS",
    canonical: { conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION },
    docker_is_worker_not_agent: true,
    cursor_activation: "ON_DEMAND",
    idle_research: "BUDGET_GATED_READ_ONLY",
    new_d1_schema: false,
    secrets_exposed: false,
  }, 200, { "Cache-Control": "no-store" }));

  // Reuses the existing Knowledge Refinery authority: no new gate or D1 table.
  api.get("/api/knowledge-refinery/incident", (c) => {
    const issue = c.req.query("oge") || c.req.query("issue") || "";
    const httpRaw = c.req.query("http");
    if (httpRaw && !/^[1-5]\d{2}$/.test(httpRaw)) {
      return c.json({ ok: false, code: "INVALID_HTTP_STATUS_USE_CODE_FOR_APP_ERRORS" }, 400);
    }
    const http = httpRaw ? Number(httpRaw) : null;
    const result = lookupOgeIncident({
      issue, http,
      code: c.req.query("code") || "",
      component: c.req.query("component") || "",
    });
    return c.json({
      ok: true,
      runtime: OGE_ERROR_MEMORY_VERSION,
      source: "GITHUB_VERSIONED_INCIDENT_MEMORY",
      read_only: true,
      ...result,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/knowledge-refinery/actors", (c) => c.json({
    ok: true,
    runtime: KNOWLEDGE_REFINERY_VERSION,
    actors: buildKnowledgeActors(c.env),
  }, 200, { "Cache-Control": "no-store" }));

  api.post("/api/knowledge-refinery/plan", async (c) => {
    const body = await c.req.json<PlanRequest>().catch(() => null);
    if (!body) return c.json({ ok: false, code: "INVALID_REQUEST" }, 400);
    const result = buildKnowledgePlan(body);
    return c.json(result, result.ok ? 200 : result.code === "INTENT_REQUIRED" ? 400 : 403, { "Cache-Control": "no-store" });
  });

  api.post("/api/knowledge-refinery/idle-decision", async (c) => {
    const body = await c.req.json<PlanRequest>().catch(() => null);
    if (!body) return c.json({ ok: false, code: "INVALID_REQUEST" }, 400);
    return c.json({
      ok: true,
      runtime: KNOWLEDGE_REFINERY_VERSION,
      decision: buildIdleResearchDecision(body),
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
