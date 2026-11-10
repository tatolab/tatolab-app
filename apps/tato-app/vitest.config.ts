import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const EXCLUDED_FROM_EVERY_PROJECT = [...configDefaults.exclude, "out/**", "build/**"];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "src/main/test-fixtures/**"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      reportOnFailure: true,
    },
    projects: [
      {
        test: {
          name: "main-preload-shared-and-scripts",
          environment: "node",
          include: ["src/{main,preload,shared}/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: EXCLUDED_FROM_EVERY_PROJECT,
        },
      },
      {
        resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/renderer") } },
        test: {
          name: "renderer",
          environment: "happy-dom",
          include: ["src/renderer/**/*.test.{ts,tsx}", "mock/**/*.test.{ts,tsx}"],
          exclude: EXCLUDED_FROM_EVERY_PROJECT,
        },
      },
    ],
  },
});
