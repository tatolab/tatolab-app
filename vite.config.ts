// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
  build: { target: "safari16", outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
});
