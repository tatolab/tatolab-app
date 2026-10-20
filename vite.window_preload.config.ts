// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { defineConfig } from "vite";

// A sandboxed preload can require only `electron`, so the window's preload ships as one CommonJS file.
export default defineConfig({
  clearScreen: false,
  publicDir: false,
  build: {
    target: "chrome152",
    outDir: "src-electron/build/preload",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "src-electron/src/preload/tatolab_window_preload.ts",
      formats: ["cjs"],
      fileName: () => "tatolab_window_preload.cjs",
    },
    rollupOptions: { external: ["electron"] },
  },
});
