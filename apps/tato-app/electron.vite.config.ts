import { createReadStream, existsSync, statSync } from "node:fs";
import { cp, readFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { SUPPLIED_MODULES_PATH } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { build, type Plugin, type Rolldown, type ViteDevServer } from "vite";

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
const VIEW_SDK_PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../../packages/tato-app-view-sdk");
const BUILT_SUPPLIED_MODULES_FOLDER = path.join(VIEW_SDK_PACKAGE_FOLDER, "dist", "studio_sdk");
const STUDIO_NODE_UI_MODULE_FOLDER = path.resolve(import.meta.dirname, "../../packages/tato-app-core-node-ui/node_ui");
const SERVED_STUDIO_NODE_UI_PATH = "/core_node_ui/";
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function isARolldownWatcher(buildOutcome: unknown): buildOutcome is Rolldown.RolldownWatcher {
  return typeof buildOutcome === "object" && buildOutcome !== null && "close" in buildOutcome && "on" in buildOutcome;
}

/** Answers every dev server request under `servedPath` with the file of `builtFolder` it names, or a 404 naming `whatTheFolderHolds`. */
function serveABuiltFolderFromTheDevServer(devServer: ViteDevServer, servedPath: string, builtFolder: string, whatTheFolderHolds: string): void {
  devServer.middlewares.use((request, response, next) => {
    const requestPath = decodeURIComponent((request.url ?? "").split("?")[0] ?? "");
    if (!requestPath.startsWith(servedPath)) return next();
    const servedFilePath = requestPath.endsWith("/") ? `${requestPath}index.html` : requestPath;
    const builtFile = path.resolve(builtFolder, `.${servedFilePath.slice(servedPath.length - 1)}`);
    // Answered here even when missing, or Vite's fallback would draw the whole window inside the view's frame.
    if (!builtFile.startsWith(`${builtFolder}${path.sep}`) || !existsSync(builtFile) || !statSync(builtFile).isFile()) {
      response.statusCode = 404;
      response.end(`${requestPath} is not among ${whatTheFolderHolds}`);
      return;
    }
    response.setHeader("Content-Type", CONTENT_TYPE_BY_EXTENSION[path.extname(builtFile)] ?? "application/octet-stream");
    createReadStream(builtFile).pipe(response);
  });
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
      serveABuiltFolderFromTheDevServer(devServer, SERVED_CORE_VIEWS_PATH, BUILT_CORE_VIEWS_FOLDER, "the built core views");
    },
    async writeBundle(outputOptions) {
      if (!existsSync(BUILT_CORE_VIEWS_FOLDER)) this.error(`The core views are not built at ${BUILT_CORE_VIEWS_FOLDER}: run \`npm run build --workspace @tatolab/tato-app-core-views\` first.`);
      await cp(BUILT_CORE_VIEWS_FOLDER, path.join(outputOptions.dir ?? "", "core_views"), { recursive: true });
    },
  };
}

/**
 * Serves the modules the Studio supplies to views, `packages/tato-app-view-sdk/dist/studio_sdk/`, at `studio_sdk/`
 * beside the window: from the dev server, which rebuilds them as the SDK's source changes, and copied into `out/renderer/studio_sdk/` by a build, where the window's
 * page protocol serves them on the window's origin, the one a view's import map resolves them against.
 */
function suppliedModulesBesideTheWindow(): Plugin {
  return {
    name: "tatolab-supplied-modules-beside-the-window",
    async configureServer(devServer) {
      const suppliedModulesRebuiltOnChange = await build({ configFile: path.join(VIEW_SDK_PACKAGE_FOLDER, "vite.studio_sdk.config.ts"), logLevel: "warn", build: { watch: {} } });
      if (isARolldownWatcher(suppliedModulesRebuiltOnChange)) devServer.httpServer?.once("close", () => void suppliedModulesRebuiltOnChange.close());
      serveABuiltFolderFromTheDevServer(devServer, SUPPLIED_MODULES_PATH, BUILT_SUPPLIED_MODULES_FOLDER, "the modules the Studio supplies");
    },
    async writeBundle(outputOptions) {
      if (!existsSync(BUILT_SUPPLIED_MODULES_FOLDER)) this.error(`The supplied modules are not built at ${BUILT_SUPPLIED_MODULES_FOLDER}: run \`npm run build --workspace @tatolab/tato-app-view-sdk\` first.`);
      await cp(BUILT_SUPPLIED_MODULES_FOLDER, path.join(outputOptions.dir ?? "", SUPPLIED_MODULES_PATH), { recursive: true });
    },
  };
}

/**
 * Puts the Studio's own node UI module, `packages/tato-app-core-node-ui/node_ui/`, beside the window at `core_node_ui/`
 * as its source: served as written by the dev server, and copied into `out/renderer/core_node_ui/` by a build. The
 * window's page protocol reads each file from there and serves it to a page with its types removed, as it serves a
 * project's extension file, so the module needs no build.
 */
function studioNodeUiModuleBesideTheWindow(): Plugin {
  return {
    name: "tatolab-studio-node-ui-module-beside-the-window",
    configureServer(devServer) {
      serveABuiltFolderFromTheDevServer(devServer, SERVED_STUDIO_NODE_UI_PATH, STUDIO_NODE_UI_MODULE_FOLDER, "the Studio's own node UI module");
    },
    async writeBundle(outputOptions) {
      await cp(STUDIO_NODE_UI_MODULE_FOLDER, path.join(outputOptions.dir ?? "", SERVED_STUDIO_NODE_UI_PATH), { recursive: true });
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
    plugins: [react(), tailwindcss(), builtCoreViewsBesideTheWindow(), suppliedModulesBesideTheWindow(), studioNodeUiModuleBesideTheWindow()],
    root: "src/renderer",
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/renderer") } },
    // Every font ships as its own file: a CSP whose font-src names only 'self' refuses data: URLs.
    build: { assetsInlineLimit: 0, minify: true },
  },
});
