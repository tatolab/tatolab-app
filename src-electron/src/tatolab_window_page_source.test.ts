// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { builtWindowFileForRequest, inlineScriptHashSources, windowPageContentSecurityPolicy } from "./tatolab_window_page_source.js";

test("a request on the app's origin reads its file from the built window, and the root reads index.html", () => {
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/index.html")).toBe("/app/dist/index.html");
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/")).toBe("/app/dist/index.html");
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/assets/index-1a2b.js?v=1")).toBe("/app/dist/assets/index-1a2b.js");
});

test("a request off the app's origin or out of the built window reads nothing", () => {
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://elsewhere/index.html")).toBeNull();
  expect(builtWindowFileForRequest("/app/dist", "https://app/index.html")).toBeNull();
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/%2e%2e/%2e%2e/etc/passwd")).toBe("/app/dist/etc/passwd");
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/%2F..%2F..%2Fetc%2Fpasswd")).toBeNull();
  expect(builtWindowFileForRequest("/app/dist", "tatolab-app://app/%E0%A4%A")).toBeNull();
});

test("the policy allows the window page's own inline theme script by its hash, and nothing else inline", () => {
  const windowPageHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const inlineThemeScript = /<script>([\s\S]*?)<\/script>/.exec(windowPageHtml)?.[1] ?? "";
  expect(inlineThemeScript).toContain("prefers-color-scheme");
  expect(inlineScriptHashSources(windowPageHtml)).toEqual([`'sha256-${createHash("sha256").update(inlineThemeScript).digest("base64")}'`]);
  expect(windowPageContentSecurityPolicy(windowPageHtml)).toBe(
    `default-src 'self'; script-src 'self' ${inlineScriptHashSources(windowPageHtml).join(" ")}; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:`,
  );
});
