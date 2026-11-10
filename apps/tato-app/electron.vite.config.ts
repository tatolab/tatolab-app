import { createReadStream, existsSync, statSync } from "node:fs";
import { cp, readFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { build, type Plugin, type Rolldown } from "vite";

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

const CORE_VIEWS_PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../../packages/tato-app-core-views");
const BUILT_CORE_VIEWS_FOLDER = path.join(CORE_VIEWS_PACKAGE_FOLDER, "dist");
const SERVED_CORE_VIEWS_PATH = "/core_views/";
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function isARolldownWatcher(buildOutcome: unknown): buildOutcome is Rolldown.RolldownWatcher {
  return typeof buildOutcome === "object" && buildOutcome !== null && "close" in buildOutcome && "on" in buildOutcome;
}

/**
 * Serves the built core views, `packages/tato-app-core-views/dist/`, at `core_views/` beside the window: from the
 * dev server, which rebuilds them as their source changes, and copied into `out/renderer/core_views/` by a build,
 * where the window's page protocol serves them on the window's origin as every view's folder is.
 */
function builtCoreViewsBesideTheWindow(): Plugin {
  return {
    name: "tatolab-built-core-views-beside-the-window",
    async configureServer(devServer) {
      const coreViewsRebuiltOnChange = await build({ configFile: path.join(CORE_VIEWS_PACKAGE_FOLDER, "vite.config.ts"), logLevel: "warn", build: { watch: {} } });
      if (isARolldownWatcher(coreViewsRebuiltOnChange)) devServer.httpServer?.once("close", () => void coreViewsRebuiltOnChange.close());
      devServer.middlewares.use((request, response, next) => {
        const requestPath = decodeURIComponent((request.url ?? "").split("?")[0] ?? "");
        if (!requestPath.startsWith(SERVED_CORE_VIEWS_PATH)) return next();
        const servedPath = requestPath.endsWith("/") ? `${requestPath}index.html` : requestPath;
        const builtFile = path.resolve(BUILT_CORE_VIEWS_FOLDER, `.${servedPath.slice(SERVED_CORE_VIEWS_PATH.length - 1)}`);
        if (!builtFile.startsWith(`${BUILT_CORE_VIEWS_FOLDER}${path.sep}`) || !existsSync(builtFile) || !statSync(builtFile).isFile()) return next();
        response.setHeader("Content-Type", CONTENT_TYPE_BY_EXTENSION[path.extname(builtFile)] ?? "application/octet-stream");
        createReadStream(builtFile).pipe(response);
      });
    },
    async writeBundle(outputOptions) {
      if (!existsSync(BUILT_CORE_VIEWS_FOLDER)) this.error(`The core views are not built at ${BUILT_CORE_VIEWS_FOLDER}: run \`npm run build --workspace @tatolab/tato-app-core-views\` first.`);
      await cp(BUILT_CORE_VIEWS_FOLDER, path.join(outputOptions.dir ?? "", "core_views"), { recursive: true });
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
    plugins: [react(), tailwindcss(), builtCoreViewsBesideTheWindow()],
    root: "src/renderer",
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/renderer") } },
    // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
    build: { assetsInlineLimit: 0, minify: true },
  },
});
