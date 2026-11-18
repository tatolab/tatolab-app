// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { setNodeInputValueAction } from "@tatolab/tato-app-view-sdk/pin_model/input_value_actions";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { PortViewerEvent } from "../src/shared/tatolab_backend_contract";
import { createMockTatolabBackend } from "./mock_tatolab_backend";
import { readMockTatolabOptions } from "./mock_tatolab_options";

afterEach(() => {
  vi.useRealTimers();
});

const MAIN = "pattern-main-bcd55b";
const PATTERN_FOLDER = "/Users/jonathanf/streams/pattern";

it("a value set live on the fixture view node's input of its output's name is what that output carries to the node wired to it, each set published, and nothing before the first", async () => {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("studio_views=fixture")));
  const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
    await vi.advanceTimersByTimeAsync(100);
    return answering;
  };
  const graph = await settled(backend.describeStreamGraph(MAIN));
  const viewNode = graph.nodes.find((node) => node.name === "pictureandfader");
  if (viewNode === undefined || graph.stream_asset === null) return expect.unreachable("the main stream holds the fixture view's node");
  expect(viewNode.input_ports.find((port) => port.name === "fader")).toEqual({ name: "fader", family: "array", stream_facts: null, values_checked: null, pin: null, value_read: { value: null, comes_from: null } });
  const wiredFromTheFader = graph.links.find((link) => link.source_node === "pictureandfader" && link.source_port === "fader");
  expect(wiredFromTheFader?.target_node).toBe("fadermeter");

  const fader: InputAddress = { graph: { project_folder: PATTERN_FOLDER, stream_asset: graph.stream_asset, level: [] }, node_id: viewNode.id, input: "fader" };
  const readingsOfTheFader: PortViewerEvent[] = [];
  backend.onPortViewerEvent((event) => readingsOfTheFader.push(event));
  await settled(backend.openPortViewer({ stream: MAIN, node_id: viewNode.id, port: "fader" }));
  expect(readingsOfTheFader).toEqual([]);

  expect(await settled(backend.transactInTheOpenProject([setNodeInputValueAction(fader, 0.73)], "live", null))).toMatchObject({ kind: "applied" });
  expect(readingsOfTheFader.at(-1)).toMatchObject({
    kind: "message",
    reading: { family: "array", attributes: [{ name: "values", dtype: "float64", shape: [1], residency: "cpu", statistics: { element_count: 1, minimum: 0.73, maximum: 0.73, mean: 0.73 } }] },
  });
  const readingsAfterTheFirstSet = readingsOfTheFader.length;
  await vi.advanceTimersByTimeAsync(500);
  expect(readingsOfTheFader).toHaveLength(readingsAfterTheFirstSet);

  await settled(backend.transactInTheOpenProject([setNodeInputValueAction(fader, 0.73)], "live", null));
  expect(readingsOfTheFader).toHaveLength(readingsAfterTheFirstSet + 1);
  await settled(backend.transactInTheOpenProject([setNodeInputValueAction(fader, [0.25, 0.75])], "live", null));
  expect(readingsOfTheFader.at(-1)).toMatchObject({ reading: { attributes: [{ shape: [2], statistics: { element_count: 2, minimum: 0.25, maximum: 0.75, mean: 0.5 } }] } });
  expect((await settled(backend.describeStreamGraph(MAIN))).nodes.find((node) => node.id === viewNode.id)?.input_ports.find((port) => port.name === "fader")?.value_read).toEqual({ value: [0.25, 0.75], comes_from: "live" });
});
