import { Hono, type Context } from "hono";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1RunResult = { success?: boolean; meta?: { changes?: number } };
export type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<D1RunResult>;
};
export type D1Like = {
  prepare: (query: string) => D1Prepared;
  batch?: (statements: D1Prepared[]) => Promise<unknown[]>;
};

export type WorkflowBindings = {
  DB?: D1Like;
  OGENIC_PHASE?: string;
  OGENIC_RUNTIME?: string;
  OGENIC_OPS_KEY?: string;
  OGENIC_GIT_SHA?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

type AppEnv = { Bindings: WorkflowBindings };
type JsonSchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
};
export type WorkflowInput = Json | { $ref: string } | WorkflowInput[] | { [key: string]: WorkflowInput };
export type WorkflowNode = {
  id: string;
  kind: "action" | "agent" | "gate";
  uses: string;
  inputs: WorkflowInput;
  output_schema: JsonSchema;
  timeout_seconds: number;
  retry: { max_attempts: number };
  limits?: { max_input_tokens?: number; max_output_tokens?: number };
  next: string | null | { true: string | null; false: string | null };
};
export type Budgets = {
  max_nodes: number;
  max_agent_calls: number;
  max_input_tokens: number;
  max_output_tokens: number;
  max_elapsed_seconds: number;
};
export type WorkflowDefinition = {
  id: string;
  version: number;
  environment: "staging";
  start: string;
  budgets: Budgets;
  nodes: WorkflowNode[];
};
export type WorkflowPolicy = {
  environment: "staging";
  max_inline_bytes: number;
  lease_seconds: number;
  tick_limit: number;
  server_budgets: Budgets;
  allowed_operations: string[];
  allowed_repositories: string[];
  allowed_linear_projects: string[];
};

export type CredentialResolver = {
  resolve: (request: {
    provider: string;
    environment: "staging";
    operation: string;
    runId: string;
    nodeId: string;
  }) => Promise<Record<string, string>>;
};
export type AdapterContext = {
  runId: string;
  nodeId: string;
  deadline: number;
  idempotencyKey: string;
  fence: number;
  externalJobId?: string;
  signal: AbortSignal;
  credentials: CredentialResolver;
};
export type AdapterResult =
  | { state: "succeeded"; output: Json; usage?: Record<string, number> }
  | { state: "waiting"; external_job_id: string; next_check_at: number; usage?: Record<string, number> }
  | { state: "failed"; error_code: string; retryable: boolean; message?: string; usage?: Record<string, number> }
  | { state: "uncertain"; reconciliation_reference: string; message?: string; usage?: Record<string, number> };
export type Adapter = {
  uses: string;
  kind: "action" | "agent" | "gate";
  sideEffect: "none" | "read" | "write";
  retrySafety: "safe" | "unsafe";
  reconciliationSupport: boolean;
  execute: (input: Json, context: AdapterContext) => Promise<AdapterResult>;
  poll?: (input: Json, context: AdapterContext) => Promise<AdapterResult>;
};
export type RuntimeAdapterFactory = (env: WorkflowBindings) => Adapter | null;
export type EngineOptions = {
  policy: WorkflowPolicy;
  bundledWorkflows: WorkflowDefinition[];
  runtimeAdapters?: Record<string, RuntimeAdapterFactory>;
  credentialResolver?: (env: WorkflowBindings) => CredentialResolver;
  webhookVerifier?: (
    source: string,
    rawBody: string,
    headers: Headers,
    env: WorkflowBindings,
  ) => Promise<{ ok: true; workflowId: string; triggerKey: string; input: Json } | { ok: false; code: string }>;
};

