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

type ChatSurface = "ogenic-web" | "chatgpt-dev" | "external-harness";

async function canonicalChatModelRequest(request: Request, sourceSurface?: ChatSurface) {
  const url = new URL(request.url);
  url.pathname = "/api/chat/model";

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (sourceSurface && raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed.source_surface) parsed.source_surface = sourceSurface;
        body = JSON.stringify(parsed);
      } catch {
        body = raw;
      }
    } else {
      body = raw || undefined;
    }
  }

  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body,
    redirect: request.redirect,
  });
}

export default {
  async fetch(request: Request, env: Bindings, ctx: unknown) {
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
    if (pathname === "/api/chat/history") {
      return chatModelApi.fetch(request, env, ctx as never);
    }
    if (
      pathname === "/api/chat/model" ||
      pathname === "/api/chat" ||
      pathname === "/api/chat/api" ||
      pathname === "/api/1lss/chat"
    ) {
      const sourceSurface: ChatSurface | undefined = pathname === "/api/chat"
        ? "ogenic-web"
        : pathname === "/api/chat/api"
          ? "chatgpt-dev"
          : pathname === "/api/1lss/chat"
            ? "external-harness"
            : undefined;
      const canonicalRequest = pathname === "/api/chat/model"
        ? request
        : await canonicalChatModelRequest(request, sourceSurface);
      return chatModelApi.fetch(canonicalRequest, env, ctx as never);
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