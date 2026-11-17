import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { describeCaughtFailure } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import { TATOLAB_WINDOW_PAGE_SCHEME } from "../../shared/tatolab_electron_bridge_contract.js";
import { isAProjectViewFileUrl, type AnswerAProjectViewFileRequest } from "../extension_files_served_with_types_removed.js";
import { builtWindowFileForRequest, isASuppliedModuleUrl, windowPageContentSecurityPolicy } from "../tatolab_window_page_source.js";

let answerAProjectViewFileRequestOnceServed: AnswerAProjectViewFileRequest | null = null;

/** Answer every request for a project view's file with `answerAProjectViewFileRequest`. */
export function answerProjectViewFileRequestsWith(answerAProjectViewFileRequest: AnswerAProjectViewFileRequest): void {
  answerAProjectViewFileRequestOnceServed = answerAProjectViewFileRequest;
}

/** Makes the window page's scheme a secure, standard origin; Electron takes this only before the app is ready. */
export function registerTheWindowPageSchemeBeforeReady(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: TATOLAB_WINDOW_PAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** The response to a request for a project view's file; its pages carry no content security policy, since a project's view runs with full access. */
async function projectViewFileResponse(requestUrl: string, tatolabAppLog: TatolabAppLog): Promise<Response> {
  if (answerAProjectViewFileRequestOnceServed === null) return new Response(null, { status: 503 });
  const answer = await answerAProjectViewFileRequestOnceServed(requestUrl);
  if (answer.kind === "not_served") {
    tatolabAppLog.debug("a project view's file was not served", { request_url: requestUrl, because: answer.because });
    return new Response(answer.because, { status: answer.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(new Uint8Array(answer.file_bytes), { status: 200, headers: { "Content-Type": answer.content_type, "Cache-Control": "no-store" } });
}

/** Where the window's own files come from: the built window, or electron-vite's dev server, which also serves the supplied modules at `/studio_sdk/` while it serves the window. */
export type WindowPageFilesSource = { kind: "built_window"; builtWindowDirectory: string } | { kind: "dev_server"; windowDevServerUrl: string };

/** The response to a request for one of the supplied modules from the dev server at `windowDevServerUrl`, for a project view's page on this scheme while the window comes from the dev server. */
async function suppliedModuleFromTheDevServer(windowDevServerUrl: string, requestUrl: string, tatolabAppLog: TatolabAppLog): Promise<Response> {
  const suppliedModuleUrl = new URL(new URL(requestUrl).pathname, windowDevServerUrl).href;
  try {
    return await net.fetch(suppliedModuleUrl);
  } catch (caughtFailure) {
    tatolabAppLog.debug("the dev server did not answer for a supplied module", { supplied_module_url: suppliedModuleUrl, failure: describeCaughtFailure(caughtFailure) });
    return new Response(null, { status: 404 });
  }
}

/**
 * Serves the window page's scheme: project views' files through the running app, and the built window, the supplied
 * modules among its files, each of its responses carrying the page's content
 * security policy; while the window comes from the dev server, only project views' files and the supplied modules.
 */
export async function serveTheWindowPageScheme(windowPageFilesSource: WindowPageFilesSource, tatolabAppLog: TatolabAppLog): Promise<void> {
  let windowPageContentSecurityPolicyHeader = "default-src 'self'";
  if (windowPageFilesSource.kind === "built_window") {
    try {
      windowPageContentSecurityPolicyHeader = windowPageContentSecurityPolicy(await readFile(path.join(windowPageFilesSource.builtWindowDirectory, "index.html"), "utf8"));
    } catch (caughtFailure) {
      tatolabAppLog.error("the built window could not be read", { built_window_directory: windowPageFilesSource.builtWindowDirectory, failure: describeCaughtFailure(caughtFailure) });
    }
  }
  protocol.handle(TATOLAB_WINDOW_PAGE_SCHEME, async (windowPageRequest) => {
    if (isAProjectViewFileUrl(windowPageRequest.url)) return projectViewFileResponse(windowPageRequest.url, tatolabAppLog);
    if (windowPageFilesSource.kind === "dev_server") {
      return isASuppliedModuleUrl(windowPageRequest.url) ? suppliedModuleFromTheDevServer(windowPageFilesSource.windowDevServerUrl, windowPageRequest.url, tatolabAppLog) : new Response(null, { status: 404 });
    }
    const builtWindowFile = builtWindowFileForRequest(windowPageFilesSource.builtWindowDirectory, windowPageRequest.url);
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
