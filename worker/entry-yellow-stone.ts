import base from "./entry-connectors";
import {
  createCapabilityResolverApi,
  type CapabilityResolverBindings,
} from "./capability-resolver-api";
import { createCapabilityExecutionApi } from "./capability-execution-api";
import { createOpenAISelfHostApi } from "./openai-selfhost-api";
import { createCodexLeftArmApi } from "./codex-left-arm-api";
import { createMcpConfigApi } from "./mcp-config-api";
import { connectorManifest, normalizeConnectorEnvelope } from "./connector-endpoint-api";
import { protocolCatalog, normalizeProtocolInvocation } from "./connector-protocol-bridge";
import { createWhiteDiamondApi } from "./white-diamond-api";
import { createBlueDiamondApi } from "./blue-diamond-api";
import { createVioletStoneApi } from "./violet-stone-api";
import { createRubyStoneApi } from "./ruby-stone-api";
import { createRuleStoneApi } from "./rule-stone-api";
import { createKnowledgeRefineryApi } from "./knowledge-refinery-api";
import { createPageIndexApi } from "./pageindex-api";
import { createMoliBrowserApi } from "./moli-browser-api";
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
import { hasOwnerOrOpsAccess, hasOwnerSession } from "./app-auth";
import { readConnectorRegistry, testConnector, recentConnectorEvents } from "./connector-runtime";
import { verifiedFunctionTools, executeVerifiedTool, type VerifiedToolBindings } from "./verified-function-tools";
import { buildBlueDiamondRegistry, type BlueDiamondRegistryEnv } from "./blue-diamond-registry";
import { planAthenaCommand } from "./athena-command-planner";
import { normalizeWaveCommandBody, waveCommandPolicy } from "./wave-command-contract";
import { createDiscordApi } from "./discord-api";
import { dispatchWaveCommandConsumer } from "./wave-command-dispatch";

const resolverApi = createCapabilityResolverApi();
const executionApi = createCapabilityExecutionApi();
const selfHostApi = createOpenAISelfHostApi();
const codexLeftArmApi = createCodexLeftArmApi();
const mcpConfigApi = createMcpConfigApi();
const whiteDiamondApi = createWhiteDiamondApi();
const blueDiamondApi = createBlueDiamondApi();
const violetStoneApi = createVioletStoneApi();
const rubyStoneApi = createRubyStoneApi();
const ruleStoneApi = createRuleStoneApi();
const knowledgeRefineryApi = createKnowledgeRefineryApi();
const pageIndexApi = createPageIndexApi();
const moliBrowserApi = createMoliBrowserApi();
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
// CCS facade route proof trigger
const n8nMigrationApi = createN8nMigrationApi();
const discordApi = createDiscordApi();

const ATHENA_ACTOR_ID = "athena-command";
const EXECUTION_AUTHORITY = "YELLOW_STONE_ONLY";

type Bindings = CapabilityResolverBindings & BlueDiamondRegistryEnv & PerplexityAgentBindings & DeepSeekBindings & GeminiBindings & XaiBindings & MetaModelBindings & TaskInboxBindings & ChatMessageActionBindings & Record<string, unknown> & { GITHUB_TOKEN?: string };
type WaveCommandBody = {
  command?: unknown;
  intent?: unknown;
  capability?: unknown;
  provider?: unknown;
  environment?: unknown;
  mode?: unknown;
  command_mode?: unknown;
  input?: { path?: unknown; prompt?: unknown };
  approval?: { confirmed?: unknown; approval_id?: unknown };
};

type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

type CommandQueueDb = { prepare: (query: string) => D1Prepared };

const compact = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function approvalIdFor(plan: Record<string, unknown>) {
  return `wave-approval-${await sha256Hex(JSON.stringify(plan))}`;
}

