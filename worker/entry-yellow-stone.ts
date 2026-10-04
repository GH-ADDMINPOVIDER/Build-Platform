import base from "./entry-connectors";
import {
  createCapabilityResolverApi,
  type CapabilityResolverBindings,
} from "./capability-resolver-api";
import { createCapabilityExecutionApi } from "./capability-execution-api";
import { createOpenAISelfHostApi } from "./openai-selfhost-api";
import { createCodexLeftArmApi } from "./codex-left-arm-api";

const resolverApi = createCapabilityResolverApi();
const executionApi = createCapabilityExecutionApi();
const selfHostApi = createOpenAISelfHostApi();
const codexLeftArmApi = createCodexLeftArmApi();

type Bindings = CapabilityResolverBindings & Record<string, unknown>;

export default {
  async fetch(request: Request, env: Bindings, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/capabilities/resolve") {
      return resolverApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/capabilities/execute") {
      return executionApi.fetch(request, env, ctx as never);
    }
    if (pathname.startsWith("/api/openai/selfhost/")) {
      return selfHostApi.fetch(request, env as never, ctx as never);
    }
    if (pathname.startsWith("/api/codex/")) {
      return codexLeftArmApi.fetch(request, env as never, ctx as never);
    }
    return base.fetch(request, env as never, ctx);
  },
  scheduled(controller: unknown, env: Bindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    return base.scheduled(controller, env as never, ctx);
  },
};
