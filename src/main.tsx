import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import UnifiedChat from "./UnifiedChat";
import Landing from "./Landing";
import WaveNext from "./WaveNext";
import WaveThemeToggle from "./WaveThemeToggle";

const LegacyControlSurface = lazy(() => import("./LegacyControlSurface"));
import "./unified-chat.css";
import "./landing.css";
import "./wave-next.css";
import "./wave-route-polish.css";
import "./wave-theme.css";

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
const commandRoute = !nativeApp && (pathname === "/command" || pathname.startsWith("/command/"));
const agentsRoute = !nativeApp && (pathname === "/agents" || pathname.startsWith("/agents/"));
const legacyOverviewRoute = !nativeApp && (pathname === "/overview/legacy" || pathname.startsWith("/overview/legacy/"));
const waveNextRoute = !nativeApp && !legacyOverviewRoute && (
  pathname === "/overview" ||
  pathname === "/overview/next" ||
  pathname.startsWith("/overview/next/")
);
const controlRoute = commandRoute || agentsRoute || pathname === "/overview" || pathname.startsWith("/overview/");
const shortcutApp = !webChatRoute && !controlRoute && params.get("source") === "app";
const landingRoute = !nativeApp && pathname === "/";
const appRoute = explicitAppRoute || (!webChatRoute && !controlRoute && (params.get("mobile") === "1" || shortcutApp));
const unifiedChatSurface = !controlRoute && !landingRoute && (nativeApp || appRoute || webChatRoute);
const sourceSurface = webChatRoute ? "ogenic-web" as const : "ogenic-app" as const;

document.title = landingRoute
  ? "WAVE — WEB"
  : commandRoute
    ? "WAVE — COMMAND"
    : agentsRoute
      ? "WAVE — AGENTS"
      : waveNextRoute
        ? "WAVE — OPERATE"
        : controlRoute
          ? "WAVE — DASHBOARD"
          : surfaceTitle(sourceSurface);

function surfaceTitle(surface: "ogenic-web" | "ogenic-app") {
  return surface === "ogenic-web" ? "WAVE — CHAT" : "WAVE — SAME MIND · APP";
}

function SurfaceBridge() {
  if (landingRoute || nativeApp || waveNextRoute || commandRoute || agentsRoute) return null;
  const links = controlRoute
    ? [["WEB", "/"], ["CHAT", "/chat"], ["COMMAND", "/command"]]
    : [["WEB", "/"], ["COMMAND", "/command"], ["OPERATE", "/overview"]];
  return <nav
    aria-label="WAVE surface navigation"
    style={{
      position: "fixed",
      top: "calc(env(safe-area-inset-top) + 10px)",
      right: "12px",
      zIndex: 10000,
      display: "inline-flex",
      gap: "6px",
      alignItems: "center",
      padding: "5px",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(7,12,10,.88)",
      boxShadow: "0 8px 28px rgba(0,0,0,.24)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    }}
  >
    {links.map(([label, href]) => <a
      key={href}
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: "32px",
        padding: "0 10px",
        borderRadius: "999px",
        color: "#fff",
        textDecoration: "none",
        fontSize: "10px",
        fontWeight: 800,
        letterSpacing: ".08em",
      }}
    >{label}</a>)}
  </nav>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WaveThemeToggle />
    <SurfaceBridge />
    {landingRoute
      ? <Landing />
      : commandRoute
        ? <WaveNext initialTab="run" surface="command" />
        : agentsRoute
          ? <WaveNext initialTab="agent" surface="agents" />
          : waveNextRoute
            ? <WaveNext initialTab="run" surface="operate" />
            : unifiedChatSurface
              ? <UnifiedChat surface={sourceSurface} />
              : <Suspense fallback={<main style={{ minHeight: "100dvh", background: "#050807" }} aria-label="Loading legacy WAVE surface" />}>
                <LegacyControlSurface />
              </Suspense>}
  </React.StrictMode>,
);
