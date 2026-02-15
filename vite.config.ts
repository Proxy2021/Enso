import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    proxy: {
      "/ws": {
        target: "http://localhost:3001",
        ws: true,
      },
      "/media": {
        target: "http://localhost:3001",
      },
      "/upload": {
        target: "http://localhost:3001",
      },
    },
  },
});
