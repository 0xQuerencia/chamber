import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./experience.css";

const root = document.getElementById("root");
if (!root) throw new Error("Chamber root element missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
