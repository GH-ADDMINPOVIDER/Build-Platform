import { isGitHubRunEvidence } from "./github-provider";
import base from "./entry-connectors";
import {
  createCapabilityResolverApi,
  type CapabilityResolverBindings,
} from "./capability-resolver-api";
import { createCapabilityExecutionApi } from "./capability-execution-api";
import { createOpenAISelfHostApi } from "./openai-selfhost-api";
import { createCodexLeftArmApi } from "./codex-left-arm-api";
import { createMcpConfigApi } from "./mcp-config-api";
import { connectorManifest, connectorModes, normalizeConnectorMode, normalizeConnectorEnvelope } from "./connector-endpoint-api";
import { inspectN8n } from "./connector-runtime";
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
import { buildBlueDiamondRegistry, type BlueDiamondRegistryEnv } from "./blue-diamond-registry";
import { planAthenaCommand } from "./athena-command-planner";
import { normalizeWaveCommandBody, waveCommandPolicy } from "./wave-command-contract";
import { createDiscordApi } from "./discord-api";
import { dispatchWaveCommandConsumer } from "./wave-command-dispatch";
import { createConnectorModesApi } from "./connector-modes-api";
import { createLocalAgentTeamApi } from "./local-agent-team-api";
import { readCertificateLincenc } from "./certificate-lincenc-registry";

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
const connectorModesApi = createConnectorModesApi();
const localAgentTeamApi = createLocalAgentTeamApi(
  (request, bindings, ctx) => athenaGuardedCommand(request, bindings as Bindings, ctx),
);

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

async function approvalIdFor(plan: Record<string, unknown>, requestId = "") {
  // New owner clicks receive independent task IDs. A repeated request with
  // the same Idempotency-Key remains one task; legacy callers keep old IDs.
  return `wave-approval-${await sha256Hex(JSON.stringify(requestId ? { plan, request_id: requestId } : plan))}`;
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
       'Wave-Runner-2/Build-Platform', 'owner-main/1LSS_OWNER_MAIN', 0,
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
    JSON.stringify({ approval_id: approvalId, provider, capability, environment: "staging", intent, execution_authority: EXECUTION_AUTHORITY, authorization: "SIGNED_OWNER_SESSION", second_confirmation_required: false }),
  ).run();

  const task = await db.prepare(
    "SELECT id, status, capability, correlation_id FROM agent_tasks WHERE id = ? LIMIT 1",
  ).bind(taskId).first<Record<string, unknown>>();
  return { task, replayed: false };
}

const MANUAL_WORKFLOW = "https://github.com/Wave-Runner-2/Build-Platform/actions/workflows/wave-command-consumer.yml";
function manualDispatchDetails(taskId: string, code: string) {
  return {
    mode: "GITHUB_OWNER_MANUAL",
    workflow_url: MANUAL_WORKFLOW,
    branch: "phase-vi-provider-incentive-metering",
    task_id: taskId,
    automatic_dispatch_error: code,
  };
}
async function noteDeferredDispatch(db: CommandQueueDb, taskId: string, code: string) {
  // Keep the authenticated Owner task claimable by the existing Runner-1 workflow.
  // A failed Actions:write token must never strand it as BLOCKED forever.
  await db.prepare(
    `INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, external_ref, created_at)
     VALUES (?, ?, 'COMMAND_DISPATCH_DEFERRED', 'yellow-stone', ?, CURRENT_TIMESTAMP)`,
  ).bind(`event-dispatch-deferred-${taskId}`, taskId, code).run();
}

