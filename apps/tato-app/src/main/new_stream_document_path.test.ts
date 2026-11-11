import { expect, test } from "vitest";
import { newStreamDocumentPathNoFileHolds } from "./new_stream_document_path.js";

test("a new stream's graph document is named for its display name in streams/, numbered past a name a file already holds", () => {
  expect(newStreamDocumentPathNoFileHolds("Preview", [{ path: "streams/main.graph.json", byte_len: 287 }])).toBe("streams/preview.graph.json");
  expect(newStreamDocumentPathNoFileHolds("Lobby Preview!", [])).toBe("streams/lobby_preview.graph.json");
  expect(
    newStreamDocumentPathNoFileHolds("Main", [
      { path: "streams/main.graph.json", byte_len: 287 },
      { path: "streams/main-2.graph.json", byte_len: 113 },
    ]),
  ).toBe("streams/main-3.graph.json");
  expect(newStreamDocumentPathNoFileHolds("Préview ✨", [])).toBe("streams/pr_view.graph.json");
  expect(newStreamDocumentPathNoFileHolds("✨", [])).toBe("streams/stream.graph.json");
});
