import React from "react";
import { createRoot } from "react-dom/client";
import ControlPlaneV2 from "./ControlPlaneV2";
import AppEnhancements from "./AppEnhancements";
import ConnectorPanel from "./ConnectorPanel";
import ProviderConnectWizard from "./ProviderConnectWizard";
import LiveAssist from "./LiveAssist";
import ThemeController from "./ThemeController";
import "./control-plane-v2.css";
import "./connector-panel.css";
import "./provider-connect.css";
import "./live-assist.css";
import "./mobile-fixes.css";
import "./openai-platform-theme.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ControlPlaneV2 />
    <AppEnhancements />
    <ConnectorPanel />
    <ProviderConnectWizard />
    <LiveAssist />
    <ThemeController />
  </React.StrictMode>,
);
