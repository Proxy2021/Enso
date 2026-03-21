import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "server/src/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    globals: true,
  },
});
