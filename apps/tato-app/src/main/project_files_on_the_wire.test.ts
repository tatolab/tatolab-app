import { expect, test } from "vitest";
import { projectFileBytesFromTheReadProjectFileToolResult } from "./project_files_on_the_wire.js";

test("a large file's bytes read whole, and content that is not standard base64 with padding is not read", () => {
  const modelBytes = Buffer.alloc(8 * 1024 * 1024, 0xa7);
  const readOfTheModel = projectFileBytesFromTheReadProjectFileToolResult(JSON.stringify({ path: "views/deck/model.onnx", byte_len: modelBytes.length, content_base64: modelBytes.toString("base64") }));

  expect(readOfTheModel.ok && readOfTheModel.value.equals(modelBytes)).toBe(true);
  for (const contentBase64 of ["iVBORw0KGgo", "iVBO=w0K", "iVBO-w0K"]) {
    expect(projectFileBytesFromTheReadProjectFileToolResult(JSON.stringify({ path: "views/deck/icon.png", byte_len: 8, content_base64: contentBase64 }))).toEqual({
      ok: false,
      failure: "the runtime's read_project_file result could not be read: `content_base64` is not standard base64 with padding",
    });
  }
});
