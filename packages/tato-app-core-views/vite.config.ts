// Builds each core view into `dist/<folder>/`: its page, its `tatolab_view.json` and its icon, beside the
// scripts and styles the views share in `dist/assets/`. Studio serves `dist/` as the folder of the views it ships with itself.

import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { CORE_VIEW_FOLDERS } from "./core_view_folders";

const SOURCE_FOLDER = path.resolve(import.meta.dirname, "src");
const BUILT_FOLDER = path.resolve(import.meta.dirname, "dist");

/** Copies each core view's manifest and icon beside its built page, so each built folder is the view's folder. */
function copyEachViewsManifestAndIcon(): Plugin {
  return {
    name: "copy-each-views-manifest-and-icon",
    writeBundle() {
      for (const folder of CORE_VIEW_FOLDERS) {
        mkdirSync(path.join(BUILT_FOLDER, folder), { recursive: true });
        for (const fileName of readdirSync(path.join(SOURCE_FOLDER, folder)).filter((name) => name === "tatolab_view.json" || name.endsWith(".svg"))) {
          copyFileSync(path.join(SOURCE_FOLDER, folder, fileName), path.join(BUILT_FOLDER, folder, fileName));
        }
      }
    },
  };
}

export default defineConfig({
  root: SOURCE_FOLDER,
  base: "./",
  plugins: [react(), tailwindcss(), copyEachViewsManifestAndIcon()],
  build: {
    outDir: BUILT_FOLDER,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rolldownOptions: { input: Object.fromEntries(CORE_VIEW_FOLDERS.map((folder) => [folder, path.join(SOURCE_FOLDER, folder, "index.html")])) },
  },
});
