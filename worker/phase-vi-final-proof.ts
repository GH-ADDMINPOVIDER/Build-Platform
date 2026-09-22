type ProofBindings = {
  OGENIC_OPS_KEY?: string;
};

const PROOF_PATH = "/api/internal/phase-vi-final-f97c3984-df01-4a52-b557-9190798ca0fe";
const PROOF_EXPIRES_AT = Date.parse("2026-09-23T00:00:00.000Z");

class ProofError extends Error {
  step: string;
  status: number;
  constructor(step: string, message: string, status = 500) {
    super(message);
    this.step = step;
    this.status = status;
  }
}

function safeText(value: unknown, max = 400) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").slice(0, max);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 240_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as Record<string, any> : {};
  } catch {
    return { raw: text.slice(0, 400) };
  }
}

async function jsonRequest(
  origin: string,
  path: string,
  init: RequestInit = {},
  step = path,
  timeoutMs = 240_000,
) {
  const response = await fetchWithTimeout(origin + path, init, timeoutMs);
  const body = await readJson(response);
  if (!response.ok) {
    throw new ProofError(
      step,
      `HTTP ${response.status} code=${safeText(body?.code ?? "unknown")} message=${safeText(body?.message ?? body?.raw ?? "")}`,
      502,
    );
  }
  return { response, body };
}

function cookieHeader(response: Response) {
  const raw = response.headers.get("set-cookie") ?? "";
  return raw.split(";")[0];
}

function countMatching(
  messages: any[],
  role: string,
  text: string,
  sourceSurface: string,
  runId?: string,
) {
  return messages.filter((message) =>
    message?.role === role &&
    message?.text === text &&
    message?.source_surface === sourceSurface &&
    (runId === undefined || message?.run_id === runId)
  ).length;
}

