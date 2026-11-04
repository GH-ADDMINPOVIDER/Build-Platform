import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { buildBlueDiamondRegistry, type BlueDiamondRegistryEnv } from "./blue-diamond-registry";
import { planAthenaCommand } from "./athena-command-planner";
import { createVioletStoneApi, buildVioletAgentRegistry, type VioletStoneBindings } from "./violet-stone-api";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  run: () => Promise<{ success?: boolean; meta?: Record<string, unknown> }>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type RubyStoneBindings = AuthBindings & BlueDiamondRegistryEnv & VioletStoneBindings & { DB?: D1 };
type Env = { Bindings: RubyStoneBindings };

type TestState = "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED";
type TestDomain = "continuity" | "admission" | "planning" | "multi_agent" | "routing" | "approval" | "evidence" | "runtime" | "security";
type RubyTest = {
  test_id: string;
  domain: TestDomain;
  state: TestState;
  agent_id: string | null;
  agent: string | null;
  provider: string;
  runtime: string;
  duration_ms: number;
  evidence_ref: string;
  detail: string;
};

type Scorecard = {
  ok: boolean;
  runtime: "RUBY_STONE_TEST_LAYER_V1";
  run_id: string;
  started_at: string;
  finished_at: string;
  tests: RubyTest[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    blocked: number;
    not_measured: number;
    measured_pass_rate: number | null;
  };
  canonical: {
    conversation_id: "owner-main";
    session_line: "1LSS_OWNER_MAIN";
    latest_sequence: number | null;
  };
  policy: {
    blue_admission_required: true;
    yellow_execution_authority: "YELLOW_STONE_ONLY";
    dangerous_tests_approval_gated: true;
    direct_execution_bypass: false;
    schema_change: false;
    secrets_exposed: false;
  };
};

type EvalBody = { record?: unknown };

const CANONICAL_CONVERSATION = "owner-main" as const;
const CANONICAL_SESSION = "1LSS_OWNER_MAIN" as const;
const violetApi = createVioletStoneApi();

function elapsed(start: number) {
  return Number((performance.now() - start).toFixed(2));
}

function safeDetail(value: unknown, max = 320) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

