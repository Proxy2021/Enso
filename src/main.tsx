import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initNativePlugins } from "./lib/native-init";
import { setupGlobalErrorHandlers } from "./lib/error-reporter";
import "./main.css";

initNativePlugins(); // fire-and-forget — no-op on web
setupGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
