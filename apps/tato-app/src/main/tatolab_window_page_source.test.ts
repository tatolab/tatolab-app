import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  builtWindowFileForRequest,
  inlineScriptHashSources,
  isACommandFromTheWindowsOwnPage,
  isAPermissionTheWindowGrants,
  isAViewPageTheWindowFrames,
  isOnTheWindowPagesOwnLocation,
  TATOLAB_WINDOW_PAGE_URL,
  windowPageContentSecurityPolicy,
} from "./tatolab_window_page_source.js";

test("a request on the app's origin reads its file from the built window, and the root reads index.html", () => {
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://app/index.html")).toBe("/app/out/renderer/index.html");
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://app/")).toBe("/app/out/renderer/index.html");
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://app/assets/index-1a2b.js?v=1")).toBe("/app/out/renderer/assets/index-1a2b.js");
});

test("a request off the app's origin or out of the built window reads nothing", () => {
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://elsewhere/index.html")).toBeNull();
  expect(builtWindowFileForRequest("/app/out/renderer", "https://app/index.html")).toBeNull();
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://app/%2F..%2F..%2Fetc%2Fpasswd")).toBeNull();
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://app/%E0%A4%A")).toBeNull();
});

test("an encoded dot-segment is folded by the URL and stays inside the built window", () => {
  expect(builtWindowFileForRequest("/app/out/renderer", "tatolab-app://app/%2e%2e/%2e%2e/etc/passwd")).toBe("/app/out/renderer/etc/passwd");
});

test("the window navigates only on its own page's scheme and host, never to a file, data, another host or a web page", () => {
  const windowPageUrl = "tatolab-app://app/index.html";
  expect(isOnTheWindowPagesOwnLocation(windowPageUrl, "tatolab-app://app/index.html?stream=main")).toBe(true);
  expect(isOnTheWindowPagesOwnLocation(windowPageUrl, "tatolab-app://app/assets/index.js")).toBe(true);
  for (const navigationUrl of ["file:///etc/passwd", "data:text/html,hi", "tatolab-app://elsewhere/", "https://app/", "not a url"]) {
    expect(isOnTheWindowPagesOwnLocation(windowPageUrl, navigationUrl)).toBe(false);
  }
  expect(isOnTheWindowPagesOwnLocation("http://localhost:1420/", "http://localhost:1420/?state=stopped")).toBe(true);
  expect(isOnTheWindowPagesOwnLocation("http://localhost:1420/", "http://localhost:1421/")).toBe(false);
});

test("the policy allows an inline script only by its hash, and the window page holds none", () => {
  const windowPageHtml = readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
  expect(inlineScriptHashSources(windowPageHtml)).toEqual([]);
  expect(windowPageContentSecurityPolicy(windowPageHtml)).toBe(
    "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-src tatolab-app://app/core_views/ tatolab-app://app/project_views/; object-src 'none'; base-uri 'self'",
  );
  const pageWithAnInlineScript = "<script>document.title = 'x';</script>";
  expect(inlineScriptHashSources(pageWithAnInlineScript)).toEqual([`'sha256-${createHash("sha256").update("document.title = 'x';").digest("base64")}'`]);
});


test("a command is answered only from the window page's own top frame, never a frame it embeds, a frame already gone or another page", () => {
  const windowPageUrl = "tatolab-app://app/index.html";
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, "tatolab-app://app/index.html", true)).toBe(true);
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, "tatolab-app://app/index.html", false)).toBe(false);
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, null, true)).toBe(false);
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, "https://example.com/", true)).toBe(false);
});

test("the window frames its core views' pages on its own location, and project views' files served on its scheme, and nothing else", () => {
  expect(isAViewPageTheWindowFrames(TATOLAB_WINDOW_PAGE_URL, "tatolab-app://app/core_views/outliner/index.html")).toBe(true);
  expect(isAViewPageTheWindowFrames("http://localhost:5173/", "http://localhost:5173/core_views/library/index.html")).toBe(true);
  expect(isAViewPageTheWindowFrames(TATOLAB_WINDOW_PAGE_URL, "tatolab-app://app/project_views/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/views/deck/index.html")).toBe(true);
  expect(isAViewPageTheWindowFrames("http://localhost:5173/", "tatolab-app://app/project_views/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/views/deck/index.html")).toBe(true);
  expect(isAViewPageTheWindowFrames(TATOLAB_WINDOW_PAGE_URL, "tatolab-app://app/index.html")).toBe(false);
  expect(isAViewPageTheWindowFrames(TATOLAB_WINDOW_PAGE_URL, "tatolab-app://app/views/deck/index.html")).toBe(false);
  expect(isAViewPageTheWindowFrames("http://localhost:5173/", "http://localhost:5173/project_views/L2hvbWU/views/deck/index.html")).toBe(false);
  expect(isAViewPageTheWindowFrames(TATOLAB_WINDOW_PAGE_URL, "https://example.com/core_views/outliner/index.html")).toBe(false);
  expect(isAViewPageTheWindowFrames(TATOLAB_WINDOW_PAGE_URL, "not a url")).toBe(false);
});

test("the window grants the camera and the microphone to its own page and every view it frames, and nothing else to anyone", () => {
  const deckViewUrl = "tatolab-app://app/project_views/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/views/deck/index.html";
  expect(isAPermissionTheWindowGrants(TATOLAB_WINDOW_PAGE_URL, "media", "tatolab-app://app/index.html")).toBe(true);
  expect(isAPermissionTheWindowGrants(TATOLAB_WINDOW_PAGE_URL, "media", "tatolab-app://app/core_views/viewer/index.html")).toBe(true);
  expect(isAPermissionTheWindowGrants(TATOLAB_WINDOW_PAGE_URL, "media", deckViewUrl)).toBe(true);
  expect(isAPermissionTheWindowGrants("http://localhost:5173/", "media", deckViewUrl)).toBe(true);
  expect(isAPermissionTheWindowGrants(TATOLAB_WINDOW_PAGE_URL, "media", "https://example.com/camera.html")).toBe(false);
  expect(isAPermissionTheWindowGrants(TATOLAB_WINDOW_PAGE_URL, "media", "not a url")).toBe(false);
  for (const permission of ["geolocation", "notifications", "display-capture", "clipboard-read", "openExternal", "usb"]) {
    expect(isAPermissionTheWindowGrants(TATOLAB_WINDOW_PAGE_URL, permission, deckViewUrl)).toBe(false);
  }
});
