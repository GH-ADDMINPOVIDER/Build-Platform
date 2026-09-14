import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppEnhancements from "./AppEnhancements";
import QuickLimitMeter from "./QuickLimitMeter";
import "./styles.css";
import "./quick-limit.css";
import "./mobile-fixes.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AppEnhancements />
    <QuickLimitMeter />
  </React.StrictMode>,
);
