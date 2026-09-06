import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import IncentiveBuff from "./IncentiveBuff";
import "./styles.css";
import "./incentive.css";
import "./incentive-metering.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IncentiveBuff />
    <App />
  </React.StrictMode>,
);
