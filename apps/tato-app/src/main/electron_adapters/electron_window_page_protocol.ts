import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { describeCaughtFailure } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import { TATOLAB_PROJECT_VIEW_SCHEME, TATOLAB_WINDOW_PAGE_SCHEME } from "../../shared/tatolab_electron_bridge_contract.js";
import type { AnswerAProjectViewFileRequest } from "../project_view_files.js";
import { builtWindowFileForRequest, windowPageContentSecurityPolicy } from "../tatolab_window_page_source.js";

let answerAProjectViewFileRequestOnceServed: AnswerAProjectViewFileRequest | null = null;

/** Answer every request for a project view's file with `answerAProjectViewFileRequest`. */
export function answerProjectViewFileRequestsWith(answerAProjectViewFileRequest: AnswerAProjectViewFileRequest): void {
  answerAProjectViewFileRequestOnceServed = answerAProjectViewFileRequest;
}

/** Makes the window page's scheme and project views' scheme secure, standard origins; Electron takes this only before the app is ready. */
export function registerTheWindowPageSchemeBeforeReady(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: TATOLAB_WINDOW_PAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: TATOLAB_PROJECT_VIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** The response to a request for a project view's file, each carrying the content security policy that keeps a view to its own origin. */
async function projectViewFileResponse(requestUrl: string, tatolabAppLog: TatolabAppLog): Promise<Response> {
  if (answerAProjectViewFileRequestOnceServed === null) return new Response(null, { status: 503 });
  const answer = await answerAProjectViewFileRequestOnceServed(requestUrl);
  if (answer.kind === "not_served") {
    tatolabAppLog.debug("a project view's file was not served", { request_url: requestUrl, because: answer.because });
    return new Response(answer.because, { status: answer.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(new Uint8Array(answer.file_bytes), {
    status: 200,
    headers: { "Content-Type": answer.content_type, "Cache-Control": "no-store", "Content-Security-Policy": answer.content_security_policy },
  });
}

/**
 * Serves project views' scheme through the running app, and the window page's scheme from the built window in
 * `builtWindowDirectory`, each of its responses carrying the page's content security policy; `null` while the window
 * comes from the dev server.
 */
export async function serveTheWindowPageScheme(builtWindowDirectory: string | null, tatolabAppLog: TatolabAppLog): Promise<void> {
  let windowPageContentSecurityPolicyHeader = "default-src 'self'";
  if (builtWindowDirectory !== null) {
    try {
      windowPageContentSecurityPolicyHeader = windowPageContentSecurityPolicy(await readFile(path.join(builtWindowDirectory, "index.html"), "utf8"));
    } catch (caughtFailure) {
      tatolabAppLog.error("the built window could not be read", { built_window_directory: builtWindowDirectory, failure: describeCaughtFailure(caughtFailure) });
    }
  }
  protocol.handle(TATOLAB_PROJECT_VIEW_SCHEME, (projectViewFileRequest) => projectViewFileResponse(projectViewFileRequest.url, tatolabAppLog));
  protocol.handle(TATOLAB_WINDOW_PAGE_SCHEME, async (windowPageRequest) => {
    const builtWindowFile = builtWindowDirectory === null ? null : builtWindowFileForRequest(builtWindowDirectory, windowPageRequest.url);
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
