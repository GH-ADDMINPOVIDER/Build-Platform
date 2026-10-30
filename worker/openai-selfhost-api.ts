import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { readCanonicalD1Context, type D1ContextDb } from "./d1-context";
import { SELF_HOST_RUNNER_ID, selfHostMachineMetadata } from "./self-host-machine";

type SelfHostBindings = AuthBindings & {
  DB?: D1ContextDb;
  OPENAI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  OGENIC_GITHUB_REPO?: string;
  OGENIC_GITHUB_BRANCH?: string;
  OPENAI_AGENT_MODEL?: string;
  UNIFIEND_SELFHOST_WORKSPACE?: string;
  OGENIC_GIT_SHA?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_RUNTIME?: string;
  OGENIC_PHASE?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string } | null;
};

type Env = { Bindings: SelfHostBindings };

type AgentEvent = {
  type?: string;
  session_id?: string;
  delta?: string;
  text?: string;
  error?: { code?: string; message?: string } | string | null;
  turn?: {
    subagent_id?: string | null;
    usage?: { total_tokens?: number };
    error?: { code?: string; message?: string } | string | null;
  };
  usage?: { total_tokens?: number };
  item?: {
    type?: string;
    phase?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
};

type AgentSession = {
  id?: string;
  environment?: {
    id?: string;
    type?: string;
    remote_url?: string;
    workspace_directory?: string;
  };
  error?: string | null;
};

type ProofPhase = "full" | "prepare" | "verify";
type ProofRequest = {
  approved?: unknown;
  model?: unknown;
  phase?: unknown;
  agent_session_id?: unknown;
  environment_id?: unknown;
};

const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION_LINE = "1LSS_OWNER_MAIN";
const CANONICAL_STAGING_BRANCH = "Unified-on-Progress";
const DEFAULT_REPOSITORY = "Wave-Runner-2/Build-Platform";
const EXECUTOR_WORKFLOW = "unifiend-openai-selfhost-executor.yml";
const DEFAULT_WORKSPACE = "/opt/wave/actions-runner/_work/Build-Platform/Build-Platform";
const SAFE_RESULT = /^UNIFIEND_SELFHOST_PROOF_OK(?:\s|$)/m;
const SECRET_LIKE = /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|bearer\s+[a-z0-9._~+/=-]{12,}|(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*\S{6,})/i;

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function openAIHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Beta": "agents=v1",
    "Content-Type": "application/json",
  };
}

function normalizePhase(value: unknown): ProofPhase | null {
  const phase = clean(value, 20).toLowerCase() || "full";
  return phase === "full" || phase === "prepare" || phase === "verify" ? phase : null;
}

