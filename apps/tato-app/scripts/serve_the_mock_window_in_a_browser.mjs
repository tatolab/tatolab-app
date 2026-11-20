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
import { withTheSuppliedModulesImportMap } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { loadConfigFromFile } from "electron-vite";
import { createServer } from "vite";
import { howAnExtensionFileIsServed } from "../src/main/extension_file_serving.ts";

const tatoAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The window serves the built core views beside it, so they are built first.
execFileSync("npm", ["run", "build", "--workspace", "@tatolab/tato-app-core-views"], { cwd: tatoAppRoot, stdio: "inherit" });
const { config: electronViteConfig } = await loadConfigFromFile({ command: "serve", mode: "development" }, undefined, tatoAppRoot);
// The app's page protocol serves an extension's folder, the Studio's own node UI module, a project's node UI folder or view, with each
// `.ts` file's types removed, the supplied modules' import map written into each page and a library in `vendor/` as it
// is written. The mock window has no such protocol, so the Studio's node UI module, the mock project's node UI folder and the fixture view's folder are
// served here by the same rule, ahead of the dev server's own answer, and the fixture view is never bundled.
const studioNodeUiModuleFolder = path.resolve(tatoAppRoot, "../../packages/tato-app-core-node-ui/node_ui");
const mockStudioViewFolder = path.resolve(tatoAppRoot, "mock/mock_studio_view");
// Where `mock/mock_node_ui_elements.ts` lists the mock project's node bodies as served, as a passed `node_ui` folder.
const mockProjectNodeUiFolder = path.resolve(tatoAppRoot, "mock/mock_project_node_ui");
// Where `mock/mock_studio_view/mock_studio_view_listing.ts` lists the fixture views' folders as served.
const MOCK_STUDIO_VIEWS_PATH = "/mock_studio_view/";

/** The extension folder and the `/`-separated path in it that `requestPath` names, or `null` when it names no file of one. */
function extensionFileOfTheRequest(requestPath) {
  if (requestPath.startsWith("/core_node_ui/")) return { extensionFolder: studioNodeUiModuleFolder, pathInTheFolder: requestPath.slice("/core_node_ui/".length) };
  if (requestPath.startsWith("/mock_project_node_ui/")) return { extensionFolder: mockProjectNodeUiFolder, pathInTheFolder: requestPath.slice("/mock_project_node_ui/".length) };
  if (!requestPath.startsWith(MOCK_STUDIO_VIEWS_PATH)) return null;
  const [viewFolder, ...pathInTheView] = requestPath.slice(MOCK_STUDIO_VIEWS_PATH.length).split("/");
  if (viewFolder === undefined || pathInTheView.length === 0) return null;
  return { extensionFolder: path.join(mockStudioViewFolder, viewFolder), pathInTheFolder: pathInTheView.join("/") };
}

/** The bytes of `fileBytes`, read from `pathInTheFolder`, as the app's page protocol serves them, or why they are not servable as written. */
function extensionFileAsServed(pathInTheFolder, fileBytes, servedAs) {
  switch (servedAs) {
    case "types_removed":
      return stripTypeScriptTypes(fileBytes.toString("utf8"), { mode: "strip", sourceUrl: pathInTheFolder });
    case "with_import_map":
      return withTheSuppliedModulesImportMap(fileBytes.toString("utf8"));
    case "as_read":
      return fileBytes;
  }
}

const extensionFoldersServedAsTheAppServesThem = {
  name: "extension-folders-served-as-the-app-serves-them",
  configureServer(viteDevServer) {
    viteDevServer.middlewares.use(async (request, response, next) => {
      try {
        const requestPath = decodeURIComponent(request.url?.split("?")[0] ?? "");
        const fileAsked = extensionFileOfTheRequest(requestPath);
        if (fileAsked === null) {
          next();
          return;
        }
        const extensionFile = path.resolve(fileAsked.extensionFolder, fileAsked.pathInTheFolder);
        if (!extensionFile.startsWith(`${fileAsked.extensionFolder}${path.sep}`)) {
          answerThatItIsNotServed(response, 403, `${requestPath} leaves its extension's folder`);
          return;
        }
        let fileBytes;
        try {
          fileBytes = await readFile(extensionFile);
        } catch (readFailure) {
          if (readFailure?.code !== "ENOENT" && readFailure?.code !== "EISDIR") throw readFailure;
          answerThatItIsNotServed(response, 404, `${requestPath} is not in its extension's folder`);
          return;
        }
        const serving = howAnExtensionFileIsServed(fileAsked.pathInTheFolder);
        let servedBytes;
        try {
          servedBytes = extensionFileAsServed(fileAsked.pathInTheFolder, fileBytes, serving.served_as);
        } catch (serveFailure) {
          answerThatItIsNotServed(response, 422, `${requestPath} is not servable as written: ${serveFailure instanceof Error ? serveFailure.message : String(serveFailure)}`);
          return;
        }
        response.setHeader("Content-Type", serving.content_type);
        response.end(servedBytes);
      } catch (failure) {
        next(failure);
      }
    });
  },
};
/** Answers a request for an extension's file with `status` and why, as the app's page protocol answers one it does not serve. */
function answerThatItIsNotServed(response, status, because) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(because);
}
const mockWindowServer = await createServer({
  ...electronViteConfig.renderer,
  root: path.resolve(tatoAppRoot, electronViteConfig.renderer.root),
  configFile: false,
  plugins: [extensionFoldersServedAsTheAppServesThem, ...(electronViteConfig.renderer.plugins ?? [])],
  server: electronViteConfig.renderer.server,
});
await mockWindowServer.listen();
mockWindowServer.printUrls();
