// Serves the window alone, in a browser against the mock backend, from electron.vite.config.ts's
// renderer config, and prints its URL. `electron-vite dev --rendererOnly` still launches the app
// on the last main-process build, so the mock window is served by Vite directly.
//
// Usage: node scripts/serve_the_mock_window_in_a_browser.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "electron-vite";
import { createServer } from "vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { config: electronViteConfig } = await loadConfigFromFile({ command: "serve", mode: "development" }, undefined, repositoryRoot);
// A project's view that opts into the sandbox runs on an opaque origin, which fetches its module
// scripts with `Origin: null`, which Vite's default CORS refuses.
const mockWindowServer = await createServer({
  ...electronViteConfig.renderer,
  root: path.resolve(repositoryRoot, electronViteConfig.renderer.root),
  configFile: false,
  server: { ...electronViteConfig.renderer.server, cors: { origin: ["null", /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] } },
});
await mockWindowServer.listen();
mockWindowServer.printUrls();
