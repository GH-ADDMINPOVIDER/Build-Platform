import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import QuickLimitMeter from "./QuickLimitMeter";
import "./styles.css";
import "./quick-limit.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <QuickLimitMeter />
  </React.StrictMode>,
);
