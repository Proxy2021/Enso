import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "openclaw-plugin/src/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    globals: true,
  },
});
