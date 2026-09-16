import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";
import { readLiveTools, type LiveToolBindings } from "./live-tools";

export type InlineToolBindings = AuthBindings & LiveToolBindings & {
  OPENAI_API_KEY?: string;
};
type Env = { Bindings: InlineToolBindings };
type Body = {
  tool?: unknown;
  prompt?: unknown;
  model?: unknown;
  reasoning_effort?: unknown;
  snapshot?: unknown;
};
type ResponsesBody = {
  model?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  error?: { code?: string; message?: string } | null;
  usage?: { total_tokens?: number } | null;
};

const TOOLS = new Set(["github", "linear", "n8n"]);
const MODELS = new Set(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-4.1-mini", "gpt-6-astra"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

function clean(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }
function outputText(body: ResponsesBody) {
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") out.push(part.text);
      if (part.type === "refusal" && typeof part.refusal === "string") out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
}

export function createInlineToolsApi() {
  const api = new Hono<Env>();
  const ownerOnly = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    await next();
  };
  api.use("/api/inline/tool", ownerOnly);

  api.post("/api/inline/tool", async (c) => {
    const apiKey = clean(c.env.OPENAI_API_KEY, 4000);
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    const body = await c.req.json<Body>().catch(() => ({} as Body));
    const tool = clean(body.tool, 40).toLowerCase();
    const prompt = clean(body.prompt, 7000);
    if (!TOOLS.has(tool) || !prompt) return c.json({ ok: false, code: "INVALID_REQUEST" }, 400);

    const tools = await readLiveTools(c.env);
    const selected = tools.find((row) => row.id === tool);
    if (!selected || selected.state !== "LIVE") {
      return c.json({ ok: false, code: "TOOL_NOT_LIVE", tool, state: selected?.state ?? "UNKNOWN", message: selected?.summary ?? "Tool unavailable" }, 409);
    }

    const suppliedSnapshot = clean(body.snapshot, 9000);
    const snapshot = suppliedSnapshot || JSON.stringify({
      id: selected.id,
      label: selected.label,
      state: selected.state,
      summary: selected.summary,
      checked_at: selected.checked_at,
      records: selected.records,
    }).slice(0, 9000);
    const requestedModel = clean(body.model, 100);
    const model = MODELS.has(requestedModel) ? requestedModel : "gpt-5.6-sol";
    const requestedEffort = clean(body.reasoning_effort, 30);
    const effort = EFFORTS.has(requestedEffort) ? requestedEffort : "medium";

    const requestBody: Record<string, unknown> = {
      model,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: `You are Ammonite inside OGENIC. Answer the owner's question using ONLY the verified read-only live snapshot below. Do not claim you changed GitHub, Linear, n8n, deployments, issues, files, workflows, or any external system. If the snapshot is insufficient, say exactly what is missing. Reply in the owner's language.\n\nTOOL=${tool}\nVERIFIED SNAPSHOT:\n${snapshot}\n\nOWNER QUESTION:\n${prompt}` }],
      }],
      max_output_tokens: 1800,
      store: false,
    };
    if (model !== "gpt-4.1-mini") requestBody.reasoning = { effort };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": c.req.header("idempotency-key") ?? `inline_${crypto.randomUUID()}` },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({})) as ResponsesBody;
    if (!response.ok) {
      return c.json({
        ok: false,
        code: result.error?.code ? `OPENAI_${clean(result.error.code, 100).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(result.error?.message ?? "Inline tool reasoning failed", 300),
      }, 502);
    }
    const text = outputText(result);
    if (!text) return c.json({ ok: false, code: "OPENAI_EMPTY_OUTPUT" }, 502);
    return c.json({
      ok: true,
      tool,
      state: "LIVE",
      read_only: true,
      text,
      model: result.model ?? model,
      usage_tokens: Number(result.usage?.total_tokens ?? 0),
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
