import { Hono } from "hono";
import legacyApp from "./index";
import incentiveApi from "./incentive-api";
import {
  createWorkflowEngine,
  type CredentialResolver,
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
