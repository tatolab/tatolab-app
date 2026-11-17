// Serves the window alone, in a browser against the mock backend, from electron.vite.config.ts's
// renderer config, and prints its URL. `electron-vite dev --rendererOnly` still launches the app
// on the last main-process build, so the mock window is served by Vite directly.
//
// Usage: node scripts/serve_the_mock_window_in_a_browser.mjs
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "electron-vite";
import { createServer } from "vite";

const tatoAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The window serves the built core views beside it, so they are built first.
execFileSync("npm", ["run", "build", "--workspace", "@tatolab/tato-app-core-views"], { cwd: tatoAppRoot, stdio: "inherit" });
const { config: electronViteConfig } = await loadConfigFromFile({ command: "serve", mode: "development" }, undefined, tatoAppRoot);
// Vite transforms only the pages under its root, so the fixture view's page, served from mock/ through `/@fs/`, would miss
// the React refresh preamble its modules check for.
const mockStudioViewFolder = path.resolve(tatoAppRoot, "mock/mock_studio_view");
const mockStudioViewPagesTransformedByVite = {
  name: "mock-studio-view-pages-transformed-by-vite",
  configureServer(viteDevServer) {
    viteDevServer.middlewares.use(async (request, response, next) => {
      try {
        const requestPath = decodeURIComponent(request.url?.split("?")[0] ?? "");
        const moduleFile = requestPath.startsWith("/core_node_ui/") ? path.resolve(studioNodeUiModuleFolder, `.${requestPath.slice("/core_node_ui".length)}`) : "";
        if (!moduleFile.endsWith(".ts") || !moduleFile.startsWith(`${studioNodeUiModuleFolder}${path.sep}`)) {
          next();
          return;
        }
        let moduleText;
        try {
          moduleText = await readFile(moduleFile, "utf8");
        } catch (readFailure) {
          if (readFailure?.code !== "ENOENT") throw readFailure;
          answerThatItIsNotServed(response, 404, `${requestPath} is not in the Studio's node UI module`);
          return;
        }
        let moduleScript;
        try {
          moduleScript = stripTypeScriptTypes(moduleText, { mode: "strip", sourceUrl: path.relative(studioNodeUiModuleFolder, moduleFile) });
        } catch (stripFailure) {
          answerThatItIsNotServed(response, 422, `${requestPath} is not servable as written: ${stripFailure instanceof Error ? stripFailure.message : String(stripFailure)}`);
          return;
        }
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(moduleScript);
      } catch (failure) {
        next(failure);
      }
    });
  },
};
/** Answers a request for a node UI file with `status` and why, as the app's page protocol answers one it does not serve. */
function answerThatItIsNotServed(response, status, because) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(because);
}
const mockWindowServer = await createServer({
  ...electronViteConfig.renderer,
  root: path.resolve(tatoAppRoot, electronViteConfig.renderer.root),
  configFile: false,
  plugins: [studioNodeUiModuleServedWithItsTypesRemoved, ...(electronViteConfig.renderer.plugins ?? []), mockStudioViewPagesTransformedByVite],
  server: electronViteConfig.renderer.server,
});
await mockWindowServer.listen();
mockWindowServer.printUrls();