async function internalViolet(env: RubyStoneBindings, path: string, body: Record<string, unknown>) {
  const request = new Request(`https://unifiend.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ogenic-ops-key": String(env.OGENIC_OPS_KEY ?? ""),
    },
    body: JSON.stringify(body),
  });
  const response = await violetApi.fetch(request, env as never, {} as never);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { status: response.status, payload };
}

function test(
  test_id: string,
  domain: TestDomain,
  state: TestState,
  start: number,
  evidence_ref: string,
  detail: string,
  attribution?: { agent_id?: string | null; agent?: string | null; provider?: string; runtime?: string },
): RubyTest {
  return {
    test_id,
    domain,
    state,
    agent_id: attribution?.agent_id ?? null,
    agent: attribution?.agent ?? null,
    provider: attribution?.provider ?? "OGENIC",
    runtime: attribution?.runtime ?? "Cloudflare Worker",
    duration_ms: elapsed(start),
    evidence_ref,
    detail: safeDetail(detail),
  };
}

function score(tests: RubyTest[]) {
  const pass = tests.filter((item) => item.state === "PASS").length;
  const fail = tests.filter((item) => item.state === "FAIL").length;
  const blocked = tests.filter((item) => item.state === "BLOCKED").length;
  const notMeasured = tests.filter((item) => item.state === "NOT_MEASURED").length;
  const measured = pass + fail;
  return {
    total: tests.length,
    pass,
    fail,
    blocked,
    not_measured: notMeasured,
    measured_pass_rate: measured ? Number(((pass / measured) * 100).toFixed(1)) : null,
  };
}

async function canonicalSnapshot(db?: D1) {
  if (!db) return { conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION, latest_sequence: null as number | null };
  const row = await db.prepare("SELECT last_sequence FROM chat_conversations WHERE id = ? LIMIT 1")
    .bind(CANONICAL_CONVERSATION)
    .first<{ last_sequence: number }>();
  const latest = row && Number.isFinite(Number(row.last_sequence)) ? Number(row.last_sequence) : null;
  return { conversation_id: CANONICAL_CONVERSATION, session_line: CANONICAL_SESSION, latest_sequence: latest };
}

function identity(agents: ReturnType<typeof buildVioletAgentRegistry>, id: string) {
  const agent = agents.find((item) => item.agent_id === id);
  return agent ? `${agent.app} • Agent • ${agent.rank}` : null;
}

async function runScorecard(env: RubyStoneBindings): Promise<Scorecard> {
  const startedAt = new Date().toISOString();
  const runId = `ruby_${crypto.randomUUID()}`;
  const tests: RubyTest[] = [];
  const canonical = await canonicalSnapshot(env.DB);
  const agents = buildVioletAgentRegistry(env);

  {
    const start = performance.now();
    tests.push(test(
      "green-canonical-continuity",
      "continuity",
      canonical.latest_sequence !== null ? "PASS" : "BLOCKED",
      start,
      `1lss:${CANONICAL_CONVERSATION}:${canonical.latest_sequence ?? "unavailable"}`,
      canonical.latest_sequence !== null ? `Canonical owner-main sequence ${canonical.latest_sequence} is readable.` : "Canonical owner-main sequence unavailable.",
      { provider: "Cloudflare D1", runtime: "Green Stone / 1LSS" },
    ));
  }

  {
    const start = performance.now();
    const athena = buildBlueDiamondRegistry(env).find((actor) => actor.actor_id === "athena-command");
    const pass = Boolean(athena?.agent_eligible && athena.state !== "OFFLINE" && athena.state !== "CONFIGURATION_REQUIRED");
    tests.push(test(
      "blue-athena-admission",
      "admission",
      pass ? "PASS" : "BLOCKED",
      start,
      `blue:athena:${athena?.state || "missing"}`,
      athena ? `ATHENA state ${athena.state}; agent eligible ${athena.agent_eligible}.` : "ATHENA is not registered.",
      { provider: "OpenAI", runtime: "Blue Diamond / ATHENA" },
    ));
  }

  {
    const start = performance.now();
    const planned = planAthenaCommand("read package.json");
    const pass = planned.status === "READY" && planned.capability === "read_file" && planned.provider === "github" && planned.environment === "staging";
    tests.push(test(
      "athena-deterministic-read-plan",
      "planning",
      pass ? "PASS" : "FAIL",
      start,
      `planner:${planned.planner}:${planned.status}`,
      `status=${planned.status}; capability=${planned.capability || "none"}; provider=${planned.provider || "none"}; environment=${planned.environment}.`,
      { agent_id: "openai-ceo", agent: identity(agents, "openai-ceo"), provider: "OpenAI", runtime: "ATHENA deterministic planner" },
    ));
  }

  {
    const start = performance.now();
    const visible = agents.map((agent) => `${agent.app} • Agent • ${agent.rank}`);
    const required = ["OpenAI • Agent • CEO", "Codex • Agent • CTO", "Manus • Agent • COO"];
    const pass = required.every((name) => visible.includes(name)) && agents.length === 3;
    tests.push(test(
      "violet-real-agent-identity",
      "multi_agent",
      pass ? "PASS" : "FAIL",
      start,
      `violet:registry:${visible.join("|")}`,
      pass ? "Exactly three interactive executive Agent identities are present." : `Unexpected Agent registry: ${visible.join(", ") || "empty"}.`,
      { provider: "OGENIC", runtime: "Violet Stone registry" },
    ));
  }

  {
    const start = performance.now();
    const result = await internalViolet(env, "/api/violet/plan", {
      intent: "read package.json and verify the repository build path",
      mode: "TEAM_3",
      strategy: "parallel",
      permission_class: "READ",
    });
    const graph = Array.isArray(result.payload.graph) ? result.payload.graph as Array<Record<string, unknown>> : [];
    const team = Array.isArray(result.payload.team) ? result.payload.team as Array<Record<string, unknown>> : [];
    const pass = result.status === 200 && result.payload.ok === true && result.payload.direct_execution_bypass === false && graph.some((node) => node.role === "merge_verified_results");
    const state: TestState = result.status === 503 ? "BLOCKED" : pass ? "PASS" : "FAIL";
    tests.push(test(
      "violet-team-formation-graph",
      "multi_agent",
      state,
      start,
      `violet:plan:${safeDetail(result.payload.run_id || result.payload.code || result.status)}`,
      `HTTP ${result.status}; team=${team.length}; graph=${graph.length}; code=${safeDetail(result.payload.code || "OK")}.`,
      { agent_id: "openai-ceo", agent: identity(agents, "openai-ceo"), provider: "OpenAI", runtime: "Violet Stone orchestrator" },
    ));
  }

  for (const agentId of ["codex-cto", "manus-coo"] as const) {
    const start = performance.now();
    const result = await internalViolet(env, "/api/violet/handoff", {
      run_id: runId,
      agent_id: agentId,
      intent: "verify read-only Agent handoff readiness",
      permission_class: "READ",
      execute: false,
    });
    const pass = result.status === 200 && result.payload.ok === true && result.payload.code === "READY_FOR_YELLOW_STONE";
    const state: TestState = result.status === 503 ? "BLOCKED" : pass ? "PASS" : "FAIL";
    const app = agentId === "codex-cto" ? "Codex" : "Manus";
    tests.push(test(
      `violet-${app.toLowerCase()}-read-handoff`,
      "routing",
      state,
      start,
      `violet:handoff:${agentId}:${safeDetail(result.payload.code || result.status)}`,
      `HTTP ${result.status}; code=${safeDetail(result.payload.code || "OK")}.`,
      { agent_id: agentId, agent: identity(agents, agentId), provider: app, runtime: "Violet → Yellow handoff" },
    ));
  }

  {
    const start = performance.now();
    const result = await internalViolet(env, "/api/violet/handoff", {
      run_id: runId,
      agent_id: "openai-ceo",
      intent: "write protected system state",
      permission_class: "WRITE",
      execute: true,
    });
    const handoff = result.payload.handoff as Record<string, unknown> | undefined;
    const pass = result.status === 409 && result.payload.code === "HUMAN_APPROVAL_REQUIRED" && handoff?.direct_execution_bypass === false && handoff?.execution_authority === "YELLOW_STONE_ONLY";
    tests.push(test(
      "yellow-write-approval-gate",
      "approval",
      pass ? "PASS" : "FAIL",
      start,
      `yellow:approval:${safeDetail(result.payload.code || result.status)}`,
      `HTTP ${result.status}; code=${safeDetail(result.payload.code || "none")}; Yellow-only=${handoff?.execution_authority === "YELLOW_STONE_ONLY"}.`,
      { agent_id: "openai-ceo", agent: identity(agents, "openai-ceo"), provider: "OpenAI", runtime: "Yellow Stone approval gate" },
    ));
  }

  {
    const start = performance.now();
    const result = await internalViolet(env, "/api/violet/merge", {
      run_id: runId,
      results: [
        { agent_id: "openai-ceo", status: "completed", summary: "verified primary result", evidence_ref: "evidence:primary", verified: true },
        { agent_id: "codex-cto", status: "completed", summary: "unverified secondary result", evidence_ref: "", verified: false },
      ],
    });
    const pass = result.status === 200 && result.payload.verified_count === 1 && result.payload.unverified_count === 1 && result.payload.status === "running";
    tests.push(test(
      "violet-evidence-merge-integrity",
      "evidence",
      pass ? "PASS" : "FAIL",
      start,
      `violet:merge:${runId}`,
      `verified=${safeDetail(result.payload.verified_count)}; unverified=${safeDetail(result.payload.unverified_count)}; status=${safeDetail(result.payload.status)}.`,
      { provider: "OGENIC", runtime: "Violet evidence merge" },
    ));
  }

  {
    const start = performance.now();
    if (!env.DB) {
      tests.push(test("executor-lane-registry", "runtime", "BLOCKED", start, "d1:agent_lanes:unavailable", "D1 binding unavailable.", { provider: "Cloudflare D1", runtime: "agent_lanes" }));
    } else {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM agent_lanes").first<{ count: number }>();
      const count = Number(row?.count || 0);
      tests.push(test(
        "executor-lane-registry",
        "runtime",
        count > 0 ? "PASS" : "BLOCKED",
        start,
        `d1:agent_lanes:${count}`,
        `${count} executor/runtime lanes registered; lanes remain separate from Agent identity.`,
        { provider: "Cloudflare D1", runtime: "agent_lanes" },
      ));
    }
  }

  {
    const start = performance.now();
    const forbidden = /(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/i;
    const current = JSON.stringify(tests);
    tests.push(test(
      "ruby-output-secret-boundary",
      "security",
      forbidden.test(current) ? "FAIL" : "PASS",
      start,
      `ruby:security:${runId}`,
      forbidden.test(current) ? "Potential secret-shaped material detected in scorecard output." : "No private-key/API-key/bearer-token shaped material detected in scorecard output.",
      { provider: "OGENIC", runtime: "Ruby sanitizer" },
    ));
  }

  const finishedAt = new Date().toISOString();
  const summary = score(tests);
  return {
    ok: summary.fail === 0,
    runtime: "RUBY_STONE_TEST_LAYER_V1",
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    tests,
    summary,
    canonical,
    policy: {
      blue_admission_required: true,
      yellow_execution_authority: "YELLOW_STONE_ONLY",
      dangerous_tests_approval_gated: true,
      direct_execution_bypass: false,
      schema_change: false,
      secrets_exposed: false,
    },
  };
}

async function recordAgentEvaluations(db: D1 | undefined, scorecard: Scorecard) {
  if (!db) return { recorded: 0, code: "D1_UNAVAILABLE" };
  const eligible = scorecard.tests.filter((item) => item.agent_id && (item.state === "PASS" || item.state === "FAIL"));
  let recorded = 0;
  for (const item of eligible) {
    const id = `ruby_event_${crypto.randomUUID()}`;
    const eventType = item.state === "PASS" ? "RUBY_EVAL_PASS" : "RUBY_EVAL_FAIL";
    const result = await db.prepare(
      "INSERT INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref) VALUES (?, NULL, ?, ?, ?, ?)",
    ).bind(id, eventType, item.agent_id, scorecard.run_id, `${item.test_id}|${item.evidence_ref}`).run();
    if (result.success !== false) recorded += 1;
  }
  return { recorded, code: recorded === eligible.length ? "RECORDED" : "PARTIAL", eligible: eligible.length };
}

export function createRubyStoneApi() {
  const api = new Hono<Env>();

  api.use("/api/ruby/*", async (c, next) => {
    if (c.req.path === "/api/ruby/health") return next();
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    await next();
  });

  api.get("/api/ruby/health", (c) => c.json({
    ok: true,
    stone: "RUBY_STONE",
    runtime: "RUBY_STONE_TEST_LAYER_V1",
    domains: ["continuity", "admission", "planning", "multi_agent", "routing", "approval", "evidence", "runtime", "security"],
    accuracy_events: ["RUBY_EVAL_PASS", "RUBY_EVAL_FAIL"],
    dangerous_tests_approval_gated: true,
    yellow_execution_authority: "YELLOW_STONE_ONLY",
    blue_admission_required: true,
    canonical_memory: "GREEN_STONE_1LSS",
    direct_execution_bypass: false,
    schema_change: false,
    secrets_exposed: false,
  }, 200, { "Cache-Control": "no-store" }));

  api.get("/api/ruby/scorecard", async (c) => c.json(await runScorecard(c.env), 200, { "Cache-Control": "no-store" }));

  api.post("/api/ruby/evaluate", async (c) => {
    const body: EvalBody = await c.req.json<EvalBody>().catch(() => ({} as EvalBody));
    const scorecard = await runScorecard(c.env);
    const record = body.record === true;
    const recording = record ? await recordAgentEvaluations(c.env.DB, scorecard) : { recorded: 0, code: "NOT_REQUESTED" };
    return c.json({ ...scorecard, recording }, scorecard.summary.fail ? 409 : 200, { "Cache-Control": "no-store" });
  });

  return api;
}
