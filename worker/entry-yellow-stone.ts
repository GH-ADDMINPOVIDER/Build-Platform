import base from "./entry-connectors";
import {
  createCapabilityResolverApi,
  type CapabilityResolverBindings,
} from "./capability-resolver-api";
import { createCapabilityExecutionApi } from "./capability-execution-api";
import { createOpenAISelfHostApi } from "./openai-selfhost-api";
import { createCodexLeftArmApi } from "./codex-left-arm-api";
import { createMcpConfigApi } from "./mcp-config-api";
import { createWhiteDiamondApi } from "./white-diamond-api";
import { createBlueDiamondApi } from "./blue-diamond-api";
import { createVioletStoneApi } from "./violet-stone-api";
import { createRubyStoneApi } from "./ruby-stone-api";
import { createKnowledgeRefineryApi } from "./knowledge-refinery-api";
import { createProviderReadinessApi } from "./provider-readiness-api";
import { createPerplexityAgentApi, type PerplexityAgentBindings } from "./perplexity-agent-api";
import { createDeepSeekApi, type DeepSeekBindings } from "./deepseek-api";
import { createGeminiApi, type GeminiBindings } from "./gemini-api";
import { createXaiApi, type XaiBindings } from "./xai-api";
import { createMetaModelApi, type MetaModelBindings } from "./meta-model-api";
import { createTaskInboxApi, type TaskInboxBindings } from "./task-inbox-api";
import { createChatMessageActionApi, type ChatMessageActionBindings } from "./chat-message-action-api";
import { createMaopLabApi } from "./maop-lab-api";
import { createUseCardApi } from "./use-card-api";
import { createCapabilityCardStoneApi } from "./capability-card-stone-api";
import { createN8nMigrationApi } from "./n8n-migration-api";
import { hasOwnerOrOpsAccess } from "./app-auth";
import { buildBlueDiamondRegistry, type BlueDiamondRegistryEnv } from "./blue-diamond-registry";
import { planAthenaCommand } from "./athena-command-planner";

const resolverApi = createCapabilityResolverApi();
const executionApi = createCapabilityExecutionApi();
const selfHostApi = createOpenAISelfHostApi();
const codexLeftArmApi = createCodexLeftArmApi();
const mcpConfigApi = createMcpConfigApi();
const whiteDiamondApi = createWhiteDiamondApi();
const blueDiamondApi = createBlueDiamondApi();
const violetStoneApi = createVioletStoneApi();
const rubyStoneApi = createRubyStoneApi();
const knowledgeRefineryApi = createKnowledgeRefineryApi();
const providerReadinessApi = createProviderReadinessApi();
const perplexityAgentApi = createPerplexityAgentApi();
const deepSeekApi = createDeepSeekApi();
const geminiApi = createGeminiApi();
const xaiApi = createXaiApi();
const metaModelApi = createMetaModelApi();
const taskInboxApi = createTaskInboxApi();
const chatMessageActionApi = createChatMessageActionApi();
const maopLabApi = createMaopLabApi();
const useCardApi = createUseCardApi();
const capabilityCardStoneApi = createCapabilityCardStoneApi();
const n8nMigrationApi = createN8nMigrationApi();

const ATHENA_ACTOR_ID = "athena-command";
const EXECUTION_AUTHORITY = "YELLOW_STONE_ONLY";

type Bindings = CapabilityResolverBindings & BlueDiamondRegistryEnv & PerplexityAgentBindings & DeepSeekBindings & GeminiBindings & XaiBindings & MetaModelBindings & TaskInboxBindings & ChatMessageActionBindings & Record<string, unknown>;
type WaveCommandBody = {
  intent?: unknown;
  capability?: unknown;
  provider?: unknown;
  environment?: unknown;
  input?: { path?: unknown; prompt?: unknown };
};

const compact = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function handoffMetadata(athena: { maturity?: unknown }) {
  return {
    source_surface: "WAVE",
    admission: "BLUE_DIAMOND_ATHENA",
    actor_id: ATHENA_ACTOR_ID,
    maturity: athena.maturity,
    admitted: true,
    execution_authority: EXECUTION_AUTHORITY,
    yellow_stone_route: "/api/capabilities/execute",
    direct_execution_bypass: false,
  };
}

