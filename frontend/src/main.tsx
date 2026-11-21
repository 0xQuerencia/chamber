import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./classic-erp.css";
import "./tracker.css";
import "./client-master.css";
import "./work-board.css";
import "./import-wizard.css";
import "./composer.css";
import "./insights.css";
import "./devices.css";
import "./sheets-settings.css";
import "./evidence.css";

const root = document.getElementById("root");
if (!root) throw new Error("Chamber root element missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);

if ("serviceWorker" in navigator && window.location.protocol === "https:") {
 window.addEventListener("load", () => {
  void navigator.serviceWorker.register("/sw.js").catch(() => {
   // The application remains usable when the PWA worker is unavailable.
  });
 });
}
