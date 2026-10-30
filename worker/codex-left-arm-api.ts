import { Hono } from "hono";
import { hasOwnerOrOpsAccess } from "./app-auth";
import { SELF_HOST_RUNNER_ID, selfHostMachineMetadata } from "./self-host-machine";

const CANONICAL_REPOSITORY = "Wave-Runner-2/Build-Platform";
const CANONICAL_BRANCH = "Unified-on-Progress";
const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION = "1LSS_OWNER_MAIN";
const RUNNER_ID = SELF_HOST_RUNNER_ID;

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};
type D1 = { prepare(query: string): D1Statement };

type Bindings = {
  DB?: D1;
  OGENIC_OPS_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_EXECUTOR_API_KEY?: string;
  OPENAI_ENVIRONMENT_KEY?: string;
  GITHUB_TOKEN?: string;
  OGENIC_GITHUB_REPO?: string;
  OGENIC_GITHUB_BRANCH?: string;
};
type Env = { Bindings: Bindings };

type DispatchBody = {
  work_scope?: unknown;
  allowed_paths?: unknown;
  acceptance_criteria?: unknown;
  idempotency_key?: unknown;
  approval_ref?: unknown;
};

type TaskRow = {
  id?: string;
  title?: string;
  capability?: string | null;
  status?: string;
  resource_key?: string | null;
  claimed_by?: string | null;
  correlation_id?: string | null;
  github_repo?: string | null;
  source_ref?: string | null;
  attempt_count?: number;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

const clip = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const secretLike = /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|bearer\s+[a-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*\S{6,})/i;
const sensitivePath = /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$)|[^/]+\.(?:pem|p12|pfx|key)$)/i;

function json(c: any, body: Record<string, unknown>, status = 200) {
  return c.json(body, status, { "Cache-Control": "no-store" });
}

function executorKeyBound(env: Bindings) {
  return Boolean(clip(env.OPENAI_EXECUTOR_API_KEY, 4000) || clip(env.OPENAI_ENVIRONMENT_KEY, 4000));
}

function canonicalScope(env: Bindings) {
  const repository = clip(env.OGENIC_GITHUB_REPO, 200) || CANONICAL_REPOSITORY;
  const branch = clip(env.OGENIC_GITHUB_BRANCH, 200) || CANONICAL_BRANCH;
  return {
    repository,
    branch,
    valid: repository === CANONICAL_REPOSITORY && branch === CANONICAL_BRANCH,
  };
}

function sanitizePath(value: unknown) {
  const path = clip(value, 500).replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\") || sensitivePath.test(path)) return "";
  return path;
}

function normalizePaths(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const paths = value.map(sanitizePath);
  if (paths.some((path) => !path)) return null;
  return [...new Set(paths)].sort();
}

function normalizeDispatch(body: DispatchBody) {
  const workScope = clip(body.work_scope, 240);
  const acceptanceCriteria = clip(body.acceptance_criteria, 2000);
  const idempotencyKey = clip(body.idempotency_key, 160);
  const approvalRef = clip(body.approval_ref, 200);
  const allowedPaths = normalizePaths(body.allowed_paths);
  if (!workScope || !acceptanceCriteria || !idempotencyKey || !allowedPaths) {
    return { ok: false as const, code: "INVALID_REQUEST", message: "work_scope, allowed_paths, acceptance_criteria and idempotency_key are required" };
  }
  if (secretLike.test(workScope) || secretLike.test(acceptanceCriteria) || secretLike.test(idempotencyKey) || secretLike.test(approvalRef)) {
    return { ok: false as const, code: "SECRET_LIKE_INPUT_REJECTED", message: "secret-like material is not allowed in dispatch metadata" };
  }
  return { ok: true as const, workScope, acceptanceCriteria, idempotencyKey, approvalRef, allowedPaths };
}

async function readTask(db: D1, runId: string) {
  return db.prepare(
    `SELECT id,title,capability,status,resource_key,claimed_by,correlation_id,github_repo,source_ref,attempt_count,created_at,updated_at,completed_at
     FROM agent_tasks WHERE id = ? LIMIT 1`,
  ).bind(runId).first<TaskRow>();
}

