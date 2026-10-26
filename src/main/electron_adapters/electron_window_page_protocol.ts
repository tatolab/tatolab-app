import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { describeCaughtFailure } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import { TATOLAB_WINDOW_PAGE_SCHEME } from "../../shared/tatolab_electron_bridge_contract.js";
import { builtWindowFileForRequest, windowPageContentSecurityPolicy } from "../tatolab_window_page_source.js";

/** Makes the window page's scheme a secure, standard origin; Electron takes this only before the app is ready. */
export function registerTheWindowPageSchemeBeforeReady(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: TATOLAB_WINDOW_PAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serves the built window in `builtWindowDirectory` under the window page's scheme, each response carrying the page's content security policy, which frames only the preview page at `runtimeLoopbackHttpOrigin`. */
export async function serveTheBuiltWindow(builtWindowDirectory: string, runtimeLoopbackHttpOrigin: string, tatolabAppLog: TatolabAppLog): Promise<void> {
  let windowPageContentSecurityPolicyHeader = "default-src 'self'";
  try {
    windowPageContentSecurityPolicyHeader = windowPageContentSecurityPolicy(
      await readFile(path.join(builtWindowDirectory, "index.html"), "utf8"),
      runtimeLoopbackHttpOrigin,
    );
  } catch (caughtFailure) {
    tatolabAppLog.error("the built window could not be read", { built_window_directory: builtWindowDirectory, failure: describeCaughtFailure(caughtFailure) });
  }
  protocol.handle(TATOLAB_WINDOW_PAGE_SCHEME, async (windowPageRequest) => {
    const builtWindowFile = builtWindowFileForRequest(builtWindowDirectory, windowPageRequest.url);
    if (builtWindowFile === null) return new Response(null, { status: 404 });
    let builtWindowFileResponse: Response;
    try {
      builtWindowFileResponse = await net.fetch(pathToFileURL(builtWindowFile).toString());
    } catch (caughtFailure) {
      tatolabAppLog.debug("the window asked for a file the built window does not hold", {
        built_window_file: builtWindowFile,
        failure: describeCaughtFailure(caughtFailure),
      });
      return new Response(null, { status: 404 });
    }
    const responseHeaders = new Headers(builtWindowFileResponse.headers);
    responseHeaders.set("Content-Security-Policy", windowPageContentSecurityPolicyHeader);
    return new Response(builtWindowFileResponse.body, { status: builtWindowFileResponse.status, headers: responseHeaders });
  });
}
