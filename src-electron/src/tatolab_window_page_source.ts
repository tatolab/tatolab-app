// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Where the shipped window's page comes from: the built window in `dist/`, served under the
// app's own `tatolab-app://app/` origin with a content security policy, since a `file://` page
// breaks Vite's absolute asset paths and module scripts.

import { createHash } from "node:crypto";
import path from "node:path";

/** The scheme the shipped window's page is served under. */
export const TATOLAB_WINDOW_PAGE_SCHEME = "tatolab-app";

/** The host of the window page's origin. */
const TATOLAB_WINDOW_PAGE_HOST = "app";

/** The shipped window's page. */
export const TATOLAB_WINDOW_PAGE_URL = `${TATOLAB_WINDOW_PAGE_SCHEME}://${TATOLAB_WINDOW_PAGE_HOST}/index.html`;

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

/** The `'sha256-…'` source of every inline script in `windowPageHtml`: the theme script that runs before the page paints. */
export function inlineScriptHashSources(windowPageHtml: string): string[] {
  return [...windowPageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, inlineScriptText]) => `'sha256-${createHash("sha256").update(inlineScriptText ?? "").digest("base64")}'`,
  );
}

/** The window page's content security policy: only its own origin, its inline theme script, inline styles, and data: fonts and images. */
export function windowPageContentSecurityPolicy(windowPageHtml: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashSources(windowPageHtml).join(" ")}`.trimEnd(),
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
  ].join("; ");
}
