import { afterEach, expect, test, vi } from "vitest";
import type { ListedStream, StreamGraphInputValueChange, StreamGraph } from "../../shared/tatolab_backend_contract";
import { StreamGraphReadings } from "./stream_graph_readings";
import type { ProjectTransactionsReading, StreamGraphReading, StreamInputValuesReading } from "./studio_view_contract";
import { aGraphNode, aGraphPort, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";

afterEach(() => {
  vi.useRealTimers();
});

/** A graph of one node of each type, each with a `gain` input reading `gain`, saved. */
function graphOfTheTypes(stream: string, nodeTypes: string[], gain: number): StreamGraph {
  const gainInput = aGraphPort("gain", "channels", { value: gain, value_comes_from: "saved" });
  return aStreamGraph(
    nodeTypes.map((type, index) => aGraphNode(`n${index}`, { id: `P${index}`, type, kind: "process", config: {}, inputs: [gainInput] })),
    [],
    { stream, asset: "STREAM-ASSET" },
  );
}

/** A backend whose graph names `served.graphTypes`, each node's gain reading `served.gain`, counting each read, recording the streams followed, and pushing a graph change with `pushTheStreamGraphChanged`. */
function countingBackend() {
  const served: { graphTypes: string[]; gain: number } = { graphTypes: ["A"], gain: 0.5 };
  const reads = { graph: 0 };
  const streamsFollowed = new Set<string>();
  const streamGraphChangedListeners = new Set<(stream: string, inputValueChange: StreamGraphInputValueChange | null) => void>();
  const pushTheStreamGraphChanged = (stream: string, inputValueChange: StreamGraphInputValueChange | null = null) => {
    for (const listener of streamGraphChangedListeners) listener(stream, inputValueChange);
  };
  const projectTransactionsListeners = new Set<(reading: ProjectTransactionsReading) => void>();
  const announceAProjectTransaction = () => {
    for (const listener of projectTransactionsListeners) listener({ kind: "not_read", because: "a transaction was announced" });
  };
  const backend = {
    followStreamGraphChanges: (stream: string): Promise<void> => {
      streamsFollowed.add(stream);
      return Promise.resolve();
    },
    stopFollowingStreamGraphChanges: (stream: string): Promise<void> => {
      streamsFollowed.delete(stream);
      return Promise.resolve();
    },
    onStreamGraphChanged: (listener: (stream: string, inputValueChange: StreamGraphInputValueChange | null) => void): (() => void) => {
      streamGraphChangedListeners.add(listener);
      return () => streamGraphChangedListeners.delete(listener);
    },
    onProjectTransactionsChanged: (listener: (reading: ProjectTransactionsReading) => void): (() => void) => {
      projectTransactionsListeners.add(listener);
      return () => projectTransactionsListeners.delete(listener);
    },
    describeStreamGraph: (stream: string): Promise<StreamGraph> => {
      reads.graph += 1;
      return Promise.resolve(graphOfTheTypes(stream, served.graphTypes, served.gain));
    },
  };
  return { backend, served, reads, streamsFollowed, pushTheStreamGraphChanged, announceAProjectTransaction };
}

test("two_views_watching_one_stream_share_one_read_and_nothing_is_read_again_until_a_change_is_pushed", async () => {
  vi.useFakeTimers();
  const { backend, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const firstView: StreamGraphReading[] = [];
  const secondView: StreamGraphReading[] = [];
  const stopFirst = readings.watchStreamGraph("main", (reading) => firstView.push(reading));
  const stopSecond = readings.watchStreamGraph("main", (reading) => secondView.push(reading));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(reads.graph).toBe(1);
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(2);
  expect(firstView.map((reading) => reading.kind)).toEqual(["read"]);
  expect(secondView.map((reading) => reading.kind)).toEqual(["read"]);
  stopFirst();
  stopSecond();
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(2);
});

function listedStreamLoaded(stream: string, load: "loaded" | "not_loaded"): ListedStream {
  return {
    stream,
    display_name: stream,
    location: null,
    state: load === "loaded" ? "running" : "stopped",
    node_count: null,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    condition: { load, playback: load === "loaded" ? "playing" : "stopped", health: "healthy", diagnostics: [] },
    action: null,
    step: null,
  };
}

test("each_transaction_the_projects_feed_announces_reads_again_the_graph_of_each_watched_stream_the_runtime_does_not_list_loaded_and_a_load_or_unload_reads_it_again", async () => {
  vi.useFakeTimers();
  const { backend, served, reads, announceAProjectTransaction } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const closedView: StreamGraphReading[] = [];
  readings.watchStreamGraph("closed", (reading) => closedView.push(reading));
  readings.watchStreamGraph("playing", () => undefined);
  await vi.advanceTimersByTimeAsync(10);
  readings.takeTheStreamsListed([listedStreamLoaded("closed", "not_loaded"), listedStreamLoaded("playing", "loaded")]);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(3);
  served.graphTypes = ["A", "B"];
  announceAProjectTransaction();
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(4);
  readings.takeTheStreamsListed([listedStreamLoaded("closed", "not_loaded"), listedStreamLoaded("playing", "not_loaded")]);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(5);
  expect(closedView.map((reading) => (reading.kind === "read" ? reading.graph.nodes.length : reading.because))).toEqual([1, 2]);
});

test("changes_pushed_while_a_read_is_in_flight_read_the_graph_once_more_after_it", async () => {
  const { backend, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  readings.watchStreamGraph("main", () => undefined);
  pushTheStreamGraphChanged("main");
  pushTheStreamGraphChanged("main");
  pushTheStreamGraphChanged("main");
  await vi.waitFor(() => expect(reads.graph).toBe(2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(reads.graph).toBe(2);
});

test("a_hidden_window_reads_nothing_and_reads_again_once_shown", async () => {
  vi.useFakeTimers();
  const { backend, reads } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  readings.setReadingAllowed(false);
  readings.watchStreamGraph("main", () => undefined);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(0);
  readings.setReadingAllowed(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(1);
});

test("a_pushed_change_reads_the_graph_at_once", async () => {
  vi.useFakeTimers();
  const { backend, served, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const graphReadings: StreamGraphReading[] = [];
  readings.watchStreamGraph("main", (reading) => graphReadings.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(1);
  served.graphTypes = ["A", "B"];
  pushTheStreamGraphChanged("main");
  pushTheStreamGraphChanged("another-stream");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(2);
  expect(graphReadings.map((reading) => (reading.kind === "read" ? reading.graph.nodes.map((node) => node.type) : reading.because))).toEqual([["A"], ["A", "B"]]);
});

test("a_stream_is_followed_while_a_view_watches_it_and_the_window_is_shown", async () => {
  vi.useFakeTimers();
  const { backend, reads, streamsFollowed, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const stopWatching = readings.watchStreamGraph("main", () => undefined);
  expect([...streamsFollowed]).toEqual(["main"]);
  readings.setReadingAllowed(false);
  expect([...streamsFollowed]).toEqual([]);
  await vi.advanceTimersByTimeAsync(10);
  const readsWhileHidden = reads.graph;
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(readsWhileHidden);
  readings.setReadingAllowed(true);
  expect([...streamsFollowed]).toEqual(["main"]);
  stopWatching();
  expect([...streamsFollowed]).toEqual([]);
});

test("a_value_change_the_runtime_pushes_reaches_every_view_watching_the_streams_values_and_reads_no_graph", async () => {
  vi.useFakeTimers();
  const { backend, reads, streamsFollowed, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const canvasValues: StreamInputValuesReading[] = [];
  const propertiesValues: StreamInputValuesReading[] = [];
  const stopTheCanvas = readings.watchStreamInputValues("main", (reading) => canvasValues.push(reading));
  readings.watchStreamInputValues("main", (reading) => propertiesValues.push(reading));
  expect([...streamsFollowed]).toEqual(["main"]);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(1);
  for (const value of [0.6, 0.7, 0.8]) pushTheStreamGraphChanged("main", { node: "P0", input: "gain", member: null, value_read: { value, comes_from: "live" } });
  pushTheStreamGraphChanged("another-stream", { node: "P0", input: "gain", member: null, value_read: { value: 0.1, comes_from: "live" } });
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(1);
  const changedTo = (told: StreamInputValuesReading[]) => told.map((reading) => (reading.kind === "values" ? reading.values.map((value) => value.value_read.value) : reading.change.value_read.value));
  expect(changedTo(canvasValues)).toEqual([[0.5], 0.6, 0.7, 0.8]);
  expect(changedTo(propertiesValues)).toEqual([[0.5], 0.6, 0.7, 0.8]);
  stopTheCanvas();
  expect([...streamsFollowed]).toEqual(["main"]);
});

test("a_value_change_pushed_while_the_graph_is_read_again_is_kept_over_what_that_read_answers", async () => {
  vi.useFakeTimers();
  const { backend, served, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const told: StreamInputValuesReading[] = [];
  readings.watchStreamInputValues("main", (reading) => told.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  served.gain = 0.6;
  pushTheStreamGraphChanged("main");
  pushTheStreamGraphChanged("main", { node: "P0", input: "gain", member: null, value_read: { value: 0.9, comes_from: "live" } });
  await vi.advanceTimersByTimeAsync(10);
  const last = told.at(-1);
  expect(last?.kind === "values" && last.values[0]?.value_read).toEqual({ value: 0.9, comes_from: "live" });
});

test("a_node_a_commit_adds_has_its_values_told_before_the_graph_that_draws_it", async () => {
  vi.useFakeTimers();
  const { backend, served, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphReadings(backend);
  const told: string[] = [];
  readings.watchStreamGraph("main", (reading) => told.push(reading.kind === "read" ? `graph ${reading.graph.nodes.length}` : reading.kind));
  readings.watchStreamInputValues("main", (reading) => told.push(reading.kind === "values" ? `values ${reading.values.length}` : reading.kind));
  await vi.advanceTimersByTimeAsync(10);
  served.graphTypes = ["A", "B"];
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(told).toEqual(["values 1", "graph 1", "values 2", "graph 2"]);
});

test("a_graph_whose_node_holds_a_config_checksum_past_the_exact_doubles_is_read_and_its_same_reading_tells_no_one_again", async () => {
  vi.useFakeTimers();
  const { backend, reads, pushTheStreamGraphChanged } = countingBackend();
  const graphWithAChecksum = (stream: string): StreamGraph =>
    aStreamGraph([aGraphNode("n0", { id: "P0", type: "A", kind: "process", config: {}, config_checksum: 6086514543335466803n })], [], { stream, asset: "STREAM-ASSET" });
  const readings = new StreamGraphReadings({ ...backend, describeStreamGraph: (stream) => backend.describeStreamGraph(stream).then(() => graphWithAChecksum(stream)) });
  const view: StreamGraphReading[] = [];
  const stop = readings.watchStreamGraph("main", (reading) => view.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(2);
  expect(view).toHaveLength(1);
  const [reading] = view;
  expect(reading?.kind === "read" ? reading.graph.nodes[0]?.config_checksum : null).toBe(6086514543335466803n);
  stop();
});
