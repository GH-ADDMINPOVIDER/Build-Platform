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
import Landing from "./Landing";
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
import "./wave-chat-v3.css";
import "./mobile-fixes.css";
import "./landing.css";

const nativeApp = Capacitor.isNativePlatform();
const WAVE_ORIGIN = "https://wave.ogenicchocolate.com";
const NATIVE_API_BASE = WAVE_ORIGIN;
const NATIVE_SESSION_KEY = "ogenic.native.session.v1";

function enforceCanonicalWaveHost() {
  if (nativeApp) return;
  if (window.location.hostname !== "candybaked.ogenicchocolate.com") return;
  const target = new URL(`${window.location.pathname}${window.location.search}${window.location.hash}`, WAVE_ORIGIN);
  window.location.replace(target.toString());
}

enforceCanonicalWaveHost();

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
const landingRoute = !nativeApp && pathname === "/";
const appRoute = explicitAppRoute || (!webChatRoute && !controlRoute && (params.get("mobile") === "1" || shortcutApp));
const unifiedChatSurface = !controlRoute && !landingRoute && (nativeApp || appRoute || webChatRoute);
const sourceSurface = webChatRoute ? "ogenic-web" as const : "ogenic-app" as const;

document.title = landingRoute
  ? "WAVE — SAME MIND"
  : controlRoute
    ? "WAVE — DASHBOARD"
    : surfaceTitle(sourceSurface);

function surfaceTitle(surface: "ogenic-web" | "ogenic-app") {
  return surface === "ogenic-web" ? "WAVE — SAME MIND" : "WAVE — SAME MIND · APP";
}

function SurfaceBridge() {
  if (landingRoute || nativeApp) return null;
  const href = controlRoute ? "/chat" : "/overview";
  const label = controlRoute ? "WAVE CHAT ↗" : "DASHBOARD ↗";
  return <a
    href={href}
    aria-label={controlRoute ? "Open WAVE Chat" : "Open WAVE Dashboard"}
    style={{
      position: "fixed",
      top: "calc(env(safe-area-inset-top) + 10px)",
      right: "12px",
      zIndex: 10000,
      display: "inline-flex",
      alignItems: "center",
      minHeight: "38px",
      padding: "0 14px",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(7,12,10,.88)",
      color: "#fff",
      textDecoration: "none",
      fontSize: "12px",
      fontWeight: 800,
      letterSpacing: ".08em",
      boxShadow: "0 8px 28px rgba(0,0,0,.24)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    }}
  >{label}</a>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SurfaceBridge />
    {landingRoute ? <Landing /> : unifiedChatSurface ? <UnifiedChat surface={sourceSurface} /> : <>
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
