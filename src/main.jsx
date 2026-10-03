import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./workspace-shell.css";
import "./workspace-responsive.css";
import "./readability.css";
import "./course-offer-workspace.css";
import "./sidebar-course-offer.css";
import "./brand-identity.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
