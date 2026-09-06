import { Hono } from "hono";
import legacyApp from "./index";
import incentiveApi from "./incentive-api";
import {
  createWorkflowEngine,
  type WorkflowBindings,
  type WorkflowDefinition,
  type WorkflowPolicy,
} from "./workflow-engine";
import policyConfig from "../config/workflow-engine.staging.json";
import linearCodexDraftPr from "../workflows/linear-codex-draft-pr.v1.json";
import smokeWorkflow from "../workflows/workflow-engine-smoke.v1.json";

type RootEnv = { Bindings: WorkflowBindings };

const engine = createWorkflowEngine({
  policy: policyConfig as unknown as WorkflowPolicy,
  bundledWorkflows: [
    linearCodexDraftPr as unknown as WorkflowDefinition,
    smokeWorkflow as unknown as WorkflowDefinition,
  ],
  // Do not invent external integrations. Existing Linear/GitHub/agent handlers
  // replace the CONFIGURATION_REQUIRED registry stubs once verified.
  runtimeAdapters: {},
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
