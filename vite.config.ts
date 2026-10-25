// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(import.meta.dirname, "src/renderer"),
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/renderer") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
  build: { target: ["chrome152"], outDir: path.resolve(import.meta.dirname, "out/renderer"), emptyOutDir: true, assetsInlineLimit: 0 },
  test: { root: import.meta.dirname, exclude: [...configDefaults.exclude, "out/**"] },
});
