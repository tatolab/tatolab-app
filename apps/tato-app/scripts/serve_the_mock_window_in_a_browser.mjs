// Serves the window alone, in a browser against the mock backend, from electron.vite.config.ts's
// renderer config, and prints its URL. `electron-vite dev --rendererOnly` still launches the app
// on the last main-process build, so the mock window is served by Vite directly.
//
// Usage: node scripts/serve_the_mock_window_in_a_browser.mjs
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
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
      const requestPath = request.url?.split("?")[0] ?? "";
      const pagePath = requestPath.startsWith("/@fs/") ? decodeURIComponent(requestPath.slice("/@fs".length)) : "";
      if (!pagePath.endsWith(".html") || !pagePath.startsWith(`${mockStudioViewFolder}/`)) {
        next();
        return;
      }
      const page = await viteDevServer.transformIndexHtml(requestPath, await readFile(pagePath, "utf8"));
      response.setHeader("Content-Type", "text/html");
      response.end(page);
    });
  },
};
// A project's view that opts into the sandbox runs on an opaque origin, which fetches its module
// scripts with `Origin: null`, which Vite's default CORS refuses.
const mockWindowServer = await createServer({
  ...electronViteConfig.renderer,
  root: path.resolve(tatoAppRoot, electronViteConfig.renderer.root),
  configFile: false,
  plugins: [...(electronViteConfig.renderer.plugins ?? []), mockStudioViewPagesTransformedByVite],
  server: { ...electronViteConfig.renderer.server, cors: { origin: ["null", /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] } },
});
await mockWindowServer.listen();
mockWindowServer.printUrls();