export async function maybeRunPhaseViFinalProof(
  request: Request,
  env: ProofBindings,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PROOF_PATH) return null;

  if (request.method !== "POST") {
    return Response.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  }
  if (Date.now() >= PROOF_EXPIRES_AT) {
    return Response.json({ ok: false, code: "PROOF_ROUTE_EXPIRED" }, { status: 410 });
  }

  const key = String(env.OGENIC_OPS_KEY ?? "").trim();
  if (!key) {
    return Response.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_OPS_KEY" }, { status: 503 });
  }

  const origin = url.origin;
  const runRef = `cf-self-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const idem = `phase-vi-final-agent-${runRef}`;
  const marker = `OGENIC_AGENT_FINAL_RUNTIME_OK_${runRef}`;
  const prompt = `Reply exactly: ${marker}`;
  const appMarker = `[RUNTIME PROOF] OGENIC_APP_${runRef}`;
  let step = "start";

  try {
    step = "health";
    const health = (await jsonRequest(origin, "/api/health", {}, step, 30_000)).body;
    if (!(health?.ok === true || health?.status === "ok" || health?.status === "healthy")) {
      throw new ProofError(step, "health assertion failed");
    }

    step = "owner_session_login";
    const login = await jsonRequest(origin, "/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_key: key }),
    }, step, 30_000);
    const cookie = cookieHeader(login.response);
    if (!cookie || login.body?.ok !== true || login.body?.authenticated !== true || login.body?.user?.role !== "owner") {
      throw new ProofError(step, "owner session authentication failed");
    }
    const authHeaders: Record<string, string> = { cookie };

    step = "owner_session_verify";
    const session = (await jsonRequest(origin, "/api/session", { headers: authHeaders }, step, 30_000)).body;
    if (session?.authenticated !== true || session?.user?.role !== "owner") {
      throw new ProofError(step, "owner session verification failed");
    }

    step = "before_status";
    const beforeStatus = (await jsonRequest(origin, "/api/1lss/status", { headers: authHeaders }, step, 30_000)).body;
    const beforeSeq = Number(beforeStatus?.latest_sequence ?? 0);

    step = "before_dashboard";
    const beforeDash = (await jsonRequest(origin, "/api/dashboard", { headers: authHeaders }, step, 30_000)).body;
    const standardBefore = Number(
      (Array.isArray(beforeDash?.incentives?.pools) ? beforeDash.incentives.pools : [])
        .find((pool: any) => pool?.id === "standard")?.used ?? 0,
    );

    const payload = {
      prompt,
      model: "gpt-5.6-sol",
      source_surface: "ogenic-web",
      reasoning_effort: "low",
      allow_paid_fallback: false,
    };

    const callAgent = async (label: string) => {
      step = label;
      const result = await jsonRequest(origin, "/api/chat/agent", {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify(payload),
      }, label, 240_000);
      return result.body;
    };

    const agentOne = await callAgent("agent_first");
    if (
      agentOne?.ok !== true ||
      agentOne?.runtime !== "OPENAI_AGENT_SESSION" ||
      agentOne?.agent_terminal !== "completed" ||
      typeof agentOne?.agent_session_id !== "string" ||
      agentOne.agent_session_id.length <= 5 ||
      agentOne?.conversation_id !== "owner-main" ||
      agentOne?.session_line !== "1LSS_OWNER_MAIN" ||
      agentOne?.text !== marker
    ) {
      throw new ProofError("agent_first_assertion", "agent runtime assertion failed");
    }
    const sessionId = agentOne.agent_session_id;
    const usageTokens = Number(agentOne?.usage_tokens ?? 0);

    step = "after_first_status";
    const afterOne = (await jsonRequest(origin, "/api/1lss/status", { headers: authHeaders }, step, 30_000)).body;
    const afterOneSeq = Number(afterOne?.latest_sequence ?? 0);
    if (afterOneSeq < beforeSeq + 2) {
      throw new ProofError(step, `canonical sequence did not advance by user+assistant: before=${beforeSeq} after=${afterOneSeq}`);
    }

    step = "history_first";
    const historyOne = (await jsonRequest(origin, "/api/chat/history", { headers: authHeaders }, step, 30_000)).body;
    const messagesOne = Array.isArray(historyOne?.messages) ? historyOne.messages : [];
    if (
      historyOne?.conversation_id !== "owner-main" ||
      historyOne?.session_line !== "1LSS_OWNER_MAIN" ||
      countMatching(messagesOne, "assistant", marker, "ogenic-web", sessionId) !== 1 ||
      countMatching(messagesOne, "user", prompt, "ogenic-web", sessionId) !== 1
    ) {
      throw new ProofError(step, "canonical persistence assertion failed");
    }

    const agentTwo = await callAgent("agent_replay");
    if (agentTwo?.ok !== true || agentTwo?.runtime !== "OPENAI_AGENT_SESSION") {
      throw new ProofError("agent_replay_assertion", "idempotent replay runtime assertion failed");
    }

    step = "after_replay_status";
    const afterTwo = (await jsonRequest(origin, "/api/1lss/status", { headers: authHeaders }, step, 30_000)).body;
    const afterTwoSeq = Number(afterTwo?.latest_sequence ?? 0);
    if (afterTwoSeq !== afterOneSeq) {
      throw new ProofError(step, `idempotency replay advanced canonical sequence: first=${afterOneSeq} replay=${afterTwoSeq}`);
    }

    step = "history_replay";
    const historyTwo = (await jsonRequest(origin, "/api/chat/history", { headers: authHeaders }, step, 30_000)).body;
    const messagesTwo = Array.isArray(historyTwo?.messages) ? historyTwo.messages : [];
    if (
      countMatching(messagesTwo, "assistant", marker, "ogenic-web") !== 1 ||
      countMatching(messagesTwo, "user", prompt, "ogenic-web") !== 1
    ) {
      throw new ProofError(step, "idempotency replay duplication detected");
    }

    step = "ogenic_app_event";
    const appResult = (await jsonRequest(origin, "/api/1lss/event", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        "Idempotency-Key": `phase-vi-final-app-${runRef}`,
      },
      body: JSON.stringify({
        source_surface: "ogenic-app",
        events: [{ role: "system", content: appMarker, model: null }],
      }),
    }, step, 30_000)).body;
    if (
      appResult?.ok !== true ||
      appResult?.conversation_id !== "owner-main" ||
      appResult?.session_line !== "1LSS_OWNER_MAIN"
    ) {
      throw new ProofError(step, "ogenic-app event assertion failed");
    }

    step = "post_app_status";
    const postApp = (await jsonRequest(origin, "/api/1lss/status", { headers: authHeaders }, step, 30_000)).body;
    const latestSeq = Number(postApp?.latest_sequence ?? 0);

    for (const surface of ["ogenic-web", "ogenic-app"]) {
      step = `register_${surface}`;
      const routePath = surface === "ogenic-app" ? "/app" : "/chat";
      const registered = (await jsonRequest(origin, "/api/1lss/sessions", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          source_surface: surface,
          session_ref: `automated-final-proof-${surface}-${runRef}`,
          session_url: origin + routePath,
          label: "Automated final runtime proof",
          sequence_no: latestSeq,
        }),
      }, step, 30_000)).body;
      if (registered?.ok !== true) throw new ProofError(step, "session registration failed");
    }

    step = "final_status";
    const finalStatus = (await jsonRequest(origin, "/api/1lss/status", { headers: authHeaders }, step, 30_000)).body;
    const surfaces = Array.isArray(finalStatus?.surfaces) ? finalStatus.surfaces : [];
    for (const surface of ["ogenic-web", "ogenic-app"]) {
      const row = surfaces.find((item: any) => item?.source_surface === surface);
      if (!(row?.fresh === true && row?.persisted === true && row?.caught_up_to_pair_latest === true)) {
        throw new ProofError(step, `${surface} freshness assertion failed`);
      }
    }
    if (!(finalStatus?.ok === true && finalStatus?.cross_surface_ready === true)) {
      throw new ProofError(step, "cross_surface_ready assertion failed");
    }

    step = "chat_app_routes";
    const [chatResponse, appResponse] = await Promise.all([
      fetchWithTimeout(origin + "/chat", { headers: authHeaders }, 30_000),
      fetchWithTimeout(origin + "/app", { headers: authHeaders }, 30_000),
    ]);
    if (!chatResponse.ok || !appResponse.ok) {
      throw new ProofError(step, `route status chat=${chatResponse.status} app=${appResponse.status}`);
    }

    step = "after_dashboard";
    const afterDash = (await jsonRequest(origin, "/api/dashboard", { headers: authHeaders }, step, 30_000)).body;
    const standard = (Array.isArray(afterDash?.incentives?.pools) ? afterDash.incentives.pools : [])
      .find((pool: any) => pool?.id === "standard");
    const standardAfter = Number(standard?.used ?? 0);
    if (standardAfter < standardBefore) {
      throw new ProofError(step, "usage meter decreased unexpectedly");
    }

    return Response.json({
      ok: true,
      result: "PASS",
      proof_runtime: "CLOUDFLARE_SELF_PROOF",
      runtime: agentOne.runtime,
      agent_session_id: sessionId,
      agent_session_id_present: true,
      agent_usage_tokens: usageTokens,
      conversation_id: "owner-main",
      session_line: "1LSS_OWNER_MAIN",
      run_id_matches_agent_session_id: true,
      source_surface_preserved: true,
      canonical_agent_persistence: "PASS",
      idempotency_replay: "PASS",
      latest_sequence: latestSeq,
      cross_surface_ready: true,
      ogenic_web_fresh: true,
      ogenic_app_fresh: true,
      chat_reachable: true,
      app_reachable: true,
      standard_usage_before: standardBefore,
      standard_usage_after: standardAfter,
      usage_telemetry: standard?.telemetry ?? "unknown",
      route_expires_at: new Date(PROOF_EXPIRES_AT).toISOString(),
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const proofError = error instanceof ProofError
      ? error
      : new ProofError(step, error instanceof Error ? error.message : String(error));
    return Response.json({
      ok: false,
      result: "FAIL",
      step: proofError.step,
      message: safeText(proofError.message, 500),
    }, {
      status: proofError.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
