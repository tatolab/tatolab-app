// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { createInputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import { createMockTatolabBackend } from "./mock_tatolab_backend";
import { readMockTatolabOptions } from "./mock_tatolab_options";

afterEach(() => {
  vi.useRealTimers();
});

const MAIN = "pattern-main-bcd55b";
const PATTERN_FOLDER = "/Users/jonathanf/streams/pattern";

it("a drag on an input's value is live while it moves and one commit and one history entry on release, and the value shown follows the graph through an undo", async () => {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("")));
  const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
    await vi.advanceTimersByTimeAsync(100);
    return answering;
  };
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => backend.transactInTheOpenProject([...operations], sending.mode, sending.idempotencyKey),
    newGestureIdempotencyKey: () => "drag-of-the-amount",
  });
  const historyLength = async () => {
    const reading = await settled(backend.readOpenProjectTransactions());
    return reading.kind === "read" ? reading.project_transactions.transactions.length : -1;
  };
  const readTheGraph = async () => inputValues.takeTheGraphReading(PATTERN_FOLDER, await settled(backend.describeStreamGraph(MAIN)));
  const graph = await settled(backend.describeStreamGraph(MAIN));
  const invert = graph.nodes.find((node) => node.name === "invertingeffect");
  if (invert === undefined || graph.stream_asset === null) return expect.unreachable("the main stream holds the inverting effect");
  const amount: InputAddress = { graph: { project_folder: PATTERN_FOLDER, stream_asset: graph.stream_asset, level: [] }, node_id: invert.id, input: "amount" };
  inputValues.takeTheGraphReading(PATTERN_FOLDER, graph);
  expect(inputValues.shownValue(amount)).toEqual({ value: 1, comes_from: "default" });
  const entriesBefore = await historyLength();

  const drag = inputValues.beginGesture(amount, "commit");
  drag.move(0.8);
  await vi.advanceTimersByTimeAsync(10);
  drag.move(0.6);
  drag.move(0.4);
  await settled(Promise.resolve());
  await readTheGraph();
  expect(inputValues.shownValue(amount)).toEqual({ value: 0.4, comes_from: "live" });
  expect(await historyLength()).toBe(entriesBefore);
  drag.release(0.25);
  await settled(Promise.resolve());
  await readTheGraph();
  expect(inputValues.shownValue(amount)).toEqual({ value: 0.25, comes_from: "saved" });
  expect(await historyLength()).toBe(entriesBefore + 1);

  await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
  await readTheGraph();
  expect(inputValues.shownValue(amount)).toEqual({ value: 1, comes_from: "default" });
});
