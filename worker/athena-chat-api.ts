import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";
import { buildBlueDiamondRegistry } from "./blue-diamond-registry";
import { readCanonicalD1Context, recordChatUsage } from "./d1-context";
import { readIncentiveSnapshot } from "./provider-incentives";
import {
  executeVerifiedTool,
  verifiedFunctionTools,
  type VerifiedToolBindings,
} from "./verified-function-tools";

export type AthenaChatBindings = AuthBindings & VerifiedToolBindings & Record<string, unknown> & {
  OPENAI_API_KEY?: string;
  OGENIC_GITHUB_BRANCH?: string;
};

type Env = { Bindings: AthenaChatBindings };
type Body = {
  prompt?: unknown;
  model?: unknown;
  reasoning_effort?: unknown;
  token_boost?: unknown;
  source_surface?: unknown;
  allow_paid_fallback?: unknown;
};
type ChatRow = {
  role?: string;
  content?: string;
  created_at?: number;
  sequence_no?: number | null;
  source_surface?: string | null;
};
type ResponseItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ type?: string; text?: string; refusal?: string }>;
  [key: string]: unknown;
};
type ResponseBody = {
  model?: string;
  output?: ResponseItem[];
  output_text?: string;
  usage?: { total_tokens?: number } | null;
  error?: { code?: string; message?: string } | null;
};

type ToolCallEvidence = {
  name: string;
  state: string;
  call_id: string;
  verified: boolean;
};

