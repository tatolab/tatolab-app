import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "contract", environment: "node", include: ["src/*.test.ts"] } },
      { test: { name: "node_ui", environment: "happy-dom", include: ["src/node_ui/**/*.test.ts"] } },
      { test: { name: "pin_model", environment: "node", include: ["src/pin_model/**/*.test.ts"] } },
      { test: { name: "pin_services", environment: "node", include: ["src/pin_services/**/*.test.ts"] } },
      { test: { name: "design_system", environment: "happy-dom", include: ["src/design_system/**/*.test.{ts,tsx}"] } },
    ],
  },
});