async function commandConsumerStatus(request: Request, env: Bindings) {
  if (request.method !== "GET") return Response.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  if (!(await hasOwnerSession(request, env))) return Response.json({ ok: false, code: "REAUTH_REQUIRED" }, { status: 401 });
  const db = (env as { DB?: CommandQueueDb }).DB;
  if (!db) return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED" }, { status: 503 });
  const taskId = compact(new URL(request.url).searchParams.get("task_id"), 180);
  if (!/^wavecmd_[a-f0-9]{64}$/.test(taskId)) return Response.json({ ok: false, code: "INVALID_TASK_ID" }, { status: 400 });
  const task = await db.prepare(
    "SELECT id, status, capability, claimed_by, updated_at FROM agent_tasks WHERE id = ? AND capability = 'codex_selfhost' LIMIT 1",
  ).bind(taskId).first<Record<string, unknown>>();
  if (!task) return Response.json({ ok: false, code: "TASK_NOT_FOUND" }, { status: 404 });
  const receipt = await db.prepare(
    "SELECT event_type, external_ref, created_at FROM agent_events WHERE task_id = ? AND event_type LIKE 'COMMAND_RESULT_%' ORDER BY created_at DESC LIMIT 1",
  ).bind(taskId).first<Record<string, unknown>>();
  const raw = typeof receipt?.external_ref === "string" ? receipt.external_ref : "{}";
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(raw) as Record<string, unknown>; } catch { /* malformed evidence remains unverified */ }
  const resultSha = compact(metadata.result_sha256, 64);
  const gitSha = compact(metadata.git_sha, 40);
  const evidence = {
    result_sha256: /^[a-f0-9]{64}$/.test(resultSha) ? resultSha : null,
    git_sha: /^[a-f0-9]{40}$/.test(gitSha) ? gitSha : null,
    evidence_ref: isGitHubRunEvidence(metadata.evidence_ref)
      ? metadata.evidence_ref : null,
  };
  const proven = Boolean(task.status === "DONE" && receipt?.event_type === "COMMAND_RESULT_DONE"
    && evidence.result_sha256 && evidence.git_sha);
  return Response.json({
    ok: true, task, execution: { status: task.status, consumer_proven: proven },
    evidence, last_event: receipt?.event_type ?? null, canonical_session: "owner-main/1LSS_OWNER_MAIN",
  }, { status: 200, headers: { "Cache-Control": "no-store" } });
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

  // Reconcile an OpenBot Launch Room task only when it is explicitly linked
  // to THIS authenticated Runner-1 command result. No new D1 schema.
  const link = await db.prepare(
    "SELECT task_id FROM agent_events WHERE event_type = 'LOCAL_TEAM_COMMAND_LINKED' AND correlation_id = ? LIMIT 1",
  ).bind(taskId).first<{ task_id?: string }>();
  const roomTaskId = typeof link?.task_id === "string" ? link.task_id : "";
  if (/^localteam_[a-f0-9]{64}$/.test(roomTaskId)) {
    await db.prepare(
      "UPDATE agent_tasks SET status = ?, claimed_by = 'codex-selfhost:wave-runner-01', updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND capability = 'local_agent_team' AND status IN ('QUEUED','RUNNING','CLAIMED','VERIFYING')",
    ).bind(status, roomTaskId).run();
    await db.prepare(
      "INSERT OR IGNORE INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref, created_at) VALUES (?, ?, 'LOCAL_TEAM_RESULT_VERIFIED', 'codex-selfhost:wave-runner-01', ?, ?, CURRENT_TIMESTAMP)",
    ).bind("event-localteam-result-codex-" + taskId, roomTaskId, taskId,
      JSON.stringify({ command_task_id: taskId, status, result_sha256: resultSha, git_sha: gitSha,
        evidence_ref: evidenceRef || null, consumer_proven: status === "DONE" })).run();
    await db.prepare(
      "INSERT INTO agent_checkpoints(task_id, agent_id, checkpoint_ref, state_hash, updated_at) VALUES (?, 'codex-selfhost:wave-runner-01', ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(task_id, agent_id) DO UPDATE SET checkpoint_ref = excluded.checkpoint_ref, state_hash = excluded.state_hash, updated_at = CURRENT_TIMESTAMP",
    ).bind(roomTaskId, evidenceRef || "wave-command:" + taskId, resultSha).run();
  }
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
    execution_authority: EXECUTION_AUTHORITY, // existing tools route (compatibility only)
    owner_decision_authority: "SIGNED_OWNER_SESSION",
    yellow_stone_role: "TOOLS_ADAPTER_ONLY",
    yellow_stone_route: "/api/capabilities/execute",
    direct_execution_bypass: false,
  };
}

