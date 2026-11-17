import { expect, test } from "vitest";
import { originReadingTheStudioNodeUiFiles, readableWhereAllowed, windowPageSchemePrivileges, withHeader } from "./window_page_cross_origin_reads.js";

const DEV_SERVER_URL = "http://localhost:5173/index.html";
const FLOAT_NUMBER_URL = "tatolab-app://app/core_node_ui/float_number.ts";

/** A response as the scheme answers a file, with its type and body. */
function servedFile(): Response {
  return new Response("export {};", { status: 200, headers: { "Content-Type": "text/javascript; charset=utf-8" } });
}

test("while the window comes from the dev server, the scheme takes cross-origin requests and the dev server's origin reads the Studio's own node UI files", async () => {
  expect(windowPageSchemePrivileges(DEV_SERVER_URL)).toEqual({ standard: true, secure: true, supportFetchAPI: true, corsEnabled: true });
  const allowedOrigin = originReadingTheStudioNodeUiFiles(DEV_SERVER_URL);
  expect(allowedOrigin).toBe("http://localhost:5173");
  const readable = readableWhereAllowed(FLOAT_NUMBER_URL, servedFile(), allowedOrigin);
  expect(readable.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  expect([readable.status, readable.headers.get("Content-Type"), await readable.text()]).toEqual([200, "text/javascript; charset=utf-8", "export {};"]);
});

test("no other file of the scheme is readable from the dev server's origin", () => {
  const allowedOrigin = originReadingTheStudioNodeUiFiles(DEV_SERVER_URL);
  for (const requestUrl of ["tatolab-app://app/index.html", "tatolab-app://app/studio_sdk/react.js", "tatolab-app://app/project_views/deck/index.html", "tatolab-app://app/core_node_ui_elsewhere/float_number.ts"]) {
    expect(readableWhereAllowed(requestUrl, servedFile(), allowedOrigin).headers.get("Access-Control-Allow-Origin")).toBeNull();
  }
});

test("a built window takes no cross-origin request, and no file of the scheme is readable from another origin", () => {
  expect(windowPageSchemePrivileges(null).corsEnabled).toBe(false);
  expect(originReadingTheStudioNodeUiFiles(null)).toBeNull();
  expect(readableWhereAllowed(FLOAT_NUMBER_URL, servedFile(), null).headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("a header set on a response keeps its status, its other headers and its body", async () => {
  const withThePolicy = withHeader(new Response("<!doctype html>", { status: 203, headers: { "Content-Type": "text/html" } }), "Content-Security-Policy", "default-src 'self'");
  expect([withThePolicy.status, withThePolicy.headers.get("Content-Type"), withThePolicy.headers.get("Content-Security-Policy"), await withThePolicy.text()]).toEqual([203, "text/html", "default-src 'self'", "<!doctype html>"]);
});
