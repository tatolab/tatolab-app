// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { createInputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import { StreamGraphReadings } from "../src/renderer/view_host/stream_graph_readings";
import { createMockTatolabBackend } from "./mock_tatolab_backend";
import { readMockTatolabOptions } from "./mock_tatolab_options";

afterEach(() => {
  vi.useRealTimers();
});

const MAIN = "pattern-main-bcd55b";
const PATTERN_FOLDER = "/Users/jonathanf/streams/pattern";

it("a drag on an input's value is live while it moves, reads no graph, and is one commit and one history entry on release, and the value shown follows the graph through an undo", async () => {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("")));
  let graphReads = 0;
  const host = new StreamGraphReadings({
    ...backend,
    describeStreamGraph: (streamId) => {
      graphReads += 1;
      return backend.describeStreamGraph(streamId);
    },
  });
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
  host.takeTheStreamsListed((await settled(backend.getTatolabStatus())).streams);
  host.watchStreamInputValues(MAIN, (reading) => inputValues.takeTheInputValues(PATTERN_FOLDER, reading));
  const graph = await settled(backend.describeStreamGraph(MAIN));
  const invert = graph.nodes.find((node) => node.name === "invertingeffect");
  if (invert === undefined || typeof graph.asset !== "string") return expect.unreachable("the main stream holds the inverting effect");
  const amount: InputAddress = { graph: { project_folder: PATTERN_FOLDER, stream_asset: graph.asset, level: [] }, node_id: invert.id, input: "amount" };
  expect(inputValues.shownValue(amount)).toEqual({ value: 1, comes_from: "default" });
  const entriesBefore = await historyLength();
  const readsBeforeTheDrag = graphReads;

  const drag = inputValues.beginGesture(amount, "commit");
  drag.move(0.8);
  await vi.advanceTimersByTimeAsync(10);
  drag.move(0.6);
  drag.move(0.4);
  await settled(Promise.resolve());
  expect(inputValues.shownValue(amount)).toEqual({ value: 0.4, comes_from: "live" });
  expect(graphReads).toBe(readsBeforeTheDrag);
  expect(await historyLength()).toBe(entriesBefore);
  drag.release(0.25);
  await settled(Promise.resolve());
  expect(inputValues.shownValue(amount)).toEqual({ value: 0.25, comes_from: "saved" });
  expect(graphReads).toBe(readsBeforeTheDrag + 1);
  expect(await historyLength()).toBe(entriesBefore + 1);

  await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
  expect(inputValues.shownValue(amount)).toEqual({ value: 1, comes_from: "default" });
});

it("a value set live from outside the window shows in every frame's store with no graph read", async () => {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("")));
  let graphReads = 0;
  const host = new StreamGraphReadings({
    ...backend,
    describeStreamGraph: (streamId) => {
      graphReads += 1;
      return backend.describeStreamGraph(streamId);
    },
  });
  const storeOfAFrame = () => createInputValues({ transactInTheProject: (_projectFolder, operations, sending) => backend.transactInTheOpenProject([...operations], sending.mode, sending.idempotencyKey), newGestureIdempotencyKey: () => "never" });
  const canvas = storeOfAFrame();
  const properties = storeOfAFrame();
  host.watchStreamInputValues(MAIN, (reading) => canvas.takeTheInputValues(PATTERN_FOLDER, reading));
  host.watchStreamInputValues(MAIN, (reading) => properties.takeTheInputValues(PATTERN_FOLDER, reading));
  const reading = backend.describeStreamGraph(MAIN);
  await vi.advanceTimersByTimeAsync(100);
  const graph = await reading;
  const invert = graph.nodes.find((node) => node.name === "invertingeffect");
  if (invert === undefined || typeof graph.asset !== "string") return expect.unreachable("the main stream holds the inverting effect");
  const amount: InputAddress = { graph: { project_folder: PATTERN_FOLDER, stream_asset: graph.asset, level: [] }, node_id: invert.id, input: "amount" };
  const readsBeforeTheSet = graphReads;

  const setFromAShell = backend.transactInTheOpenProject([{ operation: "set_node_input_value", stream: graph.asset, node: invert.id, input: "amount", value: 0.3 }], "live", null);
  await vi.advanceTimersByTimeAsync(100);
  await setFromAShell;
  expect(canvas.shownValue(amount)).toEqual({ value: 0.3, comes_from: "live" });
  expect(properties.shownValue(amount)).toEqual({ value: 0.3, comes_from: "live" });
  expect(graphReads).toBe(readsBeforeTheSet);
});

it("a drag on a Graph Input's value released live in Perform leaves no history entry, and Back to saved shows its default again", async () => {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("graph_inputs=declared")));
  const host = new StreamGraphReadings(backend);
  const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
    await vi.advanceTimersByTimeAsync(100);
    return answering;
  };
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => backend.transactInTheOpenProject([...operations], sending.mode, sending.idempotencyKey),
    newGestureIdempotencyKey: () => "never-committed",
  });
  const historyLength = async () => {
    const reading = await settled(backend.readOpenProjectTransactions());
    return reading.kind === "read" ? reading.project_transactions.transactions.length : -1;
  };
  host.watchStreamInputValues(MAIN, (reading) => inputValues.takeTheInputValues(PATTERN_FOLDER, reading));
  const graph = await settled(backend.describeStreamGraph(MAIN));
  const brightnessInput = graph.nodes.find((node) => node.components.graph_interface?.port === "brightness");
  if (brightnessInput === undefined || typeof graph.asset !== "string") return expect.unreachable("the main stream declares brightness");
  const brightness: InputAddress = { graph: { project_folder: PATTERN_FOLDER, stream_asset: graph.asset, level: [] }, node_id: brightnessInput.id, input: "value" };
  expect(inputValues.shownValue(brightness)).toEqual({ value: 0.5, comes_from: "default" });
  const entriesBefore = await historyLength();

  const drag = inputValues.beginGesture(brightness, "live");
  drag.move(0.7);
  await settled(Promise.resolve());
  drag.release(0.9);
  await settled(Promise.resolve());
  expect(inputValues.shownValue(brightness)).toEqual({ value: 0.9, comes_from: "live" });
  expect(await historyLength()).toBe(entriesBefore);
  expect((await settled(backend.describeStreamGraph(MAIN))).nodes.find((node) => node.id === brightnessInput.id)?.components.graph_interface?.current_value).toBe(0.9);

  inputValues.clear(brightness, "live");
  await settled(Promise.resolve());
  expect(inputValues.shownValue(brightness)).toEqual({ value: 0.5, comes_from: "default" });
  expect(await historyLength()).toBe(entriesBefore);
});