async function athenaGuardedCommand(request: Request, env: Bindings, ctx: unknown) {
  if (request.method !== "POST") {
    return Response.json({ ok: false, code: "METHOD_NOT_ALLOWED", allowed: ["POST"] }, { status: 405 });
  }
  // Signed Owner Session is the sole authorization for a staging command.
  // Reject forged origins and Ops-key-only callers; no second confirmation.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, code: "ORIGIN_DENIED" }, { status: 403 });
  }
  if (!(await hasOwnerSession(request, env))) {
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
      approval_authority: "SIGNED_OWNER_SESSION",
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

  // Signed Owner creates one task per action; retries reusing the same key remain idempotent.
  const requestId = compact(request.headers.get("Idempotency-Key"), 80);
  if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return Response.json({ ok: false, code: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
  }
  const approvalId = await approvalIdFor(commandPlan, requestId);
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
    const existingStatus = compact(queued.task?.status, 30);
    if (queued.replayed && existingStatus !== "QUEUED") {
      const alreadyDone = existingStatus === "DONE";
      return Response.json({
        ok: alreadyDone, code: alreadyDone ? "COMMAND_ALREADY_DONE" : "COMMAND_PREVIOUS_ATTEMPT_" + existingStatus,
        task: queued.task, idempotent_replay: true,
        execution: { status: existingStatus, consumer_proven: false },
        command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
      }, { status: alreadyDone ? 200 : 409, headers: { "Cache-Control": "no-store" } });
    }
    if (queued.replayed) {
      const deferred = await db.prepare(
        "SELECT id FROM agent_events WHERE task_id = ? AND event_type = 'COMMAND_DISPATCH_DEFERRED' LIMIT 1",
      ).bind(taskId).first<{ id: string }>();
      if (deferred) {
        return Response.json({
          ok: true, code: "COMMAND_MANUAL_DISPATCH_REQUIRED",
          task: queued.task, idempotent_replay: true,
          dispatch: manualDispatchDetails(taskId, "PREVIOUS_DISPATCH_DEFERRED"),
          execution: { status: "AWAITING_DISPATCH", consumer_proven: false },
          command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
        }, { status: 202, headers: { "Cache-Control": "no-store" } });
      }
    }
    if (!queued.replayed) {
      const dispatched = await dispatchWaveCommandConsumer(env, taskId);
      if (!dispatched.ok) {
        await noteDeferredDispatch(db, taskId, dispatched.code);
        return Response.json({
          ok: true, code: "COMMAND_MANUAL_DISPATCH_REQUIRED",
          task: { ...queued.task, status: "QUEUED" },
          approval: { required: false, authority: "SIGNED_OWNER_SESSION", approval_id: approvalId },
          dispatch: manualDispatchDetails(taskId, dispatched.code),
          execution: { status: "AWAITING_DISPATCH", consumer_proven: false, route: "YELLOW_STONE_CODEX_SELFHOST" },
          command_plan: commandPlan, command_policy: commandPolicy, command_handoff: handoffMetadata(athena),
        }, { status: 202, headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({
      ok: true, code: queued.replayed ? "COMMAND_ALREADY_QUEUED" : "COMMAND_DISPATCHED",
      task: queued.task, idempotent_replay: queued.replayed,
      approval: { required: false, authority: "SIGNED_OWNER_SESSION", approval_id: approvalId },
      execution: {
        status: queued.replayed ? existingStatus : "DISPATCHED",
        consumer_proven: false,
        route: "YELLOW_STONE_CODEX_SELFHOST",
        note: "Completion requires COMMAND_RESULT event; QUEUED and DISPATCHED are not DONE.",
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
  // Unsupported non-READ adapters must remain unavailable, never queued as fake work.
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
    if (pathname.startsWith("/api/discord/")) {
      return discordApi.fetch(request, env as never, ctx as never);
    }
    if (pathname === "/api/capabilities/resolve") {
      return resolverApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/capabilities/execute") {
      return executionApi.fetch(request, env, ctx as never);
    }
    // Owner-only read of the existing OGE-128 certificate in staging D1.
    if (pathname === "/api/system/certificate-lincenc") {
      if (request.method !== "GET") return Response.json({ ok:false, code:"METHOD_NOT_ALLOWED" }, { status:405, headers:{ "Cache-Control":"no-store" } });
      if (!(await hasOwnerSession(request, env))) return Response.json({ ok:false, code:"REAUTH_REQUIRED" }, { status:401, headers:{ "Cache-Control":"no-store" } });
      const result = await readCertificateLincenc(env.DB);
      return Response.json(result, { status:result.ok ? 200 : result.http_status, headers:{ "Cache-Control":"private, no-store" } });
    }
    if (pathname === "/api/wave/command/status") {
      return commandConsumerStatus(request, env);
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
      if (pathname === "/api/connector-endpoint/v1/manifest" && request.method === "GET") {
        return Response.json(connectorManifest, { headers: { "Cache-Control": "no-store" } });
      }
      if (pathname === "/api/connector-endpoint/v1/probe" && request.method === "GET") {
        const url = new URL(request.url);
        const mode = normalizeConnectorMode(url.searchParams.get("mode"));
        if (!mode) return Response.json({ ok: false, code: "TRANSPORT_UNKNOWN" }, { status: 400, headers: { "Cache-Control": "no-store" } });
        if (mode === "mcp") {
          const provider = url.searchParams.get("provider") ?? "";
          if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(provider) || provider === "simulated") {
            return Response.json({ ok: false, code: "REAL_REGISTERED_MCP_PROVIDER_REQUIRED" },
              { status: 422, headers: { "Cache-Control": "no-store" } });
          }
          const target = new URL(request.url);
          target.pathname = "/api/mcp-config/discover";
          target.search = new URLSearchParams({ provider }).toString();
          // Existing auth-bound MCP initialize/tools/list; it never invokes tools/call.
          return mcpConfigApi.fetch(new Request(target.toString(), request), env as never, ctx as never);
        }
        if (mode === "n8n") {
          // Existing n8n API health check; no workflow is started.
          const result = await inspectN8n(env as never);
          return Response.json({
            ok: result.state === "LIVE",
            mode, runtime_probe: true, execution_tested: false,
            state: result.state, route_mode: result.route_mode,
            http_health_status: result.last_error ?? null,
          }, { status: result.state === "LIVE" ? 200 : 503,
               headers: { "Cache-Control": "no-store" } });
        }
        return Response.json({ ok: false, code: "NO_SAFE_RUNTIME_PROBE",
          mode, runtime_execution_verified: false,
          note: "Use mode-specific existing adapter or Runner-1 staged workflow; no arbitrary command execution." },
          { status: 422, headers: { "Cache-Control": "no-store" } });
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
        return Response.json({
          ...connectorManifest,
          registry: { ok: state.ok === true, bindings: metadata, count: metadata.length },
          modes: connectorModes.map(item => ({
            id: item.id, kind: item.kind, integration: item.integration,
            execution_route: item.execution_route, runtime_e2e_proven: false,
            adapter_verification_required: true,
          })),
          source_modes_count: connectorModes.length,
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
    if (pathname.startsWith("/api/connector-modes/")) {
      return connectorModesApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/local-agent-team/")) {
      return localAgentTeamApi.fetch(request, env as never, ctx as never);
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