async function athenaGuardedCommand(request: Request, env: Bindings, ctx: unknown) {
  if (request.method !== "POST") {
    return Response.json({ ok: false, code: "METHOD_NOT_ALLOWED", allowed: ["POST"] }, { status: 405 });
  }
  if (!(await hasOwnerOrOpsAccess(request, env))) {
    return Response.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, { status: 401 });
  }

  const athena = buildBlueDiamondRegistry(env).find((actor) => actor.actor_id === ATHENA_ACTOR_ID);
  if (!athena) {
    return Response.json({
      ok: false,
      code: "ATHENA_NOT_REGISTERED",
      execution_authority: EXECUTION_AUTHORITY,
    }, { status: 503 });
  }
  if (!athena.agent_eligible) {
    return Response.json({
      ok: false,
      code: "ATHENA_NOT_AGENT_EXECUTABLE",
      actor_id: ATHENA_ACTOR_ID,
      execution_authority: EXECUTION_AUTHORITY,
    }, { status: 503 });
  }
  if (athena.state === "CONFIGURATION_REQUIRED" || athena.state === "OFFLINE") {
    return Response.json({
      ok: false,
      code: "CONFIGURATION_REQUIRED",
      actor_id: ATHENA_ACTOR_ID,
      state: athena.state,
      execution_authority: EXECUTION_AUTHORITY,
    }, { status: 503 });
  }

  const body = await request.clone().json().catch(() => null) as WaveCommandBody | null;
  if (!body || typeof body !== "object") {
    return Response.json({
      ok: false,
      code: "INVALID_REQUEST",
      message: "JSON command body required",
      command_handoff: handoffMetadata(athena),
    }, { status: 400 });
  }

  const intent = compact(body.intent, 1200);
  const explicitCapability = compact(body.capability, 160);
  const explicitProvider = compact(body.provider, 120);
  const explicitStructured = Boolean(explicitCapability || explicitProvider);

  let commandPlan: Record<string, unknown>;
  let delegatedBody: Record<string, unknown>;

  if (explicitStructured) {
    const inputPath = compact(body.input?.path, 500);
    const inputPrompt = compact(body.input?.prompt, 6000);
    commandPlan = {
      plan_version: "ATHENA_COMMAND_PLAN_V1",
      planner: "EXPLICIT_STRUCTURED_V1",
      status: "READY",
      normalized_intent: intent,
      capability: explicitCapability || undefined,
      provider: explicitProvider || undefined,
      environment: "staging",
      input: inputPath || inputPrompt ? { path: inputPath || undefined, prompt: inputPrompt || undefined } : undefined,
      requires_yellow_stone: true,
      approval_authority: "YELLOW_STONE",
      direct_execution_bypass: false,
    };
    delegatedBody = {
      intent,
      capability: explicitCapability,
      provider: explicitProvider,
      environment: "staging",
      allowMigration: false,
      allowOptional: false,
      input: inputPath || inputPrompt ? { path: inputPath || undefined, prompt: inputPrompt || undefined } : undefined,
    };
  } else {
    const planned = planAthenaCommand(intent);
    commandPlan = planned as unknown as Record<string, unknown>;
    if (planned.status !== "READY") {
      const status = planned.status === "AMBIGUOUS" ? 409 : 422;
      return Response.json({
        ok: false,
        code: `ATHENA_PLAN_${planned.status}`,
        command_plan: planned,
        verification: { status: "blocked", reason: planned.reason || "PLANNER_STOP" },
        command_handoff: handoffMetadata(athena),
      }, { status, headers: { "Cache-Control": "no-store" } });
    }
    delegatedBody = {
      intent: planned.normalized_intent,
      capability: planned.capability,
      provider: planned.provider,
      environment: "staging",
      allowMigration: false,
      allowOptional: false,
      input: planned.input,
    };
  }

  const url = new URL(request.url);
  url.pathname = "/api/capabilities/execute";
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-ogenic-command-origin", "blue-diamond-athena");
  const delegated = new Request(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(delegatedBody),
    redirect: request.redirect,
  });

  const response = await executionApi.fetch(delegated, env as never, ctx as never);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;

  const payload = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({
    ...payload,
    command_plan: commandPlan,
    command_handoff: handoffMetadata(athena),
  }), {
    status: response.status,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Bindings, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/capabilities/resolve") {
      return resolverApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/capabilities/execute") {
      return executionApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/wave/command") {
      return athenaGuardedCommand(request, env, ctx);
    }
    if (pathname.startsWith("/api/mcp-config/")) {
      return mcpConfigApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/white-diamond/")) {
      return whiteDiamondApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/blue-diamond/")) {
      return blueDiamondApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/violet/")) {
      return violetStoneApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/ruby/")) {
      return rubyStoneApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/knowledge-refinery/")) {
      return knowledgeRefineryApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/provider-readiness")) {
      return providerReadinessApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/perplexity/")) {
      return perplexityAgentApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/deepseek/")) {
      return deepSeekApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/gemini/")) {
      return geminiApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/xai/")) {
      return xaiApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/meta-model/")) {
      return metaModelApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/task-inbox")) {
      return taskInboxApi.fetch(request, env as never, ctx as never);
    }
    if (pathname === "/api/chat/message-action") {
      return chatMessageActionApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/maop/lab")) {
      return maopLabApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/use-card/")) {
      return useCardApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/ccs/")) {
      return capabilityCardStoneApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/n8n/migration")) {
      return n8nMigrationApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/openai/selfhost/")) {
      return selfHostApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/codex/")) {
      return codexLeftArmApi.fetch(request, env as never, ctx as never);
    }
    return base.fetch(request, env as never, ctx);
  },
  scheduled(controller: unknown, env: Bindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    return base.scheduled(controller, env as never, ctx);
  },
};
