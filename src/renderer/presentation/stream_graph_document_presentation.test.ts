import { describe, expect, it } from "vitest";
import {
  readTheGraphDocument,
  syntaxPartsOfAJsonLine,
  type GraphDocumentValue,
} from "./stream_graph_document_presentation";

const GRAPH_DOCUMENT_TEXT = `{
  "stream": "front-door",
  "nodes": [
    {
      "name": "displaywindow",
      "config_checksum": 15071898633716066277,
      "paused": false,
      "delivery_profile": null
    }
  ],
  "links": [],
  "exposed": [{ "node": "h264encoder", "port": "encoded_video", "level": "public" }],
  "machine": "jonathanf-macbook"
}`;

describe("readTheGraphDocument", () => {
  it("keeps each key in its order and each number as the runtime wrote it, past 2^53 too", () => {
    const graphDocument = readTheGraphDocument(GRAPH_DOCUMENT_TEXT);
    if (graphDocument === null || graphDocument.kind !== "object") return expect.unreachable("not an object");
    expect(graphDocument.entries.map(([key]) => key)).toEqual(["stream", "nodes", "links", "exposed", "machine"]);
    const nodes = graphDocument.entries[1]?.[1];
    const firstNode = nodes?.kind === "array" ? nodes.items[0] : undefined;
    expect(firstNode).toEqual({
      kind: "object",
      entries: [
        ["name", { kind: "string", text: "displaywindow" }],
        ["config_checksum", { kind: "number", literal: "15071898633716066277" }],
        ["paused", { kind: "literal", literal: "false" }],
        ["delivery_profile", { kind: "literal", literal: "null" }],
      ],
    } satisfies GraphDocumentValue);
  });

  it("reads nothing from text that is not JSON", () => {
    expect(readTheGraphDocument("graph failed")).toBeNull();
  });
});

describe("syntaxPartsOfAJsonLine", () => {
  it("splits a pretty-printed line into its key, string, number, literal and punctuation", () => {
    expect(syntaxPartsOfAJsonLine('    "config_checksum": 15071898633716066277,')).toEqual([
      { text: "    ", kind: "punctuation" },
      { text: '"config_checksum"', kind: "key" },
      { text: ": ", kind: "punctuation" },
      { text: "15071898633716066277", kind: "number" },
      { text: ",", kind: "punctuation" },
    ]);
    expect(syntaxPartsOfAJsonLine('  "name": "a \\"quoted\\" word", "x": true')).toEqual([
      { text: "  ", kind: "punctuation" },
      { text: '"name"', kind: "key" },
      { text: ": ", kind: "punctuation" },
      { text: '"a \\"quoted\\" word"', kind: "string" },
      { text: ", ", kind: "punctuation" },
      { text: '"x"', kind: "key" },
      { text: ": ", kind: "punctuation" },
      { text: "true", kind: "literal" },
    ]);
    expect(syntaxPartsOfAJsonLine("  ],")).toEqual([{ text: "  ],", kind: "punctuation" }]);
  });
});
