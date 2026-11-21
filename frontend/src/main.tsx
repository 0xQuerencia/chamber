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
import "./reminders.css";
import "./keyboard.css";
import "./mfa.css";
import "./security.css";
import "./onboarding.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./blueprint-tokens.css";
import "./delivery.css";
import "./portal.css";
import "./compliance.css";
import "./tally-layout.css";

const root = document.getElementById("root");
if (!root) throw new Error("Chamber root element missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);

if ("serviceWorker" in navigator && window.location.protocol === "https:") {
 window.addEventListener("load", () => {
  void navigator.serviceWorker.register("/sw.js").catch(() => {
   // Offline install remains optional when a browser declines service workers.
  });
 });
}