async function readEvents(db: D1, runId: string) {
  const rows = await db.prepare(
    `SELECT event_type,actor,correlation_id,external_ref,created_at
     FROM agent_events WHERE task_id = ? ORDER BY created_at ASC LIMIT 50`,
  ).bind(runId).all<Record<string, unknown>>();
  return rows.results ?? [];
}

async function readCheckpoint(db: D1, runId: string) {
  return db.prepare(
    `SELECT agent_id,checkpoint_ref,state_hash,updated_at
     FROM agent_checkpoints WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1`,
  ).bind(runId).first<Record<string, unknown>>();
}

export function createCodexLeftArmApi() {
  const api = new Hono<Env>();

  api.get("/api/codex/selfhost/status", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) return json(c, { ok: false, code: "REAUTH_REQUIRED" }, 401);
    const scope = canonicalScope(c.env);
    if (!scope.valid) return json(c, { ok: false, code: "ENVIRONMENT_SCOPE_MISMATCH", expected_repository: CANONICAL_REPOSITORY, expected_branch: CANONICAL_BRANCH }, 503);

    const appKey = Boolean(clip(c.env.OPENAI_API_KEY, 4000));
    const executorBound = executorKeyBound(c.env);
    let activeTasks = 0;
    let activeLocks = 0;
    if (c.env.DB) {
      const taskCount = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM agent_tasks WHERE capability = 'codex_selfhost' AND status IN ('QUEUED','CLAIMED','RUNNING','VERIFYING')`,
      ).first<{ count: number }>();
      const lockCount = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM agent_locks WHERE owner_agent = 'codex-selfhost' AND datetime(expires_at) > datetime('now')`,
      ).first<{ count: number }>();
      activeTasks = Number(taskCount?.count ?? 0);
      activeLocks = Number(lockCount?.count ?? 0);
    }

    return json(c, {
      ok: true,
      contract: "codex_selfhost_status",
      state: appKey && executorBound && c.env.DB ? "READY" : "CONFIGURATION_REQUIRED",
      repository: CANONICAL_REPOSITORY,
      branch: CANONICAL_BRANCH,
      conversation: CANONICAL_CONVERSATION,
      session: CANONICAL_SESSION,
      runner: { id: RUNNER_ID, machine: selfHostMachineMetadata() },
      bindings: {
        d1: c.env.DB ? "BOUND" : "MISSING",
        openai_application: appKey ? "BOUND" : "MISSING",
        openai_executor_environment: executorBound ? "BOUND" : "MISSING",
      },
      active_tasks: activeTasks,
      active_locks: activeLocks,
      policy: "STAGING_ONLY · YELLOW_STONE_APPROVAL_REQUIRED · NO_SECRET_OUTPUT",
    });
  });

  api.post("/api/codex/dispatch", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) return json(c, { ok: false, code: "REAUTH_REQUIRED" }, 401);
    const scope = canonicalScope(c.env);
    if (!scope.valid) return json(c, { ok: false, code: "ENVIRONMENT_SCOPE_MISMATCH", expected_repository: CANONICAL_REPOSITORY, expected_branch: CANONICAL_BRANCH }, 503);
    if (!c.env.DB) return json(c, { ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);

    const body = await c.req.json<DispatchBody>().catch(() => ({}));
    const request = normalizeDispatch(body);
    if (!request.ok) return json(c, request, 400);

    const existing = await c.env.DB.prepare(
      `SELECT id,status FROM agent_tasks WHERE capability = 'codex_selfhost' AND correlation_id = ? LIMIT 1`,
    ).bind(request.idempotencyKey).first<{ id: string; status: string }>();
    if (existing?.id) {
      return json(c, { ok: true, contract: "codex_dispatch", replayed: true, run_id: existing.id, status: existing.status, policy: "IDEMPOTENT_REPLAY" });
    }

    if (!request.approvalRef) {
      return json(c, {
        ok: false,
        code: "HUMAN_APPROVAL_REQUIRED",
        contract: "codex_dispatch",
        approval: { required: true, permission_class: "EXECUTE", route: "YELLOW_STONE_OGE_26" },
        validated: { work_scope: request.workScope, allowed_paths: request.allowedPaths, idempotency_key: request.idempotencyKey },
      }, 409);
    }

    if (!executorKeyBound(c.env)) {
      return json(c, {
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        contract: "codex_dispatch",
        missing: "OPENAI_EXECUTOR_API_KEY",
        validated: { work_scope: request.workScope, allowed_paths: request.allowedPaths, idempotency_key: request.idempotencyKey },
        policy: "DO_NOT_SUBSTITUTE_OPENAI_API_KEY",
      }, 503);
    }

    return json(c, {
      ok: false,
      code: "HUMAN_APPROVAL_REQUIRED",
      contract: "codex_dispatch",
      approval: { required: true, permission_class: "EXECUTE", route: "YELLOW_STONE_OGE_26", approval_ref_received: true, verified: false },
      validated: { work_scope: request.workScope, allowed_paths: request.allowedPaths, idempotency_key: request.idempotencyKey },
      policy: "FAIL_CLOSED_UNTIL_EXACT_APPROVAL_BINDING_IS_VERIFIED",
    }, 409);
  });

  api.get("/api/codex/runs/:runId/status", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) return json(c, { ok: false, code: "REAUTH_REQUIRED" }, 401);
    if (!c.env.DB) return json(c, { ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const runId = clip(c.req.param("runId"), 180);
    if (!/^[-A-Za-z0-9_:.]+$/.test(runId)) return json(c, { ok: false, code: "INVALID_RUN_ID" }, 400);
    const task = await readTask(c.env.DB, runId);
    if (!task) return json(c, { ok: false, code: "RUN_NOT_FOUND", run_id: runId }, 404);
    const events = await readEvents(c.env.DB, runId);
    return json(c, {
      ok: true,
      contract: "codex_run_status",
      run_id: runId,
      status: task.status,
      runner: task.claimed_by ?? null,
      repository: task.github_repo ?? CANONICAL_REPOSITORY,
      branch: CANONICAL_BRANCH,
      work_scope: task.resource_key ?? null,
      attempts: Number(task.attempt_count ?? 0),
      updated_at: task.updated_at ?? null,
      terminal: ["DONE", "BLOCKED", "CONFIGURATION_REQUIRED", "FAILED", "CANCELLED"].includes(String(task.status ?? "")),
      events,
    });
  });

  api.get("/api/codex/runs/:runId/result", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) return json(c, { ok: false, code: "REAUTH_REQUIRED" }, 401);
    if (!c.env.DB) return json(c, { ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const runId = clip(c.req.param("runId"), 180);
    if (!/^[-A-Za-z0-9_:.]+$/.test(runId)) return json(c, { ok: false, code: "INVALID_RUN_ID" }, 400);
    const task = await readTask(c.env.DB, runId);
    if (!task) return json(c, { ok: false, code: "RUN_NOT_FOUND", run_id: runId }, 404);
    const [events, checkpoint, evidence] = await Promise.all([
      readEvents(c.env.DB, runId),
      readCheckpoint(c.env.DB, runId),
      c.env.DB.prepare(
        `SELECT sequence_no,content,created_at FROM chat_messages
         WHERE conversation_id = ? AND run_id = ? ORDER BY sequence_no DESC LIMIT 1`,
      ).bind(CANONICAL_CONVERSATION, runId).first<Record<string, unknown>>(),
    ]);
    const sourceRef = clip(task.source_ref, 500);
    return json(c, {
      ok: true,
      contract: "codex_result",
      run_id: runId,
      status: task.status,
      terminal: ["DONE", "BLOCKED", "CONFIGURATION_REQUIRED", "FAILED", "CANCELLED"].includes(String(task.status ?? "")),
      repository: task.github_repo ?? CANONICAL_REPOSITORY,
      branch: CANONICAL_BRANCH,
      references: { source_ref: sourceRef || null, checkpoint: checkpoint ?? null },
      events,
      evidence: evidence ? { sequence: Number(evidence.sequence_no ?? 0), created_at: evidence.created_at ?? null, summary: clip(evidence.content, 1200) } : null,
      canonical: { conversation: CANONICAL_CONVERSATION, session: CANONICAL_SESSION },
      policy: "SANITIZED_REFERENCES_ONLY · NO_SECRET_OUTPUT",
    });
  });

  return api;
}
