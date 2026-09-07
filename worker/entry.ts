import { Hono } from "hono";
import legacyApp from "./index";
import incentiveApi from "./incentive-api";
import {
  createWorkflowEngine,
  type CredentialResolver,
  type Json,
  type WorkflowBindings,
  type WorkflowDefinition,
  type WorkflowPolicy,
} from "./workflow-engine";
import { createCodexPatchAdapter, createOpenAIGenerateAdapter } from "./openai-runtime";
import policyConfig from "../config/workflow-engine.staging.json";
import linearCodexDraftPr from "../workflows/linear-codex-draft-pr.v1.json";
import openaiChat from "../workflows/openai-chat.v1.json";
import smokeWorkflow from "../workflows/workflow-engine-smoke.v1.json";

type RootEnv = { Bindings: WorkflowBindings };
type OpenAIRuntimeBindings = WorkflowBindings & { OPENAI_API_KEY?: string };

type EngineRunResponse = {
  ok?: boolean;
  run?: { id?: string; status?: string };
  nodes?: Array<{ node_id?: string; output_json?: string | null; error_json?: string | null }>;
  code?: string;
  message?: string;
};

function scopedRuntimeCredentials(env: WorkflowBindings): CredentialResolver {
  const runtime = env as OpenAIRuntimeBindings;
  return {
    resolve: async (request) => {
      if (request.environment !== "staging") throw new Error("POLICY_DENIED:credential environment");
      if (request.provider !== "openai") throw new Error(`CONFIGURATION_REQUIRED:${request.provider} credential resolver is not bound`);
      if (request.operation !== "openai.generate@1" && request.operation !== "codex.patch@1") {
        throw new Error(`POLICY_DENIED:credential operation ${request.operation}`);
      }
      const key = String(runtime.OPENAI_API_KEY ?? "").trim();
      if (!key) throw new Error("CONFIGURATION_REQUIRED:OPENAI_API_KEY");
      return { OPENAI_API_KEY: key };
    },
  };
}

const engine = createWorkflowEngine({
  policy: policyConfig as unknown as WorkflowPolicy,
  bundledWorkflows: [
    linearCodexDraftPr as unknown as WorkflowDefinition,
    openaiChat as unknown as WorkflowDefinition,
    smokeWorkflow as unknown as WorkflowDefinition,
  ],
  runtimeAdapters: {
    "openai.generate@1": (env) => createOpenAIGenerateAdapter(env),
    "codex.patch@1": (env) => createCodexPatchAdapter(env),
  },
  credentialResolver: scopedRuntimeCredentials,
});

const root = new Hono<RootEnv>();

// Thin UI facade over the durable workflow engine. Auth, D1 metering, GM cap guard,
// immutable workflow pinning and runtime credentials all stay inside the existing engine path.
root.post("/api/chat", async (c) => {
  const body = await c.req.json<{ prompt?: unknown; mode?: unknown }>().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const requestedMode = typeof body.mode === "string" ? body.mode.toLowerCase() : "balanced";
  const mode = requestedMode === "fast" || requestedMode === "power" || requestedMode === "balanced" ? requestedMode : "balanced";

  if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
  if (new TextEncoder().encode(prompt).byteLength > 12_000) {
    return c.json({ ok: false, code: "INPUT_TOO_LARGE", message: "chat prompt exceeds staging UI limit" }, 413);
  }

  const authorization = c.req.header("authorization") ?? "";
  const triggerKey = (c.req.header("idempotency-key") ?? `ui_${crypto.randomUUID()}`).slice(0, 240);

  const startResponse = await engine.api.request(
    "/workflows/openai-chat/runs",
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "Idempotency-Key": triggerKey,
      },
      body: JSON.stringify({ input: { prompt, mode } satisfies Json }),
    },
    c.env,
  );
  const started = await startResponse.json().catch(() => ({})) as EngineRunResponse;
  if (!startResponse.ok) {
    return new Response(JSON.stringify(started), {
      status: startResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const runId = started.run?.id;
  if (!runId) return c.json({ ok: false, code: "RUN_START_FAILED" }, 500);

  await engine.tick(c.env, `ui_${runId}`);

  const runResponse = await engine.api.request(
    `/runs/${encodeURIComponent(runId)}`,
    { headers: { Authorization: authorization } },
    c.env,
  );
  const runState = await runResponse.json().catch(() => ({})) as EngineRunResponse;
  if (!runResponse.ok) {
    return new Response(JSON.stringify(runState), {
      status: runResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const node = (runState.nodes ?? []).find((candidate) => candidate.node_id === "respond");
  if (runState.run?.status === "succeeded" && node?.output_json) {
    try {
      const output = JSON.parse(node.output_json) as Record<string, unknown>;
      return c.json({
        ok: true,
        run_id: runId,
        text: typeof output.text === "string" ? output.text : "",
        model: typeof output.model === "string" ? output.model : null,
        mode: typeof output.mode === "string" ? output.mode : mode,
        incentive_pool: typeof output.incentive_pool === "string" ? output.incentive_pool : null,
        fallback_reason: typeof output.fallback_reason === "string" ? output.fallback_reason : null,
      });
    } catch {
      return c.json({ ok: false, code: "INVALID_RUNTIME_OUTPUT", run_id: runId }, 502);
    }
  }

  if (runState.run?.status === "failed" || runState.run?.status === "blocked") {
    return c.json({ ok: false, code: "CHAT_RUN_FAILED", run_id: runId, message: node?.error_json ?? "runtime failed" }, 502);
  }

  return c.json({ ok: false, code: "CHAT_RUN_PENDING", run_id: runId, status: runState.run?.status ?? "queued" }, 202);
});

root.route("/", engine.api);
root.route("/", incentiveApi);
root.route("/", legacyApp);

export default {
  fetch(request: Request, env: WorkflowBindings, ctx: unknown) {
    return root.fetch(request, env, ctx as never);
  },
  scheduled(_controller: unknown, env: WorkflowBindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(engine.tick(env).then(() => undefined));
  },
};
