// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
  build: { target: ["chrome152"], outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
  test: { exclude: [...configDefaults.exclude, "src-electron/build/**"] },
});
