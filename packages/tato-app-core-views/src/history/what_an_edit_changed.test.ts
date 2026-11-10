import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { whatAnEditChanged } from "./what_an_edit_changed";

const STREAM = "30c076a8-91cc-4340-9e15-9b89ca6c0b45";
const INVERT = "7d1f0c2a-1111-4c1d-8e55-000000000001";
const WARM_LUT = { asset: "85e64485-144d-4868-9cca-5afa5b0456dd", kind: "data", path: "media/warm.cube", content_sha256: "b0", content_byte_len: 75, import_settings: {} };

function sentenceAndLinesOf(operations: JsonValue[]): [string, readonly string[]] {
  const { what, operation_lines } = whatAnEditChanged(operations, new Map([[INVERT, "invertingeffect"]]));
  return [[what.lead, what.subject, what.rest].filter((words) => words !== null && words !== "").join(" "), operation_lines];
}

test("a project's own settings read as what they changed, in the runtime's recorded shape", () => {
  expect(sentenceAndLinesOf([{ operation: "set_project_name", from: "lobby", to: "Lobby screens" }])).toEqual(["Renamed the project to Lobby screens", ["set_project_name lobby → Lobby screens"]]);
  expect(sentenceAndLinesOf([{ operation: "set_project_description", from: null, to: "The lobby screens" }])[0]).toBe("Described the project");
  expect(sentenceAndLinesOf([{ operation: "set_project_description", from: "The lobby screens", to: null }])[0]).toBe("Removed the project's description");
  expect(sentenceAndLinesOf([{ operation: "set_project_cover", from: null, to: WARM_LUT.asset }])).toEqual(["Set the project's cover", [`set_project_cover nothing → ${WARM_LUT.asset}`]]);
});

test("a project file and a stream document read by their file names", () => {
  expect(sentenceAndLinesOf([{ operation: "write_project_file", path: "nodes/meter.py", content: { staged_at: "x" }, replaced_a_file: true }])).toEqual(["Edited meter.py", ["write_project_file nodes/meter.py"]]);
  expect(sentenceAndLinesOf([{ operation: "write_project_file", path: "nodes/meter.py", content: { staged_at: "x" }, replaced_a_file: false }])[0]).toBe("Added meter.py");
  expect(sentenceAndLinesOf([{ operation: "remove_project_file", path: "nodes/meter.py" }])[0]).toBe("Removed meter.py");
  expect(sentenceAndLinesOf([{ operation: "create_stream_document", stream: STREAM, path: "streams/main.graph.json", document: {} }])).toEqual(["Created the stream main.graph.json", ["create_stream_document streams/main.graph.json"]]);
  expect(sentenceAndLinesOf([{ operation: "set_stream_display_name", stream: STREAM, path: "streams/main.graph.json", from: null, to: "Main" }])).toEqual(["Named a stream Main", ["set_stream_display_name nothing → Main"]]);
  expect(sentenceAndLinesOf([{ operation: "replace_asset_content", asset: WARM_LUT.asset, path: "media/warm.cube", from: {}, to: {} }])[0]).toBe("Replaced the content of warm.cube");
});

test("an asset and a graph edit read by the asset's file and the node's name now, with a count of the changes past the first", () => {
  expect(sentenceAndLinesOf([{ operation: "import_asset", asset: WARM_LUT }])[0]).toBe("Imported warm.cube");
  expect(
    sentenceAndLinesOf([
      { stream: STREAM, operation: "rename_node", node: INVERT, from: "invert", to: "invertingeffect" },
      { stream: STREAM, operation: "set_pin_value", node: INVERT, input: "amount", from: 1, to: 0.5 },
      { stream: STREAM, operation: "remove_group", group: {} },
    ])[0],
  ).toBe("Renamed invert to invertingeffect, and 2 more changes");
});

test("an operation newer than this app reads by its own name, and an edit with none changed nothing", () => {
  expect(sentenceAndLinesOf([{ operation: "fold_the_graph" }])).toEqual(["fold_the_graph", ["fold_the_graph"]]);
  expect(sentenceAndLinesOf([])).toEqual(["Changed nothing", []]);
});

test("an added node whose other operations each link it reads as added and linked, naming each other end", () => {
  const LOUDNESS = "7d1f0c2a-4444-4c1d-8e55-000000000004";
  const HALFTONE = "7d1f0c2a-5555-4c1d-8e55-000000000005";
  const LIGHTS = "7d1f0c2a-6666-4c1d-8e55-000000000006";
  const names = new Map([[HALFTONE, "halftone"], [LIGHTS, "lights"]]);
  const added = { stream: STREAM, operation: "add_node", node: { id: LOUDNESS, name: "loudness", type: "nodes.loudness:LoudnessMeter", config: {} }, links: [] };
  const toHalftone = { stream: STREAM, operation: "connect", link: { source: { node: LOUDNESS, port: "level" }, target: { node: HALFTONE, port: "level" } } };
  const toLights = { stream: STREAM, operation: "connect", link: { source: { node: LOUDNESS, port: "level" }, target: { node: LIGHTS, port: "level" } } };
  const unrelated = { stream: STREAM, operation: "rename_node", node: HALFTONE, from: "halftone", to: "dots" };
  const sentence = (operations: JsonValue[]) => {
    const { what } = whatAnEditChanged(operations, names);
    return [what.lead, what.subject, what.rest].filter((words) => words !== null && words !== "").join(" ");
  };

  expect(sentence([added, toHalftone, toLights])).toBe("Added loudness and linked it to halftone.level and lights.level");
  expect(sentence([added, toHalftone, unrelated])).toBe("Added loudness and 2 more changes");
});

test("an added node that carries its own links, or links to itself, reads with a count instead", () => {
  const NODE = "7d1f0c2a-7777-4c1d-8e55-000000000007";
  const selfLink = { stream: STREAM, operation: "connect", link: { source: { node: NODE, port: "out" }, target: { node: NODE, port: "in" } } };
  const added = (links: JsonValue[]) => ({ stream: STREAM, operation: "add_node", node: { id: NODE, name: "echo", type: "nodes.echo:Echo", config: {} }, links });
  const sentence = (operations: JsonValue[]) => {
    const { what } = whatAnEditChanged(operations, new Map());
    return [what.lead, what.subject, what.rest].filter((words) => words !== null && words !== "").join(" ");
  };

  expect(sentence([added([]), selfLink])).toBe("Added echo and 1 more change");
  expect(sentence([added([selfLink["link"]]), selfLink])).toBe("Added echo and its link, and 1 more change");
});
