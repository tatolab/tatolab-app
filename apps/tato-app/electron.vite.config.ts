import { readFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

const BUILD_FEATURES_IMPORT = "./tatolab_app_build_features.json";
const BUILD_FEATURES_IMPORT_WITHOUT_ITS_ATTRIBUTE = `from "${BUILD_FEATURES_IMPORT}";`;

/**
 * Keeps the build features a file beside the main bundle, `out/main/tatolab_app_build_features.json`,
 * instead of inlining them: `scripts/tatolab_app_build_features.mjs write` sets it from a build's
 * flags after the bundle is built, and the bundle checks read it out of `app.asar`. The committed
 * shipping features are emitted in its place, so the file is there for `electron-vite dev` too.
 */
function buildFeaturesBesideTheMainBundle(): Plugin {
  return {
    name: "tatolab-app-build-features-beside-the-main-bundle",
    enforce: "pre",
    resolveId: (importedId) => (importedId === BUILD_FEATURES_IMPORT ? { id: BUILD_FEATURES_IMPORT, external: true } : null),
    // Vite's build import analysis drops an external import's `with { type: "json" }`, and Node
    // refuses to import JSON without it.
    renderChunk(chunkCode, chunk) {
      if (!chunk.imports.includes(BUILD_FEATURES_IMPORT)) return null;
      const importsWithoutTheAttribute = chunkCode.split(BUILD_FEATURES_IMPORT_WITHOUT_ITS_ATTRIBUTE).length - 1;
      if (importsWithoutTheAttribute !== 1) {
        this.error(`${chunk.fileName} imports ${BUILD_FEATURES_IMPORT}, but its import reads as \`${BUILD_FEATURES_IMPORT_WITHOUT_ITS_ATTRIBUTE}\` ${importsWithoutTheAttribute} times; expected once`);
      }
      return chunkCode.replace(BUILD_FEATURES_IMPORT_WITHOUT_ITS_ATTRIBUTE, `from "${BUILD_FEATURES_IMPORT}" with { type: "json" };`);
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: path.basename(BUILD_FEATURES_IMPORT),
        source: await readFile(path.resolve(import.meta.dirname, "src/main", BUILD_FEATURES_IMPORT), "utf8"),
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [buildFeaturesBesideTheMainBundle()],
    build: { lib: { entry: "src/main/electron_adapters/electron_app_entry.ts" } },
  },
  // A sandboxed preload can require only `electron`, so the window's preload ships as one CommonJS file.
  preload: {
    build: {
      externalizeDeps: false,
      lib: { entry: "src/preload/tatolab_window_preload.ts", formats: ["cjs"] },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    root: "src/renderer",
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/renderer") } },
    // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
    build: { assetsInlineLimit: 0, minify: true },
  },
});
