import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "contract", environment: "node", include: ["src/*.test.ts"] } },
      { test: { name: "design_system", environment: "happy-dom", include: ["src/design_system/**/*.test.{ts,tsx}"] } },
    ],
  },
});