type RunRow = {
  id: string;
  workflow_id: string;
  workflow_version: number;
  trigger_key: string;
  status: "queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled";
  current_node_id: string | null;
  input_json: string;
  usage_json: string;
  next_attempt_at: number | null;
  lease_owner: string | null;
  lease_until: number | null;
  fence: number;
  error_json: string | null;
  created_at: number;
  updated_at: number;
};
type ExecutionRow = {
  run_id: string;
  node_id: string;
  status: "running" | "waiting" | "succeeded" | "failed" | "uncertain";
  attempt_count: number;
  idempotency_key: string;
  external_job_id: string | null;
  output_json: string | null;
  error_json: string | null;
  usage_json: string | null;
  started_at: number | null;
  finished_at: number | null;
};
type VersionRow = { workflow_id: string; version: number; git_sha: string; definition_json: string };

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const SECRET_KEY = /(secret|token|password|authorization|api[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+\/-]+=*|sk-[a-z0-9_-]{8,})/ig;
const now = () => Date.now();
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength;
const str = (v: unknown, max = 512) => String(v ?? "").slice(0, max);
const parse = <T>(text: string | null | undefined, fallback: T): T => {
  try { return text ? JSON.parse(text) as T : fallback; } catch { return fallback; }
};
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function sanitize(v: unknown, depth = 0): Json {
  if (depth > 6) return "[truncated]";
  if (v === null || typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") return v.replace(SECRET_VALUE, "[REDACTED]").slice(0, 2048);
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => sanitize(x, depth + 1));
  if (object(v)) {
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v).slice(0, 50)) out[k] = SECRET_KEY.test(k) ? "[REDACTED]" : sanitize(x, depth + 1);
    return out;
  }
  return str(v);
}

function schemaErrors(s: JsonSchema, v: unknown, p = "$output"): string[] {
  if (!s || Object.keys(s).length === 0) return [];
  const e: string[] = [];
  if (s.type === "null" && v !== null) e.push(`${p}: expected null`);
  if (s.type === "boolean" && typeof v !== "boolean") e.push(`${p}: expected boolean`);
  if (s.type === "string" && typeof v !== "string") e.push(`${p}: expected string`);
  if (s.type === "number" && typeof v !== "number") e.push(`${p}: expected number`);
  if (s.type === "integer" && !Number.isInteger(v)) e.push(`${p}: expected integer`);
  if (s.type === "array") {
    if (!Array.isArray(v)) e.push(`${p}: expected array`);
    else if (s.items) v.forEach((x, i) => e.push(...schemaErrors(s.items!, x, `${p}/${i}`)));
  }
  if (s.type === "object") {
    if (!object(v)) e.push(`${p}: expected object`);
    else {
      for (const k of s.required ?? []) if (!(k in v)) e.push(`${p}/${k}: required`);
      for (const [k, child] of Object.entries(s.properties ?? {})) if (k in v) e.push(...schemaErrors(child, v[k], `${p}/${k}`));
      if (s.additionalProperties === false) {
        const allowed = new Set(Object.keys(s.properties ?? {}));
        for (const k of Object.keys(v)) if (!allowed.has(k)) e.push(`${p}/${k}: additional property`);
      }
    }
  }
  return e;
}

function pointer(root: unknown, ptr: string): unknown {
  if (ptr === "" || ptr === "/") return root;
  if (!ptr.startsWith("/")) throw new Error("INVALID_JSON_POINTER");
  let cur = root;
  for (const raw of ptr.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(cur)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) throw new Error("MISSING_REFERENCE");
      cur = cur[i];
    } else if (object(cur) && key in cur) cur = cur[key];
    else throw new Error("MISSING_REFERENCE");
  }
  return cur;
}
const isRef = (v: unknown): v is { $ref: string } => object(v) && Object.keys(v).length === 1 && typeof v.$ref === "string";

async function resolveInputs(db: D1Like, run: RunRow, input: WorkflowInput): Promise<Json> {
  if (isRef(input)) {
    if (input.$ref.startsWith("run.input#")) return pointer(parse<Json>(run.input_json, null), input.$ref.slice(10)) as Json;
    const m = /^nodes\.([A-Za-z0-9_-]+)\.output#(.*)$/.exec(input.$ref);
    if (!m) throw new Error("INVALID_REFERENCE");
    const row = await db.prepare("SELECT status, output_json FROM node_executions WHERE run_id = ? AND node_id = ?")
      .bind(run.id, m[1]).first<{ status: string; output_json: string | null }>();
    if (!row || row.status !== "succeeded" || row.output_json === null) throw new Error("MISSING_REFERENCE");
    return pointer(JSON.parse(row.output_json), m[2]) as Json;
  }
  if (Array.isArray(input)) {
    const out: Json[] = [];
    for (const child of input) out.push(await resolveInputs(db, run, child));
    return out;
  }
  if (object(input)) {
    const out: Record<string, Json> = {};
    for (const [k, child] of Object.entries(input)) out[k] = await resolveInputs(db, run, child as WorkflowInput);
    return out;
  }
  return input as Json;
}

