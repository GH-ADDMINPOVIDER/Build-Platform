import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";
import {
  executeConnectorFunction,
  readConnectorRegistry,
  recentConnectorEvents,
  testConnector,
  type ConnectorBindings,
} from "./connector-runtime";

export type ConnectorAppBindings = AuthBindings & ConnectorBindings & { OPENAI_API_KEY?: string };
type Env = { Bindings: ConnectorAppBindings };

type ResponseItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ type?: string; text?: string; refusal?: string }>;
  [key: string]: unknown;
};
type ResponseBody = {
  id?: string;
  model?: string;
  output?: ResponseItem[];
  output_text?: string;
  usage?: { total_tokens?: number };
  error?: { code?: string; message?: string } | null;
};

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function extractText(body: ResponseBody) {
  if (body.output_text) return clean(body.output_text, 12000);
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) out.push(part.text);
      if (part.type === "refusal" && part.refusal) out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
}

const tools = [
  {
    type: "function",
    name: "connector_status",
    description: "Read current OGENIC connector health/configuration for LINE, Meta, n8n, HTTP hooks, OpenAI webhooks, GitHub and Linear. Read-only.",
    parameters: {
      type: "object",
      properties: { connector: { type: "string", description: "Optional connector id, for example line, meta, n8n, http, openai_hooks." } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_recent_hook_events",
    description: "Read recent verified/rejected webhook audit events from OGENIC D1. Read-only and metadata-redacted.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "http_action",
    description: "Propose an outbound action against a preconfigured OGENIC connector. Staging requires separate Human Approval before side effects execute.",
    parameters: {
      type: "object",
      properties: {
        connector: { type: "string" },
        action: { type: "string" },
        summary: { type: "string" },
      },
      required: ["connector", "action"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "trigger_n8n_workflow",
    description: "Propose running a configured n8n workflow. It must not execute if n8n is quota-blocked or without separate owner approval.",
    parameters: {
      type: "object",
      properties: { workflow_id: { type: "string" }, summary: { type: "string" } },
      required: ["workflow_id"],
      additionalProperties: false,
    },
  },
];

export function createConnectorAppApi() {
  const api = new Hono<Env>();
  const ownerOnly = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    await next();
  };

  api.use("/api/connectors", ownerOnly);
  api.use("/api/connectors/*", ownerOnly);
  api.use("/api/chat/functions", ownerOnly);

  api.get("/api/connectors", async (c) => {
    const connectors = await readConnectorRegistry(c.env);
    return c.json({ ok: true, connectors }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/connectors/events", async (c) => {
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    const limit = Number(c.req.query("limit") ?? 30);
    return c.json({ ok: true, events: await recentConnectorEvents(c.env, limit) }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/connectors/test", async (c) => {
    const body = await c.req.json<{ connector?: unknown }>().catch(() => ({}));
    const connector = clean(body.connector, 60);
    if (!connector) return c.json({ ok: false, code: "INVALID_REQUEST", message: "connector is required" }, 400);
    const result = await testConnector(c.env, connector);
    return c.json({ ok: true, test: result }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/chat/functions", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    const body = await c.req.json<{ prompt?: unknown; model?: unknown }>().catch(() => ({}));
    const prompt = clean(body.prompt, 7000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    const requestedModel = clean(body.model, 80);
    const model = requestedModel === "gpt-6-astra" ? requestedModel : "gpt-5.6-sol";

    let input: Array<Record<string, unknown>> = [{
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }];
    const calls: Array<{ name: string; state: string; call_id: string }> = [];
    let final: ResponseBody = {};

    for (let round = 0; round < 4; round += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": c.req.header("idempotency-key") ?? `fn_${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          instructions: "You are the OGENIC connector supervisor. Use tools to inspect live connector state when relevant. Never claim an external action was executed when a tool returns HUMAN_APPROVAL_REQUIRED. LINE/Meta/n8n credentials remain server-side. Prefer direct connector status facts over guesses. Reply in the user's language.",
          input,
          tools,
          parallel_tool_calls: true,
          max_output_tokens: 1800,
          store: false,
        }),
      });
      final = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok) {
        return c.json({
          ok: false,
          code: final.error?.code ? `OPENAI_${clean(final.error.code, 100).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
          message: clean(final.error?.message ?? "OpenAI function request failed", 300),
        }, 502);
      }

      const functionCalls = (final.output ?? []).filter((item) => item.type === "function_call" && item.name && item.call_id);
      if (!functionCalls.length) break;
      const toolOutputs: Array<Record<string, unknown>> = [];
      for (const call of functionCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.arguments || "{}") as Record<string, unknown>; } catch { args = {}; }
        const result = await executeConnectorFunction(c.env, call.name!, args);
        calls.push({ name: call.name!, state: String((result as any).code ?? ((result as any).ok ? "OK" : "RESULT")), call_id: call.call_id! });
        toolOutputs.push({ type: "function_call_output", call_id: call.call_id!, output: JSON.stringify(result) });
      }
      input = [...input, ...(final.output ?? []).map((item) => item as Record<string, unknown>), ...toolOutputs];
    }

    const text = extractText(final);
    return c.json({
      ok: true,
      text: text || "Function inspection completed.",
      model: final.model ?? model,
      function_calls: calls,
      usage_tokens: Number(final.usage?.total_tokens ?? 0),
      policy: "SIDE_EFFECTS_REQUIRE_SEPARATE_OWNER_APPROVAL",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
