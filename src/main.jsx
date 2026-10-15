import React from "react";
import { createRoot,hydrateRoot } from "react-dom/client";
import { App } from "./App.jsx";
import {startTelemetry} from './telemetry.js';
import {installPublicMetadata,readPublicBootstrap} from './public-metadata.js';
import "./styles.css";
import "./workspace-shell.css";
import "./workspace-responsive.css";
import "./readability.css";
import "./course-offer-workspace.css";
import "./sidebar-course-offer.css";
import "./brand-identity.css";

startTelemetry();
installPublicMetadata();
const publicBootstrap=readPublicBootstrap();
const app=(
  <React.StrictMode>
    <App publicBootstrap={publicBootstrap}/>
  </React.StrictMode>
);
if(publicBootstrap?.kind==='home')hydrateRoot(document.getElementById('root'),app);
else createRoot(document.getElementById('root')).render(app);
