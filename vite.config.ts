import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const API_PORT = process.env.ENSO_PORT || "3001";
const API_TARGET = `http://localhost:${API_PORT}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Build-time config for APK auto-connect (set during ./setup APK build)
    "__ENSO_DEFAULT_BACKEND__": JSON.stringify(process.env.ENSO_DEFAULT_BACKEND || ""),
    "__ENSO_DEFAULT_TOKEN__": JSON.stringify(process.env.ENSO_DEFAULT_TOKEN || ""),
    "__ENSO_DEFAULT_NAME__": JSON.stringify(process.env.ENSO_DEFAULT_NAME || ""),
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/ws": {
        target: API_TARGET,
        ws: true,
      },
      "/media": {
        target: API_TARGET,
      },
      "/upload": {
        target: API_TARGET,
      },
      "/demo": {
        target: API_TARGET,
      },
      "/api": {
        target: API_TARGET,
      },
    },
  },
});
