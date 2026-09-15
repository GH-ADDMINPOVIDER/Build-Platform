import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import ControlPlaneV2 from "./ControlPlaneV2";
import ChatModelRouter from "./ChatModelRouter";
import AppEnhancements from "./AppEnhancements";
import WorkspacePolish from "./WorkspacePolish";
import ConnectorPanel from "./ConnectorPanel";
import ProviderConnectWizard from "./ProviderConnectWizard";
import GagVault from "./GagVault";
import LiveAssist from "./LiveAssist";
import ThemeController from "./ThemeController";
import MobileApp from "./MobileApp";
import "./control-plane-v2.css";
import "./connector-panel.css";
import "./provider-connect.css";
import "./live-assist.css";
import "./mobile-fixes.css";
import "./openai-platform-theme.css";
import "./gag-vault.css";
import "./dense-mobile.css";
import "./mobile-app.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const pathname = window.location.pathname;
const mobileSurface = Capacitor.isNativePlatform() || pathname === "/app" || pathname.startsWith("/app/") || new URLSearchParams(window.location.search).get("mobile") === "1";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {mobileSurface ? <MobileApp /> : <>
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
