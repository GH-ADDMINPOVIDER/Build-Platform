import base from "./entry";
import { createConnectorAppApi, type ConnectorAppBindings } from "./connector-app-api";
import { createPublicHookApi, type ConnectorBindings } from "./connector-runtime";

type Bindings = ConnectorAppBindings & ConnectorBindings;

const connectorApi = createConnectorAppApi();
const publicHooks = createPublicHookApi();

export default {
  fetch(request: Request, env: Bindings, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (
      pathname === "/api/connectors" ||
      pathname.startsWith("/api/connectors/") ||
      pathname === "/api/chat/functions" ||
      pathname.startsWith("/api/openai/")
    ) {
      return connectorApi.fetch(request, env, ctx as never);
    }
    if (pathname.startsWith("/hooks/")) {
      return publicHooks.fetch(request, env, ctx as never);
    }
    return base.fetch(request, env as never, ctx);
  },
  scheduled(controller: unknown, env: Bindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    return base.scheduled(controller, env as never, ctx);
  },
};