async function queueApprovedCommand(db: CommandQueueDb, plan: Record<string, unknown>, approvalId: string) {
  const taskId = `wavecmd_${approvalId.replace("wave-approval-", "")}`;
  const correlationId = `wavecmd-corr-${approvalId.slice(-40)}`;
  const capability = compact(plan.capability, 120) || "wave_command";
  const provider = compact(plan.provider, 80) || "yellow-stone";
  const intent = compact(plan.normalized_intent, 1200);
  const title = compact(intent, 160) || `WAVE command · ${capability}`;
  const resourceKey = `wave-command:${provider}:staging`;
  const existing = await db.prepare(
    "SELECT id, status, capability, correlation_id FROM agent_tasks WHERE id = ? LIMIT 1",
  ).bind(taskId).first<Record<string, unknown>>();
  if (existing) return { task: existing, replayed: true };

  await db.prepare(
    `INSERT INTO agent_tasks(
       id, title, capability, status, priority, resource_key, claimed_by,
       correlation_id, github_repo, source_ref, attempt_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'QUEUED', 90, ?, NULL, ?,
       'Ogenicchocolate21debug/Build-Platform', 'owner-main/1LSS_OWNER_MAIN', 0,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).bind(taskId, title, capability, resourceKey, correlationId).run();

  await db.prepare(
    `INSERT OR IGNORE INTO agent_events(
       id, task_id, event_type, actor, correlation_id, external_ref, created_at
     ) VALUES (?, ?, 'OWNER_APPROVED_COMMAND_QUEUED', 'owner-main', ?, ?, CURRENT_TIMESTAMP)`,
  ).bind(
    `event-owner-approved-${approvalId.slice(-48)}`,
    taskId,
    correlationId,
    JSON.stringify({ approval_id: approvalId, provider, capability, environment: "staging", intent, execution_authority: EXECUTION_AUTHORITY }),
  ).run();

  const task = await db.prepare(
    "SELECT id, status, capability, correlation_id FROM agent_tasks WHERE id = ? LIMIT 1",
  ).bind(taskId).first<Record<string, unknown>>();
  return { task, replayed: false };
}

async function markDispatchFailure(db: CommandQueueDb, taskId: string, code: string) {
  await db.prepare(
    "UPDATE agent_tasks SET status = 'BLOCKED', updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'QUEUED'",
  ).bind(taskId).run();
  await db.prepare(
    `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, external_ref, created_at)
     VALUES (?, ?, 'COMMAND_DISPATCH_BLOCKED', 'yellow-stone', ?, CURRENT_TIMESTAMP)`,
  ).bind(`event-dispatch-blocked-${taskId}`, taskId, code).run();
}

async function commandConsumerClaim(request: Request, env: Bindings) {
  if (!(await hasOwnerOrOpsAccess(request, env))) {
    return Response.json({ ok: false, code: "REAUTH_REQUIRED" }, { status: 401 });
  }
  const db = (env as { DB?: CommandQueueDb }).DB;
  if (!db) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { task_id?: unknown };
  const taskId = compact(body.task_id, 180);
  if (!/^wavecmd_[a-f0-9]{64}$/.test(taskId)) {
    return Response.json({ ok: false, code: "INVALID_TASK_ID" }, { status: 400 });
  }
  const task = await db.prepare(
    `UPDATE agent_tasks
     SET status = 'RUNNING', claimed_by = 'codex-selfhost:wave-runner-01',
         claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
         attempt_count = attempt_count + 1
     WHERE id = ? AND status = 'QUEUED' AND capability = 'codex_selfhost'
       AND EXISTS (
         SELECT 1 FROM agent_events
         WHERE task_id = agent_tasks.id AND event_type = 'OWNER_APPROVED_COMMAND_QUEUED'
       )
     RETURNING id, title, status, capability, correlation_id, claimed_by`,
  ).bind(taskId).first<Record<string, unknown>>();
  if (!task) {
    const existing = await db.prepare(
      "SELECT id, status, claimed_by FROM agent_tasks WHERE id = ? LIMIT 1",
    ).bind(taskId).first<Record<string, unknown>>();
    return Response.json({
      ok: false,
      code: existing ? "TASK_NOT_CLAIMABLE" : "TASK_NOT_FOUND",
      task: existing ?? null,
    }, { status: existing ? 409 : 404 });
  }
  const event = await db.prepare(
    `SELECT external_ref FROM agent_events
     WHERE task_id = ? AND event_type = 'OWNER_APPROVED_COMMAND_QUEUED'
     ORDER BY created_at ASC LIMIT 1`,
  ).bind(taskId).first<{ external_ref?: string }>();
  let command: Record<string, unknown> = {};
  try { command = JSON.parse(String(event?.external_ref || "{}")); } catch { /* fail below */ }
  const intent = compact(command.intent, 1200);
  if (!intent) {
    await db.prepare(
      "UPDATE agent_tasks SET status = 'BLOCKED', updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(taskId).run();
    return Response.json({ ok: false, code: "APPROVED_INTENT_UNAVAILABLE" }, { status: 409 });
  }
  await db.prepare(
    `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, external_ref, created_at)
     VALUES (?, ?, 'COMMAND_CONSUMER_STARTED', 'codex-selfhost:wave-runner-01', 'runner-1', CURRENT_TIMESTAMP)`,
  ).bind(`event-consumer-start-${taskId}`, taskId).run();
  return Response.json({
    ok: true,
    task: { ...task, intent },
    policy: "OWNER_APPROVED_ONLY · STAGING_ONLY · RUNNER_1",
  }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

async function commandConsumerResult(request: Request, env: Bindings) {
  if (!(await hasOwnerOrOpsAccess(request, env))) {
    return Response.json({ ok: false, code: "REAUTH_REQUIRED" }, { status: 401 });
  }
  const db = (env as { DB?: CommandQueueDb }).DB;
  if (!db) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as {
    task_id?: unknown; status?: unknown; result_sha256?: unknown; git_sha?: unknown; evidence_ref?: unknown;
  };
  const taskId = compact(body.task_id, 180);
  const status = compact(body.status, 24).toUpperCase();
  const resultSha = compact(body.result_sha256, 64);
  const gitSha = compact(body.git_sha, 64);
  const evidenceRef = compact(body.evidence_ref, 300);
  if (!/^wavecmd_[a-f0-9]{64}$/.test(taskId) || !["DONE", "BLOCKED", "FAILED"].includes(status)
      || !/^[a-f0-9]{64}$/.test(resultSha) || !/^[a-f0-9]{40}$/.test(gitSha)) {
    return Response.json({ ok: false, code: "INVALID_RESULT" }, { status: 400 });
  }
  const task = await db.prepare(
    `UPDATE agent_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'RUNNING' AND claimed_by = 'codex-selfhost:wave-runner-01'
     RETURNING id, status, capability, correlation_id, claimed_by, completed_at`,
  ).bind(status, taskId).first<Record<string, unknown>>();
  if (!task) return Response.json({ ok: false, code: "TASK_RESULT_REJECTED" }, { status: 409 });
  const external = JSON.stringify({ result_sha256: resultSha, git_sha: gitSha, evidence_ref: evidenceRef || null });
  await db.prepare(
    `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, external_ref, created_at)
     VALUES (?, ?, ?, 'codex-selfhost:wave-runner-01', ?, CURRENT_TIMESTAMP)`,
  ).bind(`event-consumer-result-${taskId}`, taskId, `COMMAND_RESULT_${status}`, external).run();
  return Response.json({ ok: true, task, evidence: { result_sha256: resultSha, git_sha: gitSha, evidence_ref: evidenceRef || null } }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

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
  const normalized = normalizeWaveCommandBody(body);
  if (!normalized.ok) {
    return Response.json({
      ok: false,
      code: normalized.code,
      message: normalized.message,
      command_handoff: handoffMetadata(athena),
    }, { status: normalized.code === "ENVIRONMENT_SCOPE_MISMATCH" ? 409 : 400 });
  }

  const commandPolicy = waveCommandPolicy(normalized.mode);
  const intent = normalized.intent;
  const explicitCapability = normalized.capability;
  const explicitProvider = normalized.provider;
  const explicitStructured = normalized.explicit_structured;

  let commandPlan: Record<string, unknown>;
  let delegatedBody: Record<string, unknown>;

  if (explicitStructured) {
    const inputPath = normalized.input.path ?? "";
    const inputPrompt = normalized.input.prompt ?? "";
    commandPlan = {
      plan_version: "ATHENA_COMMAND_PLAN_V1",
      planner: "EXPLICIT_STRUCTURED_V1",
      status: "READY",
      normalized_intent: intent,
      command_mode: normalized.mode,
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
      command_mode: normalized.mode,
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

  const approvalId = await approvalIdFor(commandPlan);
  const approvalConfirmed = body?.approval?.confirmed === true;
  const suppliedApprovalId = compact(body?.approval?.approval_id, 160);
  // Explicit GitHub file reads are already resolved and enforced as READ by
  // capabilityExecutionApi. Keep them auto-allowed; every queued or mutating
  // command still requires the matching second owner confirmation below.
  const safeExplicitRead =
    explicitStructured &&
    explicitCapability === "read_file" &&
    explicitProvider === "github";
  if (!safeExplicitRead && !approvalConfirmed) {
    return Response.json({
      ok: false,
      code: "OWNER_APPROVAL_REQUIRED",
      command_plan: commandPlan,
      command_policy: commandPolicy,
      approval: {
        required: true,
        approval_id: approvalId,
        action: "CONFIRM_AND_QUEUE",
        environment: "staging",
        effect: "Queues the approved command for the existing Yellow Stone / self-host consumer.",
      },
      execution: { status: "NOT_STARTED", consumer_proven: false },
      command_handoff: handoffMetadata(athena),
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  if (!safeExplicitRead && (!suppliedApprovalId || suppliedApprovalId !== approvalId)) {
    return Response.json({
      ok: false,
      code: "APPROVAL_PLAN_MISMATCH",
      verification: { status: "blocked", reason: "APPROVAL_ID_MUST_MATCH_CURRENT_PLAN" },
      command_handoff: handoffMetadata(athena),
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  if (explicitStructured && explicitCapability === "codex_selfhost" && explicitProvider === "openai") {
    const db = (env as { DB?: CommandQueueDb }).DB;
    if (!db) {
      return Response.json({
        ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB",
        execution: { status: "NOT_QUEUED", consumer_proven: false },
        command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const queued = await queueApprovedCommand(db, commandPlan, approvalId);
    const taskId = compact(queued.task?.id, 180);
    if (!queued.replayed) {
      const dispatched = await dispatchWaveCommandConsumer(env, taskId);
      if (!dispatched.ok) {
        await markDispatchFailure(db, taskId, dispatched.code);
        return Response.json({
          ok: false, code: dispatched.code, missing: "missing" in dispatched ? dispatched.missing : undefined,
          task: { ...queued.task, status: "BLOCKED" },
          approval: { required: false, approval_id: approvalId, confirmed: true },
          execution: { status: "BLOCKED", consumer_proven: false, route: "YELLOW_STONE_CODEX_SELFHOST" },
          command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
        }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({
      ok: true, code: queued.replayed ? "COMMAND_ALREADY_QUEUED" : "COMMAND_DISPATCHED",
      task: queued.task, idempotent_replay: queued.replayed,
      approval: { required: false, approval_id: approvalId, confirmed: true },
      execution: {
        status: queued.replayed ? compact(queued.task?.status, 40) : "DISPATCHED",
        consumer_proven: false,
        route: "YELLOW_STONE_CODEX_SELFHOST",
        note: "GitHub Actions dispatched to Runner-1; completion requires COMMAND_RESULT event.",
      },
      command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
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
  if (response.status === 409 && payload.code === "HUMAN_APPROVAL_REQUIRED") {
    const db = (env as { DB?: CommandQueueDb }).DB;
    if (!db) {
      return Response.json({
        ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB",
        approval: { required: false, approval_id: approvalId, confirmed: true },
        execution: { status: "NOT_QUEUED", consumer_proven: false },
        command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const queued = await queueApprovedCommand(db, commandPlan, approvalId);
    return Response.json({
      ok: true, code: "COMMAND_QUEUED", task: queued.task, idempotent_replay: queued.replayed,
      approval: { required: false, approval_id: approvalId, confirmed: true },
      execution: {
        status: "QUEUED", consumer_proven: false,
        note: "Queued in existing agent_tasks; runtime completion requires a real consumer receipt in agent_events.",
      },
      command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
    }, { status: queued.replayed ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({
    ...payload,
    command_plan: commandPlan,
    command_policy: commandPolicy,
    command_handoff: handoffMetadata(athena),
  }), {
    status: response.status,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Bindings, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    // Public signed ingress reuses existing HMAC/replay handlers without any new trust boundary.
    if (pathname.startsWith("/api/connector-endpoint/v1/ingress/")) {
      const provider = pathname.slice("/api/connector-endpoint/v1/ingress/".length);
      if (!["line", "meta", "generic", "openai"].includes(provider) ||
          (request.method !== "POST" && !(provider === "meta" && request.method === "GET"))) {
        return Response.json({ ok: false, code: "SIGNED_INGRESS_NOT_SUPPORTED" }, { status: 404 });
      }
      const target = new URL(request.url);
      target.pathname = "/hooks/" + provider;
      // The raw body, signature headers and query stay untouched.
      return base.fetch(new Request(target.toString(), request), env as never, ctx as never);
    }
    if (pathname.startsWith("/api/discord/")) {
      return discordApi.fetch(request, env as never, ctx as never);
    }
    if (pathname === "/api/capabilities/resolve") {
      return resolverApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/capabilities/execute") {
      return executionApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/wave/command/claim") {
      return commandConsumerClaim(request, env);
    }
    if (pathname === "/api/wave/command/result") {
      return commandConsumerResult(request, env);
    }
    if (pathname === "/api/wave/command") {
      return athenaGuardedCommand(request, env, ctx);
    }
    if (pathname.startsWith("/api/connector-endpoint/v1/")) {
      if (!(await hasOwnerOrOpsAccess(request, env))) {
        return Response.json({ ok: false, code: "REAUTH_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
      }
      if (pathname === "/api/connector-endpoint/v1/protocols" && request.method === "GET") {
        return Response.json({
          ok: true, environment: "staging", protocols: protocolCatalog,
          mode_count: protocolCatalog.length, execution_authority: "YELLOW_STONE_ONLY",
          source_contract_is_not_live_e2e: true,
          signed_ingress: "/api/connector-endpoint/v1/ingress/{line|meta|generic|openai}",
        }, { headers: { "Cache-Control": "no-store" } });
      }
      if (pathname === "/api/connector-endpoint/v1/operate" && request.method === "POST") {
        // All 15 adapter categories use this one endpoint. Privileged calls
        // require the existing signed Owner session, never a raw OPS header.
        if (!(await hasOwnerSession(request, env))) {
          return Response.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, { status: 401 });
        }
        const raw = await request.text();
        if (raw.length > 8000) return Response.json({ ok: false, code: "OPERATION_TOO_LARGE" }, { status: 413 });
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
        const checked = normalizeProtocolInvocation(parsed);
        if (!checked.ok) return Response.json({ ok: false, code: checked.code }, {
          status: 422, headers: { "Cache-Control": "no-store" },
        });
        const op = checked.value;
        const protocol = protocolCatalog.find(item => item.transport === op.transport);
        if (op.operation === "inspect") {
          return Response.json({
            ok: true, transport: op.transport, protocol,
            configured_is_not_live_e2e: true,
            note: "Introspection only. Side effects must use Owner-signed WAVE Command and Runner-1.",
          }, { headers: { "Cache-Control": "no-store" } });
        }
        if (op.operation === "reference") {
          // Infisical is the values authority; D1 only holds opaque handles.
          const db = (env as { DB?: {
            prepare: (sql: string) => { bind: (...args: unknown[]) => {
              all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
            } };
          } }).DB;
          if (!db) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 DB" }, { status: 503 });
          const rows = await db.prepare(
            "SELECT provider_id, binding_type, status, secret_ref FROM provider_bindings WHERE provider_id = ? AND environment = 'staging' LIMIT 15",
          ).bind(op.provider).all<{ provider_id: string; binding_type: string; status: string; secret_ref: string | null }>();
          const bindings = (rows.results ?? []).map(item => ({
            provider: item.provider_id, kind: item.binding_type, state: item.status,
            reference_present: Boolean(item.secret_ref), credential_values_exposed: false,
          }));
          return Response.json({ ok: true, transport: op.transport, provider: op.provider,
            bindings, source: "D1_REFERENCE_ONLY", value_export: false, active_session_e2e_proven: false,
          }, { headers: { "Cache-Control": "no-store" } });
        }
        if (op.operation === "probe" && op.transport === "n8n") {
          const status = await testConnector(env, "n8n");
          const healthy = "ok" in status ? status.ok === true : status.state === "LIVE";
          return Response.json({ ok: healthy, transport: "n8n", probe: status,
            workflow_execution_proven: false,
          }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
        }
        if (op.operation === "discover" && op.transport === "mcp") {
          const target = new URL(request.url);
          target.pathname = "/api/mcp-config/discover";
          target.search = new URLSearchParams({ provider: op.provider }).toString();
          return mcpConfigApi.fetch(new Request(target.toString(), { method: "GET", headers: request.headers }), env as never, ctx as never);
        }
        if (op.operation === "resolve" && op.transport === "api") {
          const target = new URL(request.url);
          target.pathname = "/api/capabilities/resolve";
          return resolverApi.fetch(new Request(target.toString(), {
            method: "POST", headers: request.headers,
            body: JSON.stringify({ provider: op.provider, intent: op.command || "inspect available capability" }),
          }), env as never, ctx as never);
        }
        if (op.operation === "invoke_read") {
          if (op.transport === "mcp") {
            if (!op.provider) return Response.json({ ok: false, code: "PROVIDER_REQUIRED" }, { status: 422 });
            const target = new URL(request.url);
            target.pathname = "/api/mcp-config/read-tool";
            return mcpConfigApi.fetch(new Request(target.toString(), {
              method: "POST", headers: request.headers,
              body: JSON.stringify({ provider: op.provider, tool: op.name, arguments: op.arguments }),
            }), env as never, ctx as never);
          }
          if (!["pr_api", "api", "function_calling"].includes(op.transport) ||
              (op.transport === "pr_api" && !["github_staging_status", "github_fetch_file"].includes(op.name)) ||
              !verifiedFunctionTools.some(tool => tool.name === op.name)) {
            return Response.json({ ok: false, code: "HUMAN_APPROVAL_REQUIRED",
              command: "/api/connector-endpoint/v1/command" }, { status: 409 });
          }
          const result = await executeVerifiedTool(op.name, op.arguments, env as VerifiedToolBindings);
          return Response.json({ ...result, transport: op.transport, execution_authority: "READ_ONLY" }, {
            status: result.ok === true ? 200 : 422, headers: { "Cache-Control": "no-store" },
          });
        }
        if (op.operation === "plan" || op.operation === "confirm") {
          // NPX/npm/SDK are NOT direct shell permissions. They ask the existing
          // Owner-gated Codex Runner to plan the work within staging scope.
          const runnerCommand = ["npx", "npm", "sdk"].includes(op.transport);
          const cmd: Record<string, unknown> = {
            command: op.command, environment: "staging",
            mode: op.transport === "a2a" ? "team" : "execute",
            ...(runnerCommand ? { capability: "codex_selfhost", provider: "openai" } : {}),
            ...(op.approval ? { approval: op.approval } : {}),
          };
          const target = new URL(request.url);
          target.pathname = "/api/wave/command";
          return athenaGuardedCommand(new Request(target.toString(), {
            method: "POST", headers: request.headers, body: JSON.stringify(cmd),
          }), env, ctx);
        }
        return Response.json({ ok: false, code: "PROTOCOL_ADAPTER_UNAVAILABLE" }, {
          status: 409, headers: { "Cache-Control": "no-store" },
        });
      }
      if (pathname === "/api/connector-endpoint/v1/manifest" && request.method === "GET") {
        return Response.json(connectorManifest, { headers: { "Cache-Control": "no-store" } });
      }
      if (pathname === "/api/connector-endpoint/v1/functions" && request.method === "GET") {
        return Response.json({
          ok: true, version: connectorManifest.version, environment: "staging",
          access: "EXISTING_OWNER_SESSION", read_only: true,
          functions: verifiedFunctionTools.map((tool) => ({
            name: tool.name, description: tool.description,
            risk: "READ", verified_execution_scope: "EXISTING_SEVEN_READ_TOOLS",
            parameters: tool.parameters,
          })),
          utilities: [
            { name: "connector_test", endpoint: connectorManifest.connector_test, risk: "READ_PROBE" },
            { name: "mcp_discover", endpoint: connectorManifest.mcp_discover, risk: "READ_DISCOVERY" },
            { name: "connector_events", endpoint: connectorManifest.events, risk: "READ_METADATA" },
          ],
          write_execution: "YELLOW_STONE_OWNER_SIGN_REQUIRED", connector_modes: connectorManifest.transports,
          runtime_e2e_proven: false,
        }, { headers: { "Cache-Control": "no-store" } });
      }
      if ((pathname === "/api/connector-endpoint/v1/invoke" ||
           pathname === "/api/connector-endpoint/v1/functions/invoke") && request.method === "POST") {
        // The original verified-function bridge is OWNER-ONLY; an OPS token
        // must not widen access to 1LSS messages or repository file content.
        if (!(await hasOwnerSession(request, env))) {
          return Response.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, {
            status: 401, headers: { "Cache-Control": "no-store" },
          });
        }
        const raw = await request.text();
        if (raw.length > 12000) {
          return Response.json({ ok: false, code: "FUNCTION_TOO_LARGE" }, { status: 413 });
        }
        let body: Record<string, unknown> | null = null;
        try { body = JSON.parse(raw) as Record<string, unknown>; } catch { /* Reject malformed JSON. */ }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "name" && key !== "arguments") ||
            !body.arguments || typeof body.arguments !== "object" || Array.isArray(body.arguments) ||
            typeof body.name !== "string" || body.name.length > 100) {
          return Response.json({ ok: false, code: "INVALID_FUNCTION_ENVELOPE" }, { status: 422 });
        }
        const name = body.name;
        if (!verifiedFunctionTools.some((tool) => tool.name === name)) {
          return Response.json({
            ok: false, code: "HUMAN_APPROVAL_REQUIRED",
            message: "Only pre-registered read-only functions may execute directly. Consequential actions must use the WAVE Command Owner sign gate.",
            command: connectorManifest.command,
          }, { status: 409, headers: { "Cache-Control": "no-store" } });
        }
        const result = await executeVerifiedTool(name, body.arguments, env as VerifiedToolBindings);
        return Response.json({
          ...result, route: "CONNECTOR_ENDPOINT_VERIFIED_READ", execution_authority: "READ_ONLY",
        }, { status: result.ok === true ? 200 : 422, headers: { "Cache-Control": "no-store" } });
      }
      if (pathname === "/api/connector-endpoint/v1/test" && request.method === "POST") {
        if (!(await hasOwnerSession(request, env))) {
          return Response.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, { status: 401 });
        }
        const raw = await request.text();
        if (raw.length > 1200) return Response.json({ ok: false, code: "TEST_TOO_LARGE" }, { status: 413 });
        let body: Record<string, unknown> | null = null;
        try { body = JSON.parse(raw) as Record<string, unknown>; } catch { /* no-op */ }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "connector") ||
            typeof body.connector !== "string" || !/^[a-z0-9_-]{1,60}$/.test(body.connector)) {
          return Response.json({ ok: false, code: "INVALID_CONNECTOR_TEST" }, { status: 422 });
        }
        const result = await testConnector(env, body.connector);
        // This probes an existing provider adapter. CONFIGURED is NOT a write
        // permission, and read health must not be reported as full E2E.
        const probePassed = "ok" in result ? result.ok === true : result.state === "LIVE";
        return Response.json({ ok: probePassed, test: result, full_e2e_proven: false }, {
          status: probePassed ? 200 : 503, headers: { "Cache-Control": "no-store" },
        });
      }
      if (pathname === "/api/connector-endpoint/v1/events" && request.method === "GET") {
        if (!(await hasOwnerSession(request, env))) {
          return Response.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, { status: 401 });
        }
        if (!(env as {DB?: unknown}).DB) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED" }, { status: 503 });
        const rawLimit = new URL(request.url).searchParams.get("limit") ?? "20";
        if (!/^[0-9]{1,3}$/.test(rawLimit)) return Response.json({ ok: false, code: "INVALID_LIMIT" }, { status: 422 });
        return Response.json({ ok: true, events: await recentConnectorEvents(env, Number(rawLimit)), raw_credential_values_exposed: false }, {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (pathname === "/api/connector-endpoint/v1/mcp/discover" && request.method === "GET") {
        const provider = new URL(request.url).searchParams.get("provider") ?? "";
        if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(provider)) {
          return Response.json({ ok: false, code: "INVALID_PROVIDER" }, { status: 422 });
        }
        const target = new URL(request.url);
        target.pathname = "/api/mcp-config/discover";
        target.search = new URLSearchParams({ provider }).toString();
        // Delegate to existing allowlisted remote MCP initialize/tools-list.
        return mcpConfigApi.fetch(new Request(target.toString(), request), env as never, ctx as never);
      }
      if (pathname === "/api/connector-endpoint/v1/status" && request.method === "GET") {
        const stateUrl = new URL(request.url);
        stateUrl.pathname = "/api/mcp-config/state";
        const read = await mcpConfigApi.fetch(new Request(stateUrl.toString(), request), env as never, ctx as never);
        const state = await read.json().catch(() => ({})) as Record<string, unknown>;
        const rows = Array.isArray(state.bindings) ? state.bindings : [];
        const metadata = rows.map((value: unknown) => {
          const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
          return {
            provider_id: String(row.provider_id ?? "").slice(0, 80),
            binding_type: String(row.binding_type ?? "").slice(0, 40),
            environment: String(row.environment ?? "").slice(0, 30),
            status: String(row.status ?? "").slice(0, 40),
            credential_reference_present: row.secret_ref_present === true,
            runtime_execution_verified: false,
          };
        });
        const providerStates = await readConnectorRegistry(env);
        return Response.json({
          ...connectorManifest,
          provider_statuses: providerStates.map((item) => ({
            id: item.id, kind: item.kind, state: item.state, route_mode: item.route_mode,
            // The existing runtime registry reports config/health only; never
            // promote its status into an authorized end-to-end execution proof.
            authorized_execution_verified: false,
            full_e2e_proven: false,
          })),
          registry: { ok: state.ok === true, bindings: metadata, count: metadata.length },
          runtime_command_e2e_proven: false,
          binding_list_does_not_prove_adapter_execution: true,
        }, { status: read.status, headers: { "Cache-Control": "no-store" } });
      }
      if (pathname === "/api/connector-endpoint/v1/command" && request.method === "POST") {
        const payload = await request.text();
        if (payload.length > 12000) {
          return Response.json({ ok: false, code: "COMMAND_TOO_LARGE" }, { status: 413 });
        }
        let data: unknown;
        try { data = JSON.parse(payload); } catch { data = null; }
        const connector = normalizeConnectorEnvelope(data);
        if (!connector.ok) {
          return Response.json({
            ok: false, code: connector.code,
            execution: { status: "NOT_STARTED", consumer_proven: false },
          }, { status: 422, headers: { "Cache-Control": "no-store" } });
        }
        const target = new URL(request.url);
        target.pathname = "/api/wave/command";
        const forwarded = new Request(target.toString(), {
          method: "POST", headers: request.headers,
          body: JSON.stringify(connector.delegated),
        });
        // Same ATHENA/Yellow authority, approval plan, queue, and D1 receipt.
        return athenaGuardedCommand(forwarded, env, ctx);
      }
      return Response.json({ ok: false, code: "CONNECTOR_ENDPOINT_NOT_FOUND" }, { status: 404 });
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
    if (pathname.startsWith("/api/rule-stone/")) {
      return ruleStoneApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/ruby/")) {
      return rubyStoneApi.fetch(request, env as never, ctx as never);
    }
    if (pathname === "/api/pageindex/status") {
      return pageIndexApi.fetch(request, env as never, ctx as never);
    }
    if (pathname === "/api/moli/status") {
      return moliBrowserApi.fetch(request, env as never, ctx as never);
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
