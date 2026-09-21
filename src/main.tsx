import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import ControlPlaneV2 from "./ControlPlaneV2";
import ChatModelRouter from "./ChatModelRouter";
import AppEnhancements from "./AppEnhancements";
import WorkspacePolish from "./WorkspacePolish";
import ConnectorPanel from "./ConnectorPanel";
import ProviderConnectWizard from "./ProviderConnectWizard";
import GagVault from "./GagVault";
import LiveAssist from "./LiveAssist";
import ThemeController from "./ThemeController";
import UnifiedChat from "./UnifiedChat";
import "./control-plane-v2.css";
import "./usage-panel.css";
import "./connector-panel.css";
import "./provider-connect.css";
import "./live-assist.css";
import "./openai-platform-theme.css";
import "./gag-vault.css";
import "./dense-mobile.css";
import "./mobile-app.css";
import "./unified-chat.css";
import "./mobile-fixes.css";

const nativeApp = Capacitor.isNativePlatform();
const NATIVE_API_BASE = "https://ogenic-phase-vi-staging.tawatchaisamornrum11.workers.dev";
const NATIVE_SESSION_KEY = "ogenic.native.session.v1";

function installNativeApiBridge() {
  if (!nativeApp) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requestUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (!requestUrl.startsWith("/api/")) return originalFetch(input, init);

    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set("X-OGENIC-Client", "native");
    const sessionToken = localStorage.getItem(NATIVE_SESSION_KEY);
    if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);

    let body: BodyInit | null | undefined = init.body;
    if (body == null && input instanceof Request && method !== "GET" && method !== "HEAD") {
      body = await input.clone().text();
    }
    let data: unknown = undefined;
    if (typeof body === "string") {
      const contentType = headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try { data = JSON.parse(body); } catch { data = body; }
      } else {
        data = body;
      }
    }

    const nativeHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { nativeHeaders[key] = value; });
    const result = await CapacitorHttp.request({
      url: `${NATIVE_API_BASE}${requestUrl}`,
      method,
      headers: nativeHeaders,
      data,
    });

    if (requestUrl === "/api/session" && method === "POST" && result.status >= 200 && result.status < 300) {
      const token = result.data && typeof result.data === "object" ? String((result.data as Record<string, unknown>).session_token ?? "") : "";
      if (token) localStorage.setItem(NATIVE_SESSION_KEY, token);
    }
    if (requestUrl === "/api/session" && method === "DELETE") localStorage.removeItem(NATIVE_SESSION_KEY);
    if (result.status === 401 && requestUrl !== "/api/session") localStorage.removeItem(NATIVE_SESSION_KEY);

    const responseHeaders = new Headers();
    Object.entries(result.headers ?? {}).forEach(([key, value]) => responseHeaders.set(key, String(value)));
    const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data ?? {});
    return new Response(text, { status: result.status, headers: responseHeaders });
  };
}

installNativeApiBridge();

if (!nativeApp && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
  });
}

const pathname = window.location.pathname;
const params = new URLSearchParams(window.location.search);
const explicitAppRoute = pathname === "/app" || pathname.startsWith("/app/");
const webChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
const controlRoute = pathname === "/overview" || pathname.startsWith("/overview/");
const shortcutApp = !webChatRoute && !controlRoute && params.get("source") === "app";
const mobileViewport = !nativeApp && window.matchMedia?.("(max-width: 900px)").matches === true;
const mobileLanding = pathname === "/" && mobileViewport;
const appRoute = explicitAppRoute || (!webChatRoute && !controlRoute && (params.get("mobile") === "1" || shortcutApp || mobileLanding));
const unifiedChatSurface = !controlRoute && (nativeApp || appRoute || webChatRoute);
const sourceSurface = webChatRoute ? "ogenic-web" as const : "ogenic-app" as const;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {unifiedChatSurface ? <UnifiedChat surface={sourceSurface} /> : <>
      <ControlPlaneV2 />
      <ChatModelRouter />
      <AppEnhancements />
      <WorkspacePolish />
      <ConnectorPanel />
      <ProviderConnectWizard />
      <GagVault />
      <LiveAssist />
      <ThemeController />
    </>}
  </React.StrictMode>,
);
