// How each file of an extension's folder, a project view's or a node UI module's, is served to a
// page, by where it sits in the folder and its extension. The author's own code is `.ts`, served as
// JavaScript with its types removed, and a page with the supplied modules' import map written into
// it. A library the extension carries itself sits in the folder's `vendor/`, an ES module with its
// declaration beside it, and every file there is served as it is written. Any other file is served
// as it was read, a `.js`, `.mjs` or `.map` outside `vendor/` as bytes of no type a page runs.
// This module imports nothing but Node's own, so the mock window's server serves the fixture view's
// folder by the same rule as the app's page protocol.

import path from "node:path";

/** What is done to a file of an extension's folder on its way to the page: nothing, its types removed, or the supplied modules' import map written into it. */
export type ExtensionFileServedAs = "as_read" | "types_removed" | "with_import_map";

/** How one file of an extension's folder is served: its content type and what is done to it on the way. */
export interface ExtensionFileServing {
  readonly content_type: string;
  readonly served_as: ExtensionFileServedAs;
}

/** The folder of an extension that holds the libraries it carries, each served as it is written. */
export const EXTENSION_VENDOR_FOLDER = "vendor/";

const JAVASCRIPT_CONTENT_TYPE = "text/javascript; charset=utf-8";

/** A file served with `contentType` as the runtime read it. */
function servedAsRead(contentType: string): ExtensionFileServing {
  return { content_type: contentType, served_as: "as_read" };
}

/** How each file an extension's folder may hold is served, by its extension, outside `vendor/`; any other is served as bytes, as read. */
const HOW_EACH_FILE_IS_SERVED_BY_EXTENSION: ReadonlyMap<string, ExtensionFileServing> = new Map([
  [".html", { content_type: "text/html; charset=utf-8", served_as: "with_import_map" }],
  [".ts", { content_type: JAVASCRIPT_CONTENT_TYPE, served_as: "types_removed" }],
  [".css", servedAsRead("text/css; charset=utf-8")],
  [".json", servedAsRead("application/json")],
  [".svg", servedAsRead("image/svg+xml")],
  [".png", servedAsRead("image/png")],
  [".jpg", servedAsRead("image/jpeg")],
  [".jpeg", servedAsRead("image/jpeg")],
  [".gif", servedAsRead("image/gif")],
  [".webp", servedAsRead("image/webp")],
  [".ico", servedAsRead("image/x-icon")],
  [".woff", servedAsRead("font/woff")],
  [".woff2", servedAsRead("font/woff2")],
  [".ttf", servedAsRead("font/ttf")],
  [".otf", servedAsRead("font/otf")],
  [".wasm", servedAsRead("application/wasm")],
  [".mp3", servedAsRead("audio/mpeg")],
  [".wav", servedAsRead("audio/wav")],
  [".mp4", servedAsRead("video/mp4")],
  [".webm", servedAsRead("video/webm")],
  [".txt", servedAsRead("text/plain; charset=utf-8")],
]);

/** The content type of each file of a built library, by its extension, which only a library under `vendor/` is served as. */
const CONTENT_TYPE_OF_A_VENDORED_LIBRARYS_FILE: ReadonlyMap<string, string> = new Map([
  [".js", JAVASCRIPT_CONTENT_TYPE],
  [".mjs", JAVASCRIPT_CONTENT_TYPE],
  [".map", "application/json"],
]);

/** How a file under `vendor/` is served: as written, a declaration as the text it is, since it types the library it sits beside and is never run. */
function howAVendorFileIsServed(fileExtension: string): ExtensionFileServing {
  if (fileExtension === ".ts") return servedAsRead("text/plain; charset=utf-8");
  return servedAsRead(CONTENT_TYPE_OF_A_VENDORED_LIBRARYS_FILE.get(fileExtension) ?? HOW_EACH_FILE_IS_SERVED_BY_EXTENSION.get(fileExtension)?.content_type ?? "application/octet-stream");
}

/** How the file at `pathInTheExtensionFolder`, `/`-separated inside its extension's folder, is served. */
export function howAnExtensionFileIsServed(pathInTheExtensionFolder: string): ExtensionFileServing {
  const fileExtension = path.posix.extname(pathInTheExtensionFolder).toLowerCase();
  if (pathInTheExtensionFolder.startsWith(EXTENSION_VENDOR_FOLDER)) return howAVendorFileIsServed(fileExtension);
  return HOW_EACH_FILE_IS_SERVED_BY_EXTENSION.get(fileExtension) ?? servedAsRead("application/octet-stream");
}
