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

const root = document.getElementById("root");
if (!root) throw new Error("Chamber root element missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
