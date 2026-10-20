// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
  // The window runs in Tauri's WebKit and Electron 44's Chromium 152 until Tauri is removed.
  build: { target: ["safari26", "chrome152"], outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
  test: { exclude: [...configDefaults.exclude, "src-electron/build/**"] },
});
