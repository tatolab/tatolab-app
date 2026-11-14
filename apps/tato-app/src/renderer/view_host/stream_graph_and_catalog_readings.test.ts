import { afterEach, expect, test, vi } from "vitest";
import type { NodeCatalog, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import { StreamGraphAndCatalogReadings } from "./stream_graph_and_catalog_readings";
import type { NodeCatalogReading, StreamGraphReading } from "./studio_view_contract";
import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";

afterEach(() => {
  vi.useRealTimers();
});

function graphOfTheTypes(stream: string, nodeTypes: string[]): StreamGraphSummary {
  return {
    stream,
    nodes: nodeTypes.map((type, index) => ({ id: `P${index}`, name: `n${index}`, type, kind: "process", state: null, failed_because: null, process_raising_because: null, config: {}, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {}, pins: {}, exposed_config_fields: [], studio: NODE_STUDIO_FIELDS_NONE_SET, fragment: null, graph_interface: null })),
    links: [],
    stream_asset: null,
    groups: [],
    notes: [],
    graph_document_text: "{}",
  };
}

/** A backend whose graph names `served.graphTypes` and whose catalog lists `served.catalogTypes`, or refuses in `served.catalogRefusal`, counting each read, recording the streams followed, and pushing a graph change with `pushTheStreamGraphChanged`. */
function countingBackend() {
  const served: { graphTypes: string[]; catalogTypes: string[]; catalogRefusal: string | null } = { graphTypes: ["A"], catalogTypes: ["A"], catalogRefusal: null };
  const reads = { graph: 0, catalog: 0 };
  const streamsFollowed = new Set<string>();
  const streamGraphChangedListeners = new Set<(stream: string) => void>();
  const pushTheStreamGraphChanged = (stream: string) => {
    for (const listener of streamGraphChangedListeners) listener(stream);
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
    onStreamGraphChanged: (listener: (stream: string) => void): (() => void) => {
      streamGraphChangedListeners.add(listener);
      return () => streamGraphChangedListeners.delete(listener);
    },
    describeStreamGraph: (stream: string): Promise<StreamGraphSummary> => {
      reads.graph += 1;
      return Promise.resolve(graphOfTheTypes(stream, served.graphTypes));
    },
    describeNodeCatalog: (stream: string): Promise<NodeCatalog> => {
      reads.catalog += 1;
      if (served.catalogRefusal !== null) return Promise.reject(new Error(served.catalogRefusal));
      return Promise.resolve({ stream, node_types: served.catalogTypes.map((type) => ({ type, description: "", config_schema: null, inputs: [], outputs: [] })) });
    },
  };
  return { backend, served, reads, streamsFollowed, pushTheStreamGraphChanged };
}

test("two_views_watching_one_stream_share_one_read_and_nothing_is_read_again_until_a_change_is_pushed", async () => {
  vi.useFakeTimers();
  const { backend, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend);
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

test("changes_pushed_while_a_read_is_in_flight_read_the_graph_once_more_after_it", async () => {
  const { backend, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend);
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
  const readings = new StreamGraphAndCatalogReadings(backend);
  readings.setReadingAllowed(false);
  readings.watchStreamGraph("main", () => undefined);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(0);
  readings.setReadingAllowed(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(1);
});

test("the_catalog_is_read_once_and_again_only_when_the_graph_names_a_type_it_lacks", async () => {
  vi.useFakeTimers();
  const { backend, served, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend);
  const catalogReadings: NodeCatalogReading[] = [];
  readings.watchNodeCatalog("main", (reading) => catalogReadings.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.catalog).toBe(1);
  served.graphTypes = ["A", "B"];
  served.catalogTypes = ["A", "B"];
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.catalog).toBe(2);
  expect(catalogReadings.map((reading) => (reading.kind === "listed" ? reading.catalog.node_types.map((entry) => entry.type) : reading.because))).toEqual([["A"], ["A", "B"]]);
});

test("a_refused_catalog_is_shown_in_the_runtimes_words_and_read_again_on_the_next_change", async () => {
  vi.useFakeTimers();
  const { backend, served, reads, pushTheStreamGraphChanged } = countingBackend();
  served.catalogRefusal = "no stream with the id `main` is loaded in this runtime";
  const readings = new StreamGraphAndCatalogReadings(backend);
  const catalogReadings: NodeCatalogReading[] = [];
  readings.watchNodeCatalog("main", (reading) => catalogReadings.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  expect(catalogReadings).toEqual([{ kind: "not_listed", because: "no stream with the id `main` is loaded in this runtime" }]);
  served.catalogRefusal = null;
  pushTheStreamGraphChanged("main");
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.catalog).toBeGreaterThanOrEqual(2);
  expect(catalogReadings.at(-1)?.kind).toBe("listed");
});

test("a_pushed_change_reads_the_graph_at_once", async () => {
  vi.useFakeTimers();
  const { backend, served, reads, pushTheStreamGraphChanged } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend);
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
  const readings = new StreamGraphAndCatalogReadings(backend);
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
