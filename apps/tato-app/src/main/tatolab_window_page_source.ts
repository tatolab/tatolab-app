// Where the shipped window's page comes from: the built window in `out/renderer/`, served under the
// app's own `tatolab-app://app/` origin with a content security policy, since a `file://` page
// breaks the window's module scripts.

import { createHash } from "node:crypto";
import path from "node:path";
import { TATOLAB_WINDOW_PAGE_HOST, TATOLAB_WINDOW_PAGE_SCHEME } from "../shared/tatolab_electron_bridge_contract.js";
import { isAProjectViewFileUrl, PROJECT_VIEW_FILES_PATH } from "./project_view_files.js";


/** The shipped window's page. */
export const TATOLAB_WINDOW_PAGE_URL = `${TATOLAB_WINDOW_PAGE_SCHEME}://${TATOLAB_WINDOW_PAGE_HOST}/index.html`;

/** Where the window serves its core views' pages. */
const CORE_VIEW_PAGES_PATH = "/core_views/";

/** The file under `builtWindowDirectory` that `requestUrl` asks for, or `null` when it asks for another origin or a path outside it. */
export function builtWindowFileForRequest(builtWindowDirectory: string, requestUrl: string): string | null {
  let parsedRequestUrl: URL;
  try {
    parsedRequestUrl = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsedRequestUrl.protocol !== `${TATOLAB_WINDOW_PAGE_SCHEME}:` || parsedRequestUrl.host !== TATOLAB_WINDOW_PAGE_HOST) return null;
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(parsedRequestUrl.pathname);
  } catch {
    return null;
  }
  const builtWindowFile = path.join(builtWindowDirectory, requestedPath === "/" ? "index.html" : requestedPath);
  const relativeToTheBuiltWindow = path.relative(builtWindowDirectory, builtWindowFile);
  if (relativeToTheBuiltWindow === "" || relativeToTheBuiltWindow.startsWith("..") || path.isAbsolute(relativeToTheBuiltWindow)) return null;
  return builtWindowFile;
}

/** Whether `navigationUrl` stays on the window page's own scheme and host. A custom scheme's URL origin is the opaque "null", which every file:, data: and custom-scheme URL shares, so origins cannot be compared. */
export function isOnTheWindowPagesOwnLocation(windowPageUrl: string, navigationUrl: string): boolean {
  if (!URL.canParse(windowPageUrl) || !URL.canParse(navigationUrl)) return false;
  const windowPageLocation = new URL(windowPageUrl);
  const navigationLocation = new URL(navigationUrl);
  return navigationLocation.protocol === windowPageLocation.protocol && navigationLocation.host === windowPageLocation.host;
}

/**
 * Whether a frame of the window may load `frameUrl`: a core view's page, on the window page's own location, or a project
 * view's file, which the window serves on its own origin too. A frame on that origin can reach the window page's bridge
 * through `window.parent`; nothing else is framed.
 */
export function isAViewPageTheWindowFrames(windowPageUrl: string, frameUrl: string): boolean {
  if (isAProjectViewFileUrl(frameUrl)) return true;
  return isOnTheWindowPagesOwnLocation(windowPageUrl, frameUrl) && new URL(frameUrl).pathname.startsWith(CORE_VIEW_PAGES_PATH);
}

/** The kinds of capture a view's frame may ask for: a camera and a microphone, never the screen. */
const MEDIA_A_VIEW_MAY_CAPTURE: ReadonlySet<string> = new Set(["video", "audio"]);

/** Whether the window's session lets `permission`, asked by a view's page at `requestingUrl` for `mediaTypes`, through to the system: only `media` naming a camera or a microphone and nothing else. */
export function isAPermissionTheWindowLetsAViewAsk(windowPageUrl: string, permission: string, requestingUrl: string, mediaTypes: readonly string[]): boolean {
  if (permission !== "media" || !isAViewPageTheWindowFrames(windowPageUrl, requestingUrl)) return false;
  return mediaTypes.length > 0 && mediaTypes.every((mediaType) => MEDIA_A_VIEW_MAY_CAPTURE.has(mediaType));
}

/**
 * The media a permission check asks about. Electron names a check's `mediaType` `video` or `audio` only for a camera or a
 * microphone, `unknown` for every other capture (the screen, a tab, the system's audio), and none for a query that names no
 * capture; only the first two are kept as kinds of capture, so the rest are refused.
 */
export function mediaTypesOfAPermissionCheck(mediaType: string | undefined): string[] {
  return mediaType === undefined ? [] : [mediaType];
}

/** Whether a command came from the window's own page at `windowPageUrl`: its top frame, on the page's own location, rather than a frame it embeds, a frame already gone, or a page it navigated to. */
export function isACommandFromTheWindowsOwnPage(windowPageUrl: string, senderFrameUrl: string | null, senderIsTheTopFrame: boolean): boolean {
  return senderFrameUrl !== null && senderIsTheTopFrame && isOnTheWindowPagesOwnLocation(windowPageUrl, senderFrameUrl);
}

/** The `'sha256-…'` source of every inline script in `windowPageHtml`: the theme script that runs before the page paints. */
export function inlineScriptHashSources(windowPageHtml: string): string[] {
  return [...windowPageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, inlineScriptText]) => `'sha256-${createHash("sha256").update(inlineScriptText ?? "").digest("base64")}'`,
  );
}

/**
 * The window page's content security policy: only its own origin, its inline theme script, inline styles, data: fonts
 * and images, and frames only of its core views' pages and its project views' files.
 */
export function windowPageContentSecurityPolicy(windowPageHtml: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashSources(windowPageHtml).join(" ")}`.trimEnd(),
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `frame-src ${TATOLAB_WINDOW_PAGE_SCHEME}://${TATOLAB_WINDOW_PAGE_HOST}${CORE_VIEW_PAGES_PATH} ${TATOLAB_WINDOW_PAGE_SCHEME}://${TATOLAB_WINDOW_PAGE_HOST}${PROJECT_VIEW_FILES_PATH}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}
