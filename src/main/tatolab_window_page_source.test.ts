// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  builtWindowFileForRequest,
  inlineScriptHashSources,
  isACommandFromTheWindowsOwnPage,
  isOnTheWindowPagesOwnLocation,
  windowPageContentSecurityPolicy,
} from "./tatolab_window_page_source.js";

test("a request on the app's origin reads its file from the built window, and the root reads index.html", () => {
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/index.html")).toBe("/app/dist/index.html");
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/")).toBe("/app/dist/index.html");
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/assets/index-1a2b.js?v=1")).toBe("/app/dist/assets/index-1a2b.js");
});

test("a request off the app's origin or out of the built window reads nothing", () => {
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://elsewhere/index.html")).toBeNull();
  expect(builtWindowFileForRequest("/app/dist", "https://app/index.html")).toBeNull();
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/%2F..%2F..%2Fetc%2Fpasswd")).toBeNull();
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/%E0%A4%A")).toBeNull();
});

test("an encoded dot-segment is folded by the URL and stays inside the built window", () => {
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/%2e%2e/%2e%2e/etc/passwd")).toBe("/app/dist/etc/passwd");
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

test("the policy allows the window page's own inline theme script by its hash, and nothing else inline", () => {
  const windowPageHtml = readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
  const inlineThemeScript = /<script>([\s\S]*?)<\/script>/.exec(windowPageHtml)?.[1] ?? "";
  expect(inlineThemeScript).toContain("tatolab-window-theme");
  expect(inlineScriptHashSources(windowPageHtml)).toEqual([`'sha256-${createHash("sha256").update(inlineThemeScript).digest("base64")}'`]);
  expect(windowPageContentSecurityPolicy(windowPageHtml, "http://127.0.0.1:4446")).toBe(
    `default-src 'self'; script-src 'self' ${inlineScriptHashSources(windowPageHtml).join(" ")}; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-src http://127.0.0.1:4446; object-src 'none'; base-uri 'self'`,
  );
});


test("a command is answered only from the window page's own top frame, never a frame it embeds, a frame already gone or another page", () => {
  const windowPageUrl = "tatolab-app://app/index.html";
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, "tatolab-app://app/index.html", true)).toBe(true);
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, "tatolab-app://app/index.html", false)).toBe(false);
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, null, true)).toBe(false);
  expect(isACommandFromTheWindowsOwnPage(windowPageUrl, "https://example.com/", true)).toBe(false);
});
