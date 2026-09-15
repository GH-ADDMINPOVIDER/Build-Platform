import base from "./entry";
import { createConnectorAppApi, type ConnectorAppBindings } from "./connector-app-api";
import { createProviderConnectApi } from "./provider-connect-api";
import { createPublicHookApi, type ConnectorBindings } from "./connector-runtime";
import { createLiveAssistApi, type LiveAssistBindings } from "./live-assist-api";
import { createBrowserSessionApi, type BrowserSessionBindings } from "./browser-session-api";
import { createChatModelApi } from "./chat-model-api";
import { createManusApi } from "./manus-api";

type Bindings = ConnectorAppBindings & ConnectorBindings & LiveAssistBindings & BrowserSessionBindings & { MANUS_API_KEY?: string };

const connectorApi = createConnectorAppApi();
const providerConnectApi = createProviderConnectApi();
const liveAssistApi = createLiveAssistApi();
const browserSessionApi = createBrowserSessionApi();
const chatModelApi = createChatModelApi();
const manusApi = createManusApi();
const publicHooks = createPublicHookApi();

export default {
  fetch(request: Request, env: Bindings, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/provider-connect" || pathname.startsWith("/api/provider-connect/")) {
      return providerConnectApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/live-assist") {
      return liveAssistApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/browser-session" || pathname.startsWith("/api/browser-session/")) {
      return browserSessionApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/chat/model") {
      return chatModelApi.fetch(request, env, ctx as never);
    }
    if (pathname === "/api/manus/status" || pathname === "/api/manus/task") {
      return manusApi.fetch(request, env, ctx as never);
    }
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