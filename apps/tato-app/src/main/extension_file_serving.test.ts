import { expect, test } from "vitest";
import { howAnExtensionFileIsServed } from "./extension_file_serving.js";

test("each file an extension's folder holds is served with its content type and its transform: a page with the import map, a .ts file as JavaScript with its types removed, any other as read", () => {
  expect(["index.html", "assets/app.js", "deck.TS", "icon.png", "model.onnx"].map(howAnExtensionFileIsServed)).toEqual([
    { content_type: "text/html; charset=utf-8", served_as: "with_import_map" },
    { content_type: "text/javascript; charset=utf-8", served_as: "as_read" },
    { content_type: "text/javascript; charset=utf-8", served_as: "types_removed" },
    { content_type: "image/png", served_as: "as_read" },
    { content_type: "application/octet-stream", served_as: "as_read" },
  ]);
});

test("a library the extension carries in its vendor/ folder is served as it is written, its declaration as text, and a folder of another name is the author's own", () => {
  expect(["vendor/charts.js", "vendor/charts.d.ts", "vendor/charts.css", "vendor/page.html", "vendor/model.onnx", "lib/vendor/charts.ts", "vendored/charts.ts"].map(howAnExtensionFileIsServed)).toEqual([
    { content_type: "text/javascript; charset=utf-8", served_as: "as_read" },
    { content_type: "text/plain; charset=utf-8", served_as: "as_read" },
    { content_type: "text/css; charset=utf-8", served_as: "as_read" },
    { content_type: "text/html; charset=utf-8", served_as: "as_read" },
    { content_type: "application/octet-stream", served_as: "as_read" },
    { content_type: "text/javascript; charset=utf-8", served_as: "types_removed" },
    { content_type: "text/javascript; charset=utf-8", served_as: "types_removed" },
  ]);
});
