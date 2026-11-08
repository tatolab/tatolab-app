import { afterEach, expect, test, vi } from "vitest";
import type { NodeCatalog, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import { StreamGraphAndCatalogReadings } from "./stream_graph_and_catalog_readings";
import type { NodeCatalogReading, StreamGraphReading } from "./studio_view_contract";

afterEach(() => {
  vi.useRealTimers();
});

const POLL_MILLISECONDS = 1000;

function graphOfTheTypes(stream: string, nodeTypes: string[]): StreamGraphSummary {
  return {
    stream,
    nodes: nodeTypes.map((type, index) => ({ id: `P${index}`, name: `n${index}`, type, state: null, config: {}, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} })),
    links: [],
    graph_document_text: "{}",
  };
}

/** A backend whose graph names `served.graphTypes` and whose catalog lists `served.catalogTypes`, or refuses in `served.catalogRefusal`, counting each read. */
function countingBackend() {
  const served: { graphTypes: string[]; catalogTypes: string[]; catalogRefusal: string | null } = { graphTypes: ["A"], catalogTypes: ["A"], catalogRefusal: null };
  const reads = { graph: 0, catalog: 0 };
  const backend = {
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
  return { backend, served, reads };
}

test("two_views_watching_one_stream_share_one_poll_and_a_reading_unchanged_tells_neither_again", async () => {
  vi.useFakeTimers();
  const { backend, reads } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend, POLL_MILLISECONDS);
  const firstView: StreamGraphReading[] = [];
  const secondView: StreamGraphReading[] = [];
  const stopFirst = readings.watchStreamGraph("main", (reading) => firstView.push(reading));
  const stopSecond = readings.watchStreamGraph("main", (reading) => secondView.push(reading));
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 3 + 10);
  expect(reads.graph).toBe(4);
  expect(firstView.map((reading) => reading.kind)).toEqual(["read"]);
  expect(secondView.map((reading) => reading.kind)).toEqual(["read"]);
  stopFirst();
  stopSecond();
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 3);
  expect(reads.graph).toBe(4);
});

test("a_hidden_window_reads_nothing_and_reads_again_once_shown", async () => {
  vi.useFakeTimers();
  const { backend, reads } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend, POLL_MILLISECONDS);
  readings.setPollingAllowed(false);
  readings.watchStreamGraph("main", () => undefined);
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 2);
  expect(reads.graph).toBe(0);
  readings.setPollingAllowed(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(reads.graph).toBe(1);
});

test("the_catalog_is_read_once_and_again_only_when_the_graph_names_a_type_it_lacks", async () => {
  vi.useFakeTimers();
  const { backend, served, reads } = countingBackend();
  const readings = new StreamGraphAndCatalogReadings(backend, POLL_MILLISECONDS);
  const catalogReadings: NodeCatalogReading[] = [];
  readings.watchNodeCatalog("main", (reading) => catalogReadings.push(reading));
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 2 + 10);
  expect(reads.catalog).toBe(1);
  served.graphTypes = ["A", "B"];
  served.catalogTypes = ["A", "B"];
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  expect(reads.catalog).toBe(2);
  expect(catalogReadings.map((reading) => (reading.kind === "listed" ? reading.catalog.node_types.map((entry) => entry.type) : reading.because))).toEqual([["A"], ["A", "B"]]);
});

test("a_refused_catalog_is_shown_in_the_runtimes_words_and_read_again", async () => {
  vi.useFakeTimers();
  const { backend, served, reads } = countingBackend();
  served.catalogRefusal = "no stream with the id `main` is loaded in this runtime";
  const readings = new StreamGraphAndCatalogReadings(backend, POLL_MILLISECONDS);
  const catalogReadings: NodeCatalogReading[] = [];
  readings.watchNodeCatalog("main", (reading) => catalogReadings.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  expect(catalogReadings).toEqual([{ kind: "not_listed", because: "no stream with the id `main` is loaded in this runtime" }]);
  served.catalogRefusal = null;
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  expect(reads.catalog).toBeGreaterThanOrEqual(2);
  expect(catalogReadings.at(-1)?.kind).toBe("listed");
});
