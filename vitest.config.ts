// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const EXCLUDED_FROM_EVERY_PROJECT = [...configDefaults.exclude, "out/**", "build/**"];

export default defineConfig({
  test: {
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
          include: ["src/renderer/**/*.test.{ts,tsx}"],
          exclude: EXCLUDED_FROM_EVERY_PROJECT,
        },
      },
    ],
  },
});