function refs(v: WorkflowInput, out: string[] = []): string[] {
  if (isRef(v)) out.push(v.$ref);
  else if (Array.isArray(v)) v.forEach((x) => refs(x, out));
  else if (object(v)) Object.values(v).forEach((x) => refs(x as WorkflowInput, out));
  return out;
}

function validateWorkflow(def: WorkflowDefinition, policy: WorkflowPolicy): string[] {
  const e: string[] = [];
  if (def.environment !== "staging" || policy.environment !== "staging") e.push("environment must be staging");
  if (!def.id || !Number.isInteger(def.version) || def.version < 1) e.push("invalid id/version");
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) e.push("nodes required");
  if (def.nodes.length > policy.server_budgets.max_nodes || def.budgets.max_nodes > policy.server_budgets.max_nodes) e.push("node budget exceeded");
  if (def.budgets.max_agent_calls > policy.server_budgets.max_agent_calls) e.push("agent budget exceeded");
  if (def.budgets.max_input_tokens > policy.server_budgets.max_input_tokens) e.push("input token budget exceeded");
  if (def.budgets.max_output_tokens > policy.server_budgets.max_output_tokens) e.push("output token budget exceeded");
  if (def.budgets.max_elapsed_seconds > policy.server_budgets.max_elapsed_seconds) e.push("elapsed budget exceeded");
  const ids = new Set<string>();
  const allowed = new Set(policy.allowed_operations);
  for (const n of def.nodes) {
    if (!n.id || ids.has(n.id)) e.push(`duplicate node:${n.id}`);
    ids.add(n.id);
    if (!allowed.has(n.uses)) e.push(`${n.id}: operation not allowlisted`);
    if (!n.output_schema) e.push(`${n.id}: output_schema required`);
    if (!Number.isFinite(n.timeout_seconds) || n.timeout_seconds <= 0 || n.timeout_seconds > 180) e.push(`${n.id}: timeout invalid`);
    if (!n.retry || !Number.isInteger(n.retry.max_attempts) || n.retry.max_attempts < 1 || n.retry.max_attempts > 3) e.push(`${n.id}: retry invalid`);
    for (const r of refs(n.inputs)) if (!(r.startsWith("run.input#") || /^nodes\.[A-Za-z0-9_-]+\.output#/.test(r))) e.push(`${n.id}: invalid ref`);
  }
  if (!ids.has(def.start)) e.push("start not found");
  for (const n of def.nodes) {
    const targets = typeof n.next === "string" || n.next === null ? [n.next] : [n.next.true, n.next.false];
    if (n.kind === "gate" && (n.next === null || typeof n.next !== "object")) e.push(`${n.id}: gate route required`);
    if (n.kind !== "gate" && n.next !== null && typeof n.next !== "string") e.push(`${n.id}: invalid next`);
    for (const target of targets) if (target !== null && !ids.has(target)) e.push(`${n.id}: next not found:${target}`);
  }
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const walk = (id: string) => {
    if (visiting.has(id)) { e.push(`cycle:${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const n = byId.get(id);
    if (n) {
      const targets = typeof n.next === "string" || n.next === null ? [n.next] : [n.next.true, n.next.false];
      targets.filter(Boolean).forEach((x) => walk(x!));
    }
    visiting.delete(id); visited.add(id);
  };
  if (ids.has(def.start)) walk(def.start);
  if (visited.size !== ids.size) e.push("unreachable nodes");
  return e;
}

function registry(options: EngineOptions, env: WorkflowBindings): Map<string, Adapter> {
  const map = new Map<string, Adapter>();
  const pure = (uses: string, kind: Adapter["kind"], fn: (input: Json) => Json): Adapter => ({
    uses, kind, sideEffect: "none", retrySafety: "safe", reconciliationSupport: true,
    execute: async (input) => ({ state: "succeeded", output: fn(input) }),
  });
  map.set("test.echo@1", pure("test.echo@1", "action", (input) => input));
  map.set("gate.exists@1", pure("gate.exists@1", "gate", (input) => object(input) ? input.value !== undefined && input.value !== null : input !== null));
  map.set("gate.equals@1", pure("gate.equals@1", "gate", (input) => object(input) && JSON.stringify(input.left) === JSON.stringify(input.right)));
  const missing = (uses: string, kind: Adapter["kind"], sideEffect: Adapter["sideEffect"]): Adapter => ({
    uses, kind, sideEffect, retrySafety: sideEffect === "write" ? "unsafe" : "safe", reconciliationSupport: false,
    execute: async () => ({ state: "failed", error_code: "CONFIGURATION_REQUIRED", retryable: false, message: `${uses} runtime handler is not bound` }),
  });
  map.set("linear.repo_context@1", missing("linear.repo_context@1", "action", "read"));
  map.set("codex.patch@1", missing("codex.patch@1", "agent", "write"));
  map.set("claude.analyze@1", missing("claude.analyze@1", "agent", "read"));
  map.set("github.publish_draft_pr@1", missing("github.publish_draft_pr@1", "action", "write"));
  map.set("linear.attach_pr@1", missing("linear.attach_pr@1", "action", "write"));
  for (const [uses, factory] of Object.entries(options.runtimeAdapters ?? {})) {
    const a = factory(env); if (a) map.set(uses, a);
  }
  return map;
}

const noCredentials = (): CredentialResolver => ({ resolve: async () => { throw new Error("CONFIGURATION_REQUIRED: runtime Infisical resolver is not bound"); } });
async function secureEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const aa = new Uint8Array(x), bb = new Uint8Array(y); let diff = aa.length ^ bb.length;
  for (let i = 0; i < Math.min(aa.length, bb.length); i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function auth(c: Context<AppEnv>) {
  const configured = String(c.env.OGENIC_OPS_KEY ?? "");
  if (!configured) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_OPS_KEY" }, 503);
  const h = c.req.header("authorization") ?? "";
  const supplied = h.startsWith("Bearer ") ? h.slice(7).trim() : (c.req.header("x-ogenic-ops-key") ?? "").trim();
  if (!supplied || !(await secureEqual(supplied, configured))) return c.json({ ok: false, code: "REAUTH_REQUIRED" }, 401);
  return null;
}
const dbOf = (env: WorkflowBindings) => { if (!env.DB) throw new Error("CONFIGURATION_REQUIRED:D1 binding DB"); return env.DB; };
async function atomic(db: D1Like, statements: D1Prepared[]) {
  if (!db.batch) throw new Error("CONFIGURATION_REQUIRED:D1 batch required for fenced commit");
  await db.batch(statements);
}
function nextId(node: WorkflowNode, output: Json): string | null {
  if (node.kind === "gate") {
    if (typeof output !== "boolean" || node.next === null || typeof node.next !== "object") throw new Error("INVALID_GATE_OUTPUT");
    return output ? node.next.true : node.next.false;
  }
  if (node.next === null || typeof node.next === "string") return node.next;
  throw new Error("INVALID_NEXT");
}
function usage(existing: string, delta?: Record<string, number>) {
  const out = parse<Record<string, number>>(existing, {});
  for (const [k, v] of Object.entries(delta ?? {})) if (Number.isFinite(v)) out[k] = (out[k] ?? 0) + v;
  return JSON.stringify(out);
}

export function createWorkflowEngine(options: EngineOptions) {
  const api = new Hono<AppEnv>();

  async function ensureBundled(db: D1Like, env: WorkflowBindings) {
    const sha = str(env.OGENIC_GIT_SHA || "UNPINNED", 80);
    if (sha === "UNPINNED") throw new Error("CONFIGURATION_REQUIRED:OGENIC_GIT_SHA");
    for (const def of options.bundledWorkflows) {
      const errors = validateWorkflow(def, options.policy);
      if (errors.length) throw new Error(`INVALID_WORKFLOW:${def.id}:${errors.join("|")}`);
      const canonical = JSON.stringify(def);
      const existing = await db.prepare("SELECT workflow_id, version, git_sha, definition_json FROM workflow_versions WHERE workflow_id = ? AND version = ?")
        .bind(def.id, def.version).first<VersionRow>();
      if (existing) {
        if (existing.definition_json !== canonical) throw new Error(`IMMUTABLE_VERSION_CONFLICT:${def.id}@${def.version}`);
        continue;
      }
      await db.prepare("INSERT INTO workflow_versions(workflow_id, version, git_sha, definition_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(def.id, def.version, sha, canonical, now()).run();
    }
  }

  function policyCheck(input: Json) {
    if (!object(input)) return;
    if (typeof input.repository === "string" && options.policy.allowed_repositories.length && !options.policy.allowed_repositories.includes(input.repository)) throw new Error("POLICY_DENIED:repository");
    if (typeof input.linear_project === "string" && options.policy.allowed_linear_projects.length && !options.policy.allowed_linear_projects.includes(input.linear_project)) throw new Error("POLICY_DENIED:linear_project");
  }

  async function startRun(env: WorkflowBindings, workflowId: string, input: Json, triggerKey: string, requestedVersion?: number) {
    const db = dbOf(env); await ensureBundled(db, env);
    if (bytes(input) > options.policy.max_inline_bytes) throw new Error("INPUT_TOO_LARGE");
    policyCheck(input);
    const version = requestedVersion
      ? await db.prepare("SELECT workflow_id, version, git_sha, definition_json FROM workflow_versions WHERE workflow_id = ? AND version = ?").bind(workflowId, requestedVersion).first<VersionRow>()
      : await db.prepare("SELECT workflow_id, version, git_sha, definition_json FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC LIMIT 1").bind(workflowId).first<VersionRow>();
    if (!version) throw new Error("WORKFLOW_NOT_FOUND");
    const def = JSON.parse(version.definition_json) as WorkflowDefinition;
    const key = str(triggerKey, 240); if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const id = `run_${crypto.randomUUID()}`, ts = now();
    const inserted = await db.prepare(`INSERT OR IGNORE INTO runs(id, workflow_id, workflow_version, trigger_key, status, current_node_id, input_json, usage_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, ?, '{}', ?, ?)`).bind(id, workflowId, version.version, key, def.start, JSON.stringify(input), ts, ts).run();
    if ((inserted.meta?.changes ?? 0) === 0) {
      return { run: await db.prepare("SELECT * FROM runs WHERE workflow_id = ? AND trigger_key = ?").bind(workflowId, key).first<RunRow>(), deduplicated: true };
    }
    return { run: await db.prepare("SELECT * FROM runs WHERE id = ?").bind(id).first<RunRow>(), deduplicated: false };
  }

  async function claim(db: D1Like, owner: string): Promise<RunRow | null> {
    const ts = now(), lease = ts + options.policy.lease_seconds * 1000;
    return db.prepare(`UPDATE runs SET status = 'running', lease_owner = ?, lease_until = ?, fence = fence + 1, updated_at = ?
      WHERE id = (SELECT id FROM runs WHERE status IN ('queued','running','waiting')
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_until IS NULL OR lease_until <= ?)
        ORDER BY COALESCE(next_attempt_at, created_at), created_at LIMIT 1)
      AND status IN ('queued','running','waiting') AND (lease_until IS NULL OR lease_until <= ?)
      RETURNING *`).bind(owner, lease, ts, ts, ts, ts).first<RunRow>();
  }

  async function failRun(db: D1Like, run: RunRow, code: string, message?: string) {
    const error = JSON.stringify(sanitize({ code, message }));
    await db.prepare(`UPDATE runs SET status = 'failed', error_json = ?, next_attempt_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND fence = ?`)
      .bind(error, now(), run.id, run.fence).run();
  }

  async function execute(env: WorkflowBindings, run: RunRow) {
    const db = dbOf(env);
    const version = await db.prepare("SELECT definition_json FROM workflow_versions WHERE workflow_id = ? AND version = ?").bind(run.workflow_id, run.workflow_version).first<{ definition_json: string }>();
    if (!version) return failRun(db, run, "PINNED_WORKFLOW_MISSING");
    const def = JSON.parse(version.definition_json) as WorkflowDefinition;
    const node = def.nodes.find((n) => n.id === run.current_node_id);
    if (!node) return failRun(db, run, "INVALID_CURSOR", run.current_node_id ?? "null");
    if ((now() - run.created_at) / 1000 > Math.min(def.budgets.max_elapsed_seconds, options.policy.server_budgets.max_elapsed_seconds)) return failRun(db, run, "BUDGET_EXHAUSTED", "elapsed");

    const previous = await db.prepare("SELECT * FROM node_executions WHERE run_id = ? AND node_id = ?").bind(run.id, node.id).first<ExecutionRow>();
    if (previous?.status === "succeeded") {
      const output = parse<Json>(previous.output_json, null), next = nextId(node, output);
      await db.prepare(`UPDATE runs SET status = ?, current_node_id = ?, next_attempt_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND fence = ?`)
        .bind(next ? "queued" : "succeeded", next, now(), run.id, run.fence).run(); return;
    }

    let input: Json;
    try { input = await resolveInputs(db, run, node.inputs); } catch (e) { return failRun(db, run, "MISSING_REFERENCE", str(e)); }
    if (bytes(input) > options.policy.max_inline_bytes) return failRun(db, run, "INPUT_TOO_LARGE");
    const adapters = registry(options, env), adapter = adapters.get(node.uses);
    if (!adapter || adapter.kind !== node.kind) return failRun(db, run, "OPERATION_UNAVAILABLE", node.uses);
    if (node.kind === "agent") {
      const used = parse<Record<string, number>>(run.usage_json, {});
      if ((used.agent_calls ?? 0) >= Math.min(def.budgets.max_agent_calls, options.policy.server_budgets.max_agent_calls)) return failRun(db, run, "BUDGET_EXHAUSTED", "agent_calls");
    }

    const key = `${run.id}:${node.id}`, started = now();
    await db.prepare(`INSERT INTO node_executions(run_id, node_id, status, attempt_count, idempotency_key, usage_json, started_at)
      VALUES (?, ?, 'running', 1, ?, '{}', ?)
      ON CONFLICT(run_id, node_id) DO UPDATE SET status = CASE WHEN node_executions.status = 'succeeded' THEN 'succeeded' ELSE 'running' END,
      attempt_count = CASE WHEN node_executions.status = 'succeeded' THEN node_executions.attempt_count ELSE node_executions.attempt_count + 1 END
      WHERE node_executions.status != 'succeeded'`).bind(run.id, node.id, key, started).run();
    const current = await db.prepare("SELECT * FROM node_executions WHERE run_id = ? AND node_id = ?").bind(run.id, node.id).first<ExecutionRow>();
    if (!current) return failRun(db, run, "EXECUTION_STATE_MISSING");

    const controller = new AbortController(), timeout = Math.min(node.timeout_seconds, 180) * 1000;
    const timer = setTimeout(() => controller.abort("deadline"), timeout);
    const ctx: AdapterContext = {
      runId: run.id, nodeId: node.id, deadline: started + timeout, idempotencyKey: key, fence: run.fence,
      externalJobId: previous?.external_job_id ?? undefined, signal: controller.signal,
      credentials: options.credentialResolver?.(env) ?? noCredentials(),
    };
    let result: AdapterResult;
    try {
      result = previous?.status === "waiting" && previous.external_job_id && adapter.poll ? await adapter.poll(input, ctx) : await adapter.execute(input, ctx);
    } catch (e) {
      result = { state: "failed", error_code: "ADAPTER_EXCEPTION", retryable: adapter.retrySafety === "safe", message: str(e) };
    } finally { clearTimeout(timer); }

    const live = await db.prepare("SELECT status, fence FROM runs WHERE id = ?").bind(run.id).first<{ status: string; fence: number }>();
    if (!live || live.fence !== run.fence) return;
    if (live.status === "cancelled") return;

    if (result.state === "waiting") {
      await atomic(db, [
        db.prepare(`UPDATE node_executions SET status = 'waiting', external_job_id = ?, usage_json = ? WHERE run_id = ? AND node_id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ? AND fence = ?)`)
          .bind(str(result.external_job_id, 240), JSON.stringify(result.usage ?? {}), run.id, node.id, run.id, run.fence),
        db.prepare(`UPDATE runs SET status = 'waiting', next_attempt_at = ?, lease_owner = NULL, lease_until = NULL, usage_json = ?, updated_at = ? WHERE id = ? AND fence = ?`)
          .bind(Math.max(now() + 1000, result.next_check_at), usage(run.usage_json, result.usage), now(), run.id, run.fence),
      ]); return;
    }
    if (result.state === "uncertain") {
      const error = JSON.stringify(sanitize({ code: "UNCERTAIN_EXTERNAL_EFFECT", reference: result.reconciliation_reference, message: result.message }));
      await atomic(db, [
        db.prepare(`UPDATE node_executions SET status = 'uncertain', error_json = ?, usage_json = ?, finished_at = ? WHERE run_id = ? AND node_id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ? AND fence = ?)`)
          .bind(error, JSON.stringify(result.usage ?? {}), now(), run.id, node.id, run.id, run.fence),
        db.prepare(`UPDATE runs SET status = 'blocked', error_json = ?, next_attempt_at = NULL, lease_owner = NULL, lease_until = NULL, usage_json = ?, updated_at = ? WHERE id = ? AND fence = ?`)
          .bind(error, usage(run.usage_json, result.usage), now(), run.id, run.fence),
      ]); return;
    }
    if (result.state === "failed") {
      const attempts = current.attempt_count, maxAttempts = Math.min(node.retry.max_attempts, 3);
      const canRetry = result.retryable && adapter.retrySafety === "safe" && attempts < maxAttempts;
      const error = JSON.stringify(sanitize({ code: result.error_code, message: result.message }));
      const backoff = Math.min(30_000, 1000 * (2 ** Math.max(0, attempts - 1)));
      await atomic(db, [
        db.prepare(`UPDATE node_executions SET status = 'failed', error_json = ?, usage_json = ?, finished_at = ? WHERE run_id = ? AND node_id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ? AND fence = ?)`)
          .bind(error, JSON.stringify(result.usage ?? {}), now(), run.id, node.id, run.id, run.fence),
        db.prepare(`UPDATE runs SET status = ?, error_json = ?, next_attempt_at = ?, lease_owner = NULL, lease_until = NULL, usage_json = ?, updated_at = ? WHERE id = ? AND fence = ?`)
          .bind(canRetry ? "queued" : "failed", error, canRetry ? now() + backoff : null, usage(run.usage_json, result.usage), now(), run.id, run.fence),
      ]); return;
    }

    const output = sanitize(result.output), validation = schemaErrors(node.output_schema, output);
    if (validation.length || bytes(output) > options.policy.max_inline_bytes) {
      const error = JSON.stringify(sanitize({ code: validation.length ? "INVALID_ADAPTER_OUTPUT" : "OUTPUT_TOO_LARGE", errors: validation.slice(0, 10) }));
      await atomic(db, [
        db.prepare(`UPDATE node_executions SET status = 'failed', error_json = ?, usage_json = ?, finished_at = ? WHERE run_id = ? AND node_id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ? AND fence = ?)`)
          .bind(error, JSON.stringify(result.usage ?? {}), now(), run.id, node.id, run.id, run.fence),
        db.prepare(`UPDATE runs SET status = 'failed', error_json = ?, next_attempt_at = NULL, lease_owner = NULL, lease_until = NULL, usage_json = ?, updated_at = ? WHERE id = ? AND fence = ?`)
          .bind(error, usage(run.usage_json, result.usage), now(), run.id, run.fence),
      ]); return;
    }
    const next = nextId(node, output), delta = { ...(result.usage ?? {}), ...(node.kind === "agent" ? { agent_calls: 1 } : {}) };
    await atomic(db, [
      db.prepare(`UPDATE node_executions SET status = 'succeeded', output_json = ?, error_json = NULL, usage_json = ?, finished_at = ? WHERE run_id = ? AND node_id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ? AND fence = ?)`)
        .bind(JSON.stringify(output), JSON.stringify(delta), now(), run.id, node.id, run.id, run.fence),
      db.prepare(`UPDATE runs SET status = ?, current_node_id = ?, error_json = NULL, next_attempt_at = NULL, lease_owner = NULL, lease_until = NULL, usage_json = ?, updated_at = ? WHERE id = ? AND fence = ?`)
        .bind(next ? "queued" : "succeeded", next, usage(run.usage_json, delta), now(), run.id, run.fence),
    ]);
  }

  async function tick(env: WorkflowBindings, owner = `tick_${crypto.randomUUID()}`) {
    const db = dbOf(env); await ensureBundled(db, env); let advanced = 0;
    for (let i = 0; i < options.policy.tick_limit; i += 1) {
      const run = await claim(db, owner); if (!run) break;
      await execute(env, run); advanced += 1;
    }
    return { advanced };
  }

  api.use("/workflows/*", async (c, next) => { const denied = await auth(c); if (denied) return denied; await next(); });
  api.use("/runs/*", async (c, next) => { const denied = await auth(c); if (denied) return denied; await next(); });

  api.post("/workflows/:id/runs", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const key = str(c.req.header("idempotency-key") ?? body.idempotency_key, 240);
    try {
      const result = await startRun(c.env, c.req.param("id"), (body.input ?? {}) as Json, key, Number.isInteger(body.version) ? Number(body.version) : undefined);
      return c.json({ ok: true, ...result }, result.deduplicated ? 200 : 201);
    } catch (e) {
      const message = str(e), code = message.split(":")[0] || "INVALID_REQUEST";
      const status = code === "WORKFLOW_NOT_FOUND" ? 404 : code === "POLICY_DENIED" ? 403 : code === "CONFIGURATION_REQUIRED" ? 503 : 400;
      return c.json({ ok: false, code, message: sanitize(message) }, status);
    }
  });

  api.get("/runs/:id", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const run = await c.env.DB.prepare("SELECT * FROM runs WHERE id = ?").bind(c.req.param("id")).first<RunRow>();
    if (!run) return c.json({ ok: false, code: "NOT_FOUND" }, 404);
    const nodes = await c.env.DB.prepare(`SELECT run_id, node_id, status, attempt_count, idempotency_key, external_job_id, output_json, error_json, usage_json, started_at, finished_at FROM node_executions WHERE run_id = ? ORDER BY started_at, node_id`)
      .bind(run.id).all<ExecutionRow>();
    return c.json({
      ok: true,
      run: { ...run, input_json: undefined, error_json: run.error_json ? JSON.stringify(sanitize(parse(run.error_json, {}))) : null },
      nodes: (nodes.results ?? []).map((n) => ({ ...n, output_json: n.output_json && new TextEncoder().encode(n.output_json).byteLength <= options.policy.max_inline_bytes ? n.output_json : null, error_json: n.error_json ? JSON.stringify(sanitize(parse(n.error_json, {}))) : null })),
    });
  });

  api.post("/runs/:id/cancel", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const id = c.req.param("id"), row = await c.env.DB.prepare("SELECT status FROM runs WHERE id = ?").bind(id).first<{ status: string }>();
    if (!row) return c.json({ ok: false, code: "NOT_FOUND" }, 404);
    if (TERMINAL.has(row.status)) return c.json({ ok: true, status: row.status, changed: false });
    await c.env.DB.prepare(`UPDATE runs SET status = 'cancelled', next_attempt_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND status NOT IN ('succeeded','failed','cancelled')`).bind(now(), id).run();
    return c.json({ ok: true, status: "cancelled", changed: true });
  });

  api.post("/hooks/:source", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    if (!options.webhookVerifier) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "verified webhook handler" }, 503);
    const verified = await options.webhookVerifier(c.req.param("source"), await c.req.text(), c.req.raw.headers, c.env);
    if (!verified.ok) return c.json({ ok: false, code: verified.code }, verified.code === "REAUTH_REQUIRED" ? 401 : 400);
    try {
      const result = await startRun(c.env, verified.workflowId, verified.input, verified.triggerKey);
      return c.json({ ok: true, ...result }, result.deduplicated ? 200 : 202);
    } catch (e) { return c.json({ ok: false, code: str(e).split(":")[0], message: sanitize(str(e)) }, 400); }
  });

  return { api, tick, ensureBundled, validateWorkflow: (def: WorkflowDefinition) => validateWorkflow(def, options.policy) };
}
