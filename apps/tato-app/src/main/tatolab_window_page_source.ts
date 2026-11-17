// Where the shipped window's page comes from: the built window in `out/renderer/`, served under the
// app's own `tatolab-app://app/` origin with a content security policy, since a `file://` page
// breaks the window's module scripts.

import { createHash } from "node:crypto";
import path from "node:path";
import { SUPPLIED_MODULES_IMPORT_MAP_TEXT, SUPPLIED_MODULES_PATH } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { isAProjectViewFileUrl, PROJECT_VIEW_FILES_PATH } from "./extension_files_served_with_types_removed.js";
import { isOnTheLocationUnderThePath, TATOLAB_WINDOW_PAGE_ROOT_URL } from "./window_page_locations.js";

/** The shipped window's page. */
export const TATOLAB_WINDOW_PAGE_URL = `${TATOLAB_WINDOW_PAGE_ROOT_URL}index.html`;

/** Where the window serves its core views' pages. */
const CORE_VIEW_PAGES_PATH = "/core_views/";

/** The file under `builtWindowDirectory` that `requestUrl` asks for, or `null` when it asks for another origin or a path outside it. */
export function builtWindowFileForRequest(builtWindowDirectory: string, requestUrl: string): string | null {
  if (!isOnTheLocationUnderThePath(TATOLAB_WINDOW_PAGE_ROOT_URL, requestUrl, "/")) return null;
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  const builtWindowFile = path.join(builtWindowDirectory, requestedPath === "/" ? "index.html" : requestedPath);
  const relativeToTheBuiltWindow = path.relative(builtWindowDirectory, builtWindowFile);
  if (relativeToTheBuiltWindow === "" || relativeToTheBuiltWindow.startsWith("..") || path.isAbsolute(relativeToTheBuiltWindow)) return null;
  return builtWindowFile;
}

/** Whether `requestUrl` asks for one of the modules the Studio supplies to views, at `/studio_sdk/` on the window page's scheme. */
export function isASuppliedModuleUrl(requestUrl: string): boolean {
  return isOnTheLocationUnderThePath(TATOLAB_WINDOW_PAGE_ROOT_URL, requestUrl, SUPPLIED_MODULES_PATH);
}

/** Whether `navigationUrl` stays on the window page's own scheme and host. */
export function isOnTheWindowPagesOwnLocation(windowPageUrl: string, navigationUrl: string): boolean {
  return isOnTheLocationUnderThePath(windowPageUrl, navigationUrl, "/");
}

/**
 * Whether a frame of the window may load `frameUrl`: a core view's page, on the window page's own location, or a project
 * view's file, which the window serves on its own origin too. A frame on that origin can reach the window page's bridge
 * through `window.parent`; nothing else is framed.
 */
export function isAViewPageTheWindowFrames(windowPageUrl: string, frameUrl: string): boolean {
  if (isAProjectViewFileUrl(frameUrl)) return true;
  return isOnTheLocationUnderThePath(windowPageUrl, frameUrl, CORE_VIEW_PAGES_PATH);
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

/** The `'sha256-…'` source that admits the inline script `inlineScriptText`. */
function scriptHashSource(inlineScriptText: string): string {
  return `'sha256-${createHash("sha256").update(inlineScriptText).digest("base64")}'`;
}

/** The `'sha256-…'` source of every inline script in `windowPageHtml`: the theme script that runs before the page paints. */
export function inlineScriptHashSources(windowPageHtml: string): string[] {
  return [...windowPageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, inlineScriptText]) => scriptHashSource(inlineScriptText ?? ""));
}

/**
 * The window page's content security policy: only its own origin, its inline theme script, the supplied modules' import
 * map each core view's page holds, inline styles, data: fonts and images, and frames only of its core views' pages and
 * its project views' files. The window serves every page of its own under this one policy, its core views' among them.
 */
export function windowPageContentSecurityPolicy(windowPageHtml: string): string {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...inlineScriptHashSources(windowPageHtml), scriptHashSource(SUPPLIED_MODULES_IMPORT_MAP_TEXT)].join(" "),
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `frame-src ${new URL(CORE_VIEW_PAGES_PATH, TATOLAB_WINDOW_PAGE_ROOT_URL).href} ${new URL(PROJECT_VIEW_FILES_PATH, TATOLAB_WINDOW_PAGE_ROOT_URL).href}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}
