import React from "react";
import { createRoot } from "react-dom/client";
import ControlPlaneV2 from "./ControlPlaneV2";
import AppEnhancements from "./AppEnhancements";
import ConnectorPanel from "./ConnectorPanel";
import "./control-plane-v2.css";
import "./connector-panel.css";
import "./mobile-fixes.css";

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
  </React.StrictMode>,
);
