// Which responses of the window page's scheme a page on another origin may read. While the window
// comes from the dev server, its core views' frames are on the dev server's origin and import a node
// UI element's script from the scheme, which a module script does only through CORS; so the scheme
// takes cross-origin requests then, and the Studio's own node UI files alone answer them. A built
// window's frames share the scheme's origin, and no response is readable from elsewhere.

import { isAStudioNodeUiFileUrl } from "./studio_node_ui_module.js";

/** The privileges the window page's scheme is registered with: a secure, standard origin, taking cross-origin requests only while the window comes from the dev server at `windowDevServerUrl`. */
export function windowPageSchemePrivileges(windowDevServerUrl: string | null): { standard: true; secure: true; supportFetchAPI: true; corsEnabled: boolean } {
  return { standard: true, secure: true, supportFetchAPI: true, corsEnabled: windowDevServerUrl !== null };
}

/** The origin allowed to read the Studio's own node UI files: the dev server's, while the window comes from the dev server at `windowDevServerUrl`; `null` for a built window. */
export function originReadingTheStudioNodeUiFiles(windowDevServerUrl: string | null): string | null {
  return windowDevServerUrl === null ? null : new URL(windowDevServerUrl).origin;
}

/** `response` with the header `name` set to `value`, its body and status kept. */
export function withHeader(response: Response, name: string, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

/** `response` to a request for `requestUrl`, readable by `allowedOrigin` when it is one of the Studio's own node UI files and an origin is allowed; any other response unchanged. */
export function readableWhereAllowed(requestUrl: string, response: Response, allowedOrigin: string | null): Response {
  return allowedOrigin !== null && isAStudioNodeUiFileUrl(requestUrl) ? withHeader(response, "Access-Control-Allow-Origin", allowedOrigin) : response;
}
