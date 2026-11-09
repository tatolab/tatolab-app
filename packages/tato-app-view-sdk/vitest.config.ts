import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "contract", environment: "node", include: ["src/*.test.ts"] } },
      { test: { name: "kit", environment: "happy-dom", include: ["src/kit/**/*.test.{ts,tsx}"] } },
    ],
  },
});
