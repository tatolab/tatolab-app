// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const baseUiParts = [
  "avatar", "button", "checkbox", "collapsible", "dialog", "input", "menu", "merge-props", "popover",
  "preview-card", "progress", "radio-group", "radio", "scroll-area", "select", "separator", "slider",
  "switch", "tabs", "toggle-group", "toggle", "tooltip", "use-render",
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") }, dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react-router-dom",
      "@xyflow/react",
      "recharts",
      "motion/react",
      "lucide-react",
      "cmdk",
      "sonner",
      "react-resizable-panels",
      "class-variance-authority",
      "cn",
      ...baseUiParts.map((p) => `@base-ui/react/${p}`),
    ],
  },
})