const CONVERSATION_ID = "owner-main";
const SESSION_LINE = "1LSS_OWNER_MAIN";
const ATHENA_ACTOR_ID = "athena-command";
const EXECUTION_AUTHORITY = "YELLOW_STONE_ONLY";
const MODELS = new Set(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-4.1-mini", "gpt-6-astra"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const BOOSTS = new Set([1, 10, 20]);
const MAX_TOOL_ROUNDS = 4;

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function outputText(body: ResponseBody) {
  if (typeof body.output_text === "string" && body.output_text.trim()) return clean(body.output_text, 30_000);
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") out.push(part.text);
      if (part.type === "refusal" && typeof part.refusal === "string") out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
}

function canonicalSessionLine(rows: ChatRow[]) {
  const selected: string[] = [];
  let used = 0;
  for (const row of rows) {
    const seq = Number.isFinite(Number(row.sequence_no)) ? `#${Number(row.sequence_no)}` : "#legacy";
    const surface = clean(row.source_surface || "legacy", 40) || "legacy";
    const role = clean(row.role || "unknown", 20).toUpperCase();
    const line = `[${seq}][${surface}] ${role}: ${clean(row.content, 1600)}`;
    const next = line.length + 1;
    if (selected.length >= 12 && used + next > 22_000) break;
    selected.push(line);
    used += next;
  }
  return selected.reverse().join("\n");
}

function poolForModel(model: string) {
  return model === "gpt-5.6-sol" || model === "gpt-6-astra" ? "standard" : "high_volume";
}

function athenaAdmission(env: AthenaChatBindings) {
  const registry = buildBlueDiamondRegistry(env);
  const athena = registry.find((actor) => actor.actor_id === ATHENA_ACTOR_ID);
  if (!athena) return { ok: false as const, code: "ATHENA_NOT_REGISTERED" };
  if (!athena.agent_eligible) return { ok: false as const, code: "ATHENA_NOT_AGENT_EXECUTABLE" };
  if (athena.state === "CONFIGURATION_REQUIRED" || athena.state === "OFFLINE") {
    return { ok: false as const, code: "CONFIGURATION_REQUIRED", actor: athena };
  }
  return { ok: true as const, actor: athena };
}

export function createAthenaChatApi() {
  const api = new Hono<Env>();

  api.post("/api/chat/athena", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);

    const body = await c.req.json<Body>().catch(() => ({} as Body));
    const prompt = clean(body.prompt, 7000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);

    const model = MODELS.has(String(body.model)) ? String(body.model) : "gpt-5.6-sol";
    const effort = EFFORTS.has(String(body.reasoning_effort)) ? String(body.reasoning_effort) : "medium";
    const requestedBoost = Number(body.token_boost ?? 1);
    const boost = BOOSTS.has(requestedBoost) ? requestedBoost : 1;
    const sourceSurface = clean(body.source_surface, 60) || "ogenic-ui";
    const allowPaidFallback = body.allow_paid_fallback === true;

    const admission = athenaAdmission(c.env);
    if (!admission.ok) {
      return c.json({
        ok: false,
        code: admission.code,
        actor_id: ATHENA_ACTOR_ID,
        execution_authority: EXECUTION_AUTHORITY,
      }, 503);
    }

    const incentive = await readIncentiveSnapshot(c.env.DB);
    const poolId = poolForModel(model);
    const pool = incentive.pools.find((row) => row.id === poolId);
    const guarded = pool?.state === "CRITICAL" || pool?.state === "EXHAUSTED";
    if (guarded && !allowPaidFallback) {
      return c.json({
        ok: false,
        code: "INCENTIVE_CAP_GUARD",
        message: `${poolId} pool is ${pool?.state ?? "guarded"}; paid fallback is disabled`,
        incentive_pool: poolId,
        routing_mode: incentive.routing_mode,
        paid_fallback: false,
      }, 429);
    }

    const [historyResult, d1Context] = await Promise.all([
      c.env.DB.prepare(
        `SELECT role, content, created_at, sequence_no, source_surface
         FROM chat_messages
         WHERE conversation_id = ?
         ORDER BY sequence_no DESC, created_at DESC, rowid DESC
         LIMIT 60`,
      ).bind(CONVERSATION_ID).all<ChatRow>(),
      readCanonicalD1Context(c.env.DB, {
        git_sha: c.env.OGENIC_GIT_SHA,
        git_branch: c.env.OGENIC_GITHUB_BRANCH,
        build_uuid: c.env.OGENIC_BUILD_UUID,
        runtime: c.env.OGENIC_RUNTIME,
        phase: c.env.OGENIC_PHASE,
        version: c.env.CF_VERSION_METADATA ?? null,
      }),
    ]);
    const history = canonicalSessionLine(historyResult.results ?? []);

    let input: Array<Record<string, unknown>> = [{
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }];
    const calls: ToolCallEvidence[] = [];
    let final: ResponseBody = {};
    let usageTotal = 0;
    const requestKey = clean(c.req.header("idempotency-key") || `athena_${crypto.randomUUID()}`, 160);
    let loopExhausted = false;

    // Allow four bounded tool-call rounds, then make one tool-free synthesis
    // request so the final tool outputs always become a user-facing answer.
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const canCallTools = round < MAX_TOOL_ROUNDS;
      const requestBody: Record<string, unknown> = {
        model,
        instructions:
          `You are ATHENA inside BLUE DIAMOND, Stone IV of OGENIC / WAVE. Your maturity is COMMANDER_CANDIDATE, not a self-certified commander.\n` +
          `This is the default WAVE conversational command lane. Before every run, treat this request as an ATHENA AGENT_PRE_RUN READ admission.\n` +
          `Exactly seven private function tools are available and they are READ ONLY. Use them whenever the owner asks for current, latest, verified, status, repo, CI, Linear, roadmap, 1LSS, or Yellow Stone facts.\n` +
          `GitHub tool results are authoritative for source/branch/CI evidence. Linear tool results are authoritative for task state. 1LSS is authoritative for conversational continuity. D1 runtime evidence is operational context.\n` +
          `Never claim fresh GitHub or Linear verification unless a verified function call succeeded in this turn. Absence of new D1 evidence does not mean a task is unfinished.\n` +
          `Never request, expose, infer, or echo credentials. Never execute writes from this lane. For WRITE / EXECUTE / DANGEROUS intent, state that Yellow Stone / Human Approval is required; do not pretend the action happened.\n` +
          `Execution authority is ${EXECUTION_AUTHORITY}. Reply in the owner's language and natural tone.\n\n` +
          `CANONICAL 1LSS ${CONVERSATION_ID} / ${SESSION_LINE} (oldest to newest):\n${history || "No prior persisted turns."}\n\n` +
          `CANONICAL D1 + LIVE RUNTIME EVIDENCE:\n${d1Context.text}`,
        input,
        max_output_tokens: Math.min(12_000, 1_800 * boost),
        store: false,
      };
      if (canCallTools) {
        requestBody.tools = verifiedFunctionTools;
        requestBody.tool_choice = "auto";
        requestBody.parallel_tool_calls = true;
        requestBody.max_tool_calls = 6;
      }
      if (model !== "gpt-4.1-mini") requestBody.reasoning = { effort };

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${requestKey}:round:${round}`.slice(0, 220),
        },
        body: JSON.stringify(requestBody),
      });
      final = await response.json().catch(() => ({})) as ResponseBody;
      usageTotal += Number(final.usage?.total_tokens ?? 0);
      if (!response.ok) {
        return c.json({
          ok: false,
          code: final.error?.code ? `OPENAI_${clean(final.error.code, 100).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
          message: clean(final.error?.message ?? "ATHENA model request failed", 300),
          blue_diamond: { actor_id: ATHENA_ACTOR_ID, admitted: true, execution_authority: EXECUTION_AUTHORITY },
        }, 502);
      }

      const functionCalls = (final.output ?? []).filter((item) => item.type === "function_call" && item.name && item.call_id);
      if (!functionCalls.length) break;
      if (!canCallTools) {
        loopExhausted = true;
        break;
      }

      const toolOutputs: Array<Record<string, unknown>> = [];
      for (const call of functionCalls) {
        let args: unknown = {};
        try { args = JSON.parse(call.arguments || "{}") as unknown; } catch { args = null; }
        const result = await executeVerifiedTool(call.name!, args, c.env);
        const verified = result.ok === true && result.verified === true;
        calls.push({
          name: call.name!,
          state: String(result.code ?? (verified ? "OK" : "RESULT")),
          call_id: call.call_id!,
          verified,
        });
        toolOutputs.push({ type: "function_call_output", call_id: call.call_id!, output: JSON.stringify(result) });
      }
      input = [...input, ...(final.output ?? []).map((item) => item as Record<string, unknown>), ...toolOutputs];
    }

    const text = outputText(final);
    if (!text && loopExhausted) {
      return c.json({
        ok: false,
        code: "ATHENA_TOOL_LOOP_LIMIT",
        function_calls: calls,
        blue_diamond: { actor_id: ATHENA_ACTOR_ID, admitted: true, execution_authority: EXECUTION_AUTHORITY },
      }, 502);
    }
    if (!text) return c.json({ ok: false, code: "ATHENA_EMPTY_OUTPUT" }, 502);

    await recordChatUsage(c.env.DB, {
      conversationId: CONVERSATION_ID,
      sourceSurface,
      model,
      poolId,
      usageTokens: usageTotal,
      route: allowPaidFallback && guarded ? "paid_fallback" : "athena_verified_readonly",
    });

    const verifiedCalls = calls.filter((call) => call.verified);
    return c.json({
      ok: true,
      text,
      model: final.model ?? model,
      function_calls: calls,
      memory: "D1_CANONICAL",
      conversation_id: CONVERSATION_ID,
      session_line: SESSION_LINE,
      blue_diamond: {
        stone: 4,
        identity: "ATHENA",
        actor_id: ATHENA_ACTOR_ID,
        maturity: admission.actor.maturity,
        state: admission.actor.state,
        admitted: true,
        preflight_event: "AGENT_PRE_RUN",
        permission_class: "READ",
        exact_private_tool_count: verifiedFunctionTools.length,
        fresh_verification_claimed: verifiedCalls.length > 0,
        verified_tool_calls: verifiedCalls.map((call) => call.name),
        execution_authority: EXECUTION_AUTHORITY,
        policy: "NO_DIRECT_EXECUTION_BYPASS",
      },
      d1_canonical: d1Context.state,
      incentive_pool: poolId,
      routing_mode: incentive.routing_mode,
      paid_fallback: allowPaidFallback,
      usage_tokens: usageTotal,
      runtime: "BLUE_DIAMOND_ATHENA_VERIFIED_CHAT_V0_1",
      policy: "READ_ONLY_AUTO_TOOLS_SIDE_EFFECTS_REQUIRE_YELLOW_STONE_AND_HUMAN_APPROVAL",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
