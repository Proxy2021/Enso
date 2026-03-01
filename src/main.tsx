import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initNativePlugins } from "./lib/native-init";
import "./main.css";

initNativePlugins(); // fire-and-forget — no-op on web

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