function proofPrompt() {
  return [
    "Run read-only local commands only:",
    "1. pwd",
    "2. git rev-parse HEAD",
    "3. git branch --show-current",
    "4. codex --version",
    "Do not modify files. Do not access secrets. Do not use network tools.",
    "Return one final line beginning UNIFIEND_SELFHOST_PROOF_OK followed by the four verified values.",
  ].join("\n");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function appendEvidence(db: D1ContextDb, input: {
  sessionId: string;
  environmentId: string;
  resultHash: string;
}) {
  const eventKey = `oge28:${input.sessionId}`;
  const existing = await db.prepare(
    `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
  ).bind(CANONICAL_CONVERSATION, `${eventKey}:0`).all<{ sequence_no: number }>();
  const existingSequence = Number(existing.results?.[0]?.sequence_no ?? 0);
  if (existingSequence > 0) return { sequence: existingSequence, replayed: true };

  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(CANONICAL_CONVERSATION, now, now).run();
  const next = await db.prepare(
    `UPDATE chat_conversations SET last_sequence = last_sequence + 1, updated_at = ?
     WHERE id = ? RETURNING last_sequence`,
  ).bind(now, CANONICAL_CONVERSATION).all<{ last_sequence: number }>();
  const sequence = Number(next.results?.[0]?.last_sequence ?? 0);
  if (!sequence) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");

  const evidence = [
    "OGE-28 VERIFIED SELF-HOST EXECUTION",
    `session=${clean(input.sessionId, 160)}`,
    `environment=${clean(input.environmentId, 160)}`,
    "runner=wave-runner-01",
    `branch=${CANONICAL_STAGING_BRANCH}`,
    `result_sha256=${clean(input.resultHash, 80)}`,
    `session_line=${CANONICAL_SESSION_LINE}`,
  ].join(" | ");
  if (SECRET_LIKE.test(evidence)) throw new Error("SECRET_LIKE_EVIDENCE_REJECTED");

  await db.prepare(
    `INSERT INTO chat_messages(
      id, conversation_id, role, content, model, run_id, created_at,
      sequence_no, source_surface, idempotency_key
    ) VALUES (?, ?, 'system', ?, NULL, ?, ?, ?, 'external-harness', ?)`,
  ).bind(
    `oge28_evt_${crypto.randomUUID()}`,
    CANONICAL_CONVERSATION,
    evidence,
    clean(input.sessionId, 160),
    now,
    sequence,
    `${eventKey}:0`,
  ).run();
  return { sequence, replayed: false };
}

async function dispatchExecutor(env: SelfHostBindings, input: {
  sessionId: string;
  environmentId: string;
  remoteUrl: string;
}) {
  const token = clean(env.GITHUB_TOKEN, 4000);
  if (!token) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN" };
  const repository = clean(env.OGENIC_GITHUB_REPO, 180) || DEFAULT_REPOSITORY;
  const branch = clean(env.OGENIC_GITHUB_BRANCH, 180) || CANONICAL_STAGING_BRANCH;
  if (branch !== CANONICAL_STAGING_BRANCH) {
    return { ok: false as const, code: "ENVIRONMENT_SCOPE_MISMATCH", expected_branch: CANONICAL_STAGING_BRANCH };
  }
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_GITHUB_REPO" };

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${EXECUTOR_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "OGENIC-Unifiend",
      },
      body: JSON.stringify({
        ref: CANONICAL_STAGING_BRANCH,
        inputs: {
          environment_id: input.environmentId,
          remote_url: input.remoteUrl,
          session_id: input.sessionId,
        },
      }),
    },
  );
  if (!response.ok) {
    const message = clean(await response.text().catch(() => ""), 300);
    return { ok: false as const, code: `GITHUB_DISPATCH_HTTP_${response.status}`, message };
  }
  return { ok: true as const };
}

async function readTerminalEventStream(response: Response) {
  if (!response.ok || !response.body) {
    return { terminal: "failed", text: "", usageTokens: 0, error: `EVENT_STREAM_HTTP_${response.status}` };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = "";
  let finalText = "";
  let streamedText = "";
  let fallbackText = "";
  let usageTokens = 0;
  let streamError = "";

  const consume = (event: AgentEvent) => {
    usageTokens = Math.max(
      usageTokens,
      Number(event.usage?.total_tokens ?? 0),
      Number(event.turn?.usage?.total_tokens ?? 0),
    );
    if (event.type === "agent.session.turn.output_text.delta" && typeof event.delta === "string") streamedText += event.delta;
    if (event.type === "agent.session.turn.output_text.done" && typeof event.text === "string") finalText = event.text.trim();
    if (event.type === "agent.session.turn.item.done" && event.item?.type === "message") {
      const text = (event.item.content ?? [])
        .filter((part) => part?.type === "output_text" && typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      if (text) {
        fallbackText = text;
        if (event.item.phase === "final_answer") finalText = text;
      }
    }
    const rootTurn = event.turn?.subagent_id == null;
    if (event.type === "agent.session.turn.completed" && rootTurn) terminal = "completed";
    if (event.type === "agent.session.turn.cancelled" && rootTurn) terminal = "cancelled";
    if ((event.type === "agent.session.turn.failed" && rootTurn)
      || event.type === "agent.session.failed"
      || event.type === "agent.session.environment.failed"
      || event.type === "error") {
      terminal = "failed";
      const failure = event.turn?.error || event.error;
      if (typeof failure === "string") streamError = failure;
      else if (failure && typeof failure === "object") streamError = clean(failure.message || failure.code || "AGENT_SESSION_FAILED", 300);
    }
  };

  const consumeBlock = (block: string) => {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { consume(JSON.parse(payload) as AgentEvent); } catch { /* keepalive/non-json */ }
    }
  };

  while (!terminal) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
    let split = buffer.indexOf("\n\n");
    while (split >= 0) {
      consumeBlock(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf("\n\n");
      if (terminal) break;
    }
  }
  try { await reader.cancel(); } catch { /* no-op */ }
  return {
    terminal: terminal || "unknown",
    text: finalText || streamedText.trim() || fallbackText,
    usageTokens,
    error: streamError,
  };
}

async function createPreparedSession(env: SelfHostBindings, input: {
  apiKey: string;
  model?: string;
  idempotencyKey: string;
  d1Text: string;
}) {
  const model = clean(input.model, 80) || clean(env.OPENAI_AGENT_MODEL, 80) || "gpt-6-astra";
  const workspace = clean(env.UNIFIEND_SELFHOST_WORKSPACE, 300) || DEFAULT_WORKSPACE;
  const response = await fetch("https://api.openai.com/v1/agents/sessions", {
    method: "POST",
    headers: {
      ...openAIHeaders(input.apiKey),
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      agent: {
        model,
        instructions:
          "You are the OGENIC OGE-28 staging execution proof agent. Canonical D1 is context, not permission. " +
          "Do not touch main, production, Candy, D1 schema, credentials, billing, or external systems. " +
          "For this proof, execute only read-only local commands in the supplied self-hosted workspace. " +
          "Return exactly a short final line beginning UNIFIEND_SELFHOST_PROOF_OK followed by pwd, git SHA, branch, and codex version.\n\n" +
          "CANONICAL D1 + LIVE RUNTIME EVIDENCE:\n" + input.d1Text,
        reasoning: { effort: "medium", summary: "concise" },
        multi_agent: { enabled: false },
        service_tier: "auto",
      },
      environment: {
        type: "self_hosted",
        workspace_directory: workspace,
      },
      metadata: {
        project: "ogenic-phase-vi",
        issue: "OGE-28",
        environment: "staging",
        branch: CANONICAL_STAGING_BRANCH,
        conversation: CANONICAL_CONVERSATION,
        session_line: CANONICAL_SESSION_LINE,
      },
      stream: false,
    }),
  });
  const session = await response.json().catch(() => ({})) as AgentSession;
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      code: `OPENAI_AGENT_HTTP_${response.status}`,
      message: clean(session.error || "OpenAI self-hosted session creation failed", 300),
    };
  }
  const sessionId = clean(session.id, 160);
  const environmentId = clean(session.environment?.id, 160);
  const remoteUrl = clean(session.environment?.remote_url, 2000);
  if (!sessionId || !environmentId || !remoteUrl || session.environment?.type !== "self_hosted") {
    return { ok: false as const, status: 502, code: "OPENAI_SELFHOST_METADATA_UNAVAILABLE", sessionId };
  }
  return { ok: true as const, sessionId, environmentId, remoteUrl };
}

async function verifyPreparedSession(env: SelfHostBindings, input: {
  apiKey: string;
  sessionId: string;
  environmentId: string;
  d1State: string;
}) {
  const eventStream = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "OpenAI-Beta": "agents=v1",
      Accept: "text/event-stream",
    },
  });
  if (!eventStream.ok || !eventStream.body) {
    return { ok: false as const, status: 502, code: `OPENAI_EVENT_STREAM_HTTP_${eventStream.status}` };
  }

  const inputResponse = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    method: "POST",
    headers: openAIHeaders(input.apiKey),
    body: JSON.stringify({
      events: [{
        type: "agent.session.input.message",
        input: [{ role: "user", content: [{ type: "input_text", text: proofPrompt() }] }],
      }],
      idempotency_key: `oge28_input_${input.sessionId}`,
    }),
  });
  if (inputResponse.status !== 202 && !inputResponse.ok) {
    try { await eventStream.body.cancel(); } catch { /* no-op */ }
    return { ok: false as const, status: 502, code: `OPENAI_AGENT_INPUT_HTTP_${inputResponse.status}` };
  }

  const result = await readTerminalEventStream(eventStream);
  if (result.terminal !== "completed") {
    return {
      ok: false as const,
      status: 502,
      code: `AGENT_${result.terminal.toUpperCase()}`,
      message: result.error || "Self-hosted Agent session did not complete",
    };
  }
  if (!SAFE_RESULT.test(result.text) || SECRET_LIKE.test(result.text)) {
    return { ok: false as const, status: 502, code: "SELFHOST_PROOF_OUTPUT_UNVERIFIED" };
  }

  if (!env.DB) return { ok: false as const, status: 503, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" };
  const resultHash = await sha256Hex(result.text);
  const evidence = await appendEvidence(env.DB, {
    sessionId: input.sessionId,
    environmentId: input.environmentId,
    resultHash,
  });
  return {
    ok: true as const,
    issue: "OGE-28",
    verification: "verified",
    agent_session_id: input.sessionId,
    environment_id: input.environmentId,
    runner: SELF_HOST_RUNNER_ID,
    machine: selfHostMachineMetadata(),
    branch: CANONICAL_STAGING_BRANCH,
    result_sha256: resultHash,
    evidence_sequence: evidence.sequence,
    evidence_replayed: evidence.replayed,
    d1_canonical: input.d1State,
    conversation_id: CANONICAL_CONVERSATION,
    session_line: CANONICAL_SESSION_LINE,
    usage_tokens: result.usageTokens,
    policy: "STAGING_ONLY · READ_ONLY_PROOF · EVIDENCE_TO_1LSS",
  };
}

export function createOpenAISelfHostApi() {
  const api = new Hono<Env>();

  api.use("/api/openai/selfhost/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/openai/selfhost/readiness", (c) => {
    const branch = clean(c.env.OGENIC_GITHUB_BRANCH, 180) || CANONICAL_STAGING_BRANCH;
    return c.json({
      ok: true,
      branch,
      machine: selfHostMachineMetadata(),
      runner_registration: SELF_HOST_RUNNER_ID,
      openai_app_key: c.env.OPENAI_API_KEY ? "BOUND" : "CONFIGURATION_REQUIRED",
      github_dispatch: c.env.GITHUB_TOKEN ? "BOUND" : "CONFIGURATION_REQUIRED",
      d1: c.env.DB ? "BOUND" : "CONFIGURATION_REQUIRED",
      executor_workflow: EXECUTOR_WORKFLOW,
      executor_environment_key: "EXTERNAL_SECRET_PROBE_REQUIRED",
      external_dispatch_supported: true,
      policy: "OWNER_OR_OPS · STAGING_ONLY · EXPLICIT_APPROVAL · FAIL_CLOSED",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/openai/selfhost/proof", async (c) => {
    const body: ProofRequest = await c.req.json<ProofRequest>().catch((): ProofRequest => ({}));
    if (body.approved !== true) {
      return c.json({
        ok: false,
        code: "HUMAN_APPROVAL_REQUIRED",
        message: "Self-hosted Agent proof creates a metered OpenAI session and dispatches the staging runner.",
      }, 409);
    }

    const phase = normalizePhase(body.phase);
    if (!phase) return c.json({ ok: false, code: "INVALID_PROOF_PHASE" }, 400);

    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);

    const branch = clean(c.env.OGENIC_GITHUB_BRANCH, 180) || CANONICAL_STAGING_BRANCH;
    if (branch !== CANONICAL_STAGING_BRANCH) {
      return c.json({ ok: false, code: "ENVIRONMENT_SCOPE_MISMATCH", expected_branch: CANONICAL_STAGING_BRANCH }, 409);
    }

    const d1Context = await readCanonicalD1Context(c.env.DB, {
      git_sha: c.env.OGENIC_GIT_SHA,
      git_branch: branch,
      build_uuid: c.env.OGENIC_BUILD_UUID,
      runtime: c.env.OGENIC_RUNTIME,
      phase: c.env.OGENIC_PHASE,
      version: c.env.CF_VERSION_METADATA ?? null,
    });

    if (phase === "verify") {
      const sessionId = clean(body.agent_session_id, 160);
      const environmentId = clean(body.environment_id, 160);
      if (!(sessionId.startsWith("sess_") || sessionId.startsWith("agent_")) || !environmentId.startsWith("ccarenv_")) {
        return c.json({ ok: false, code: "INVALID_PREPARED_SESSION_METADATA" }, 400);
      }
      const verified = await verifyPreparedSession(c.env, {
        apiKey,
        sessionId,
        environmentId,
        d1State: d1Context.state,
      });
      if (!verified.ok) {
        return c.json({
          ok: false,
          code: verified.code,
          message: "message" in verified ? verified.message : undefined,
          missing: "missing" in verified ? verified.missing : undefined,
          agent_session_id: sessionId,
          environment_id: environmentId,
        }, verified.status as 400 | 502 | 503);
      }
      return c.json(verified, 200, { "Cache-Control": "no-store" });
    }

    const prepared = await createPreparedSession(c.env, {
      apiKey,
      model: clean(body.model, 80),
      idempotencyKey: c.req.header("idempotency-key") ?? `oge28_session_${crypto.randomUUID()}`,
      d1Text: d1Context.text,
    });
    if (!prepared.ok) {
      return c.json({
        ok: false,
        code: prepared.code,
        message: "message" in prepared ? prepared.message : undefined,
        session_id: "sessionId" in prepared ? prepared.sessionId || null : null,
      }, prepared.status as 502);
    }

    if (phase === "prepare") {
      return c.json({
        ok: true,
        issue: "OGE-28",
        verification: "prepared",
        agent_session_id: prepared.sessionId,
        environment_id: prepared.environmentId,
        remote_url: prepared.remoteUrl,
        branch: CANONICAL_STAGING_BRANCH,
        conversation_id: CANONICAL_CONVERSATION,
        session_line: CANONICAL_SESSION_LINE,
        policy: "STAGING_ONLY · PREPARED_EXTERNAL_DISPATCH · REMOTE_URL_EPHEMERAL",
      }, 200, { "Cache-Control": "no-store" });
    }

    if (!clean(c.env.GITHUB_TOKEN, 4000)) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN" }, 503);
    }
    const dispatched = await dispatchExecutor(c.env, {
      sessionId: prepared.sessionId,
      environmentId: prepared.environmentId,
      remoteUrl: prepared.remoteUrl,
    });
    if (!dispatched.ok) {
      return c.json({
        ...dispatched,
        agent_session_id: prepared.sessionId,
        environment_id: prepared.environmentId,
      }, 503);
    }

    const verified = await verifyPreparedSession(c.env, {
      apiKey,
      sessionId: prepared.sessionId,
      environmentId: prepared.environmentId,
      d1State: d1Context.state,
    });
    if (!verified.ok) {
      return c.json({
        ok: false,
        code: verified.code,
        message: "message" in verified ? verified.message : undefined,
        agent_session_id: prepared.sessionId,
        environment_id: prepared.environmentId,
      }, verified.status as 502 | 503);
    }
    return c.json(verified, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
