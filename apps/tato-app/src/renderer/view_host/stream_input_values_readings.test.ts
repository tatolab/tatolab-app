import { expect, test } from "vitest";
import type { StreamGraphInputValueChange, StreamGraphInputValueRead, StreamGraphNode, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import { StreamInputValuesReadings } from "./stream_input_values_readings";
import type { StreamInputValuesReading } from "./studio_view_contract";
import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";

function graphNode(id: string, gain: StreamGraphInputValueRead | null, fragmentNodes: StreamGraphNode[] | null = null): StreamGraphNode {
  return {
    id,
    name: id.toLowerCase(),
    type: "nodes.mix:Mix",
    kind: "function",
    state: "Running",
    failed_because: null,
    process_raising_because: null,
    not_ready_because: null,
    config: {},
    pins: {},
    exposed_config_fields: [],
    input_ports: [
      { name: "gain", family: "channels", stream_facts: null, values_checked: null, pin: { pin_type: { type: "float" }, flow: "value" }, value_read: gain },
      { name: "video", family: "image", stream_facts: null, values_checked: null, pin: { pin_type: { type: "texture" }, flow: "stream" }, value_read: null },
    ],
    output_ports: [],
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    studio: NODE_STUDIO_FIELDS_NONE_SET,
    fragment: fragmentNodes === null ? null : { kind: "placed_stream", nodes: fragmentNodes, links: [], groups: [] },
    graph_interface: null, live: true,
  };
}

/** A graph reading of Mix on the stream's own level and Inner inside the subgraph Sub, each with its gain. */
const graphReading = (gain: StreamGraphInputValueRead, innerGain: StreamGraphInputValueRead = { value: 1, comes_from: "default" }): StreamGraphSummary => ({
  stream: "main",
  stream_asset: "STREAM-ASSET",
  groups: [],
  notes: [],
  nodes: [graphNode("MIX-ID", gain), graphNode("SUB-ID", null, [graphNode("INNER-ID", innerGain)])],
  links: [],
  graph_document_text: "{}",
});

const saved = (value: number): StreamGraphInputValueRead => ({ value, comes_from: "saved" });
const live = (value: number): StreamGraphInputValueRead => ({ value, comes_from: "live" });
const gainChanged = (value_read: StreamGraphInputValueRead, node = "MIX-ID"): StreamGraphInputValueChange => ({ node, input: "gain", value_read });

function watched(readings: StreamInputValuesReadings): StreamInputValuesReading[] {
  const told: StreamInputValuesReading[] = [];
  readings.watch((reading) => told.push(reading));
  return told;
}

test("a_watcher_is_told_every_input_that_holds_a_value_at_every_level_once_the_graph_is_read_and_then_each_change_on_its_own", () => {
  const readings = new StreamInputValuesReadings();
  const told = watched(readings);
  readings.takeTheChange(gainChanged(live(0.2)));
  expect(told).toEqual([]);
  readings.readStarting();
  readings.readLanded(graphReading(saved(0.5)));
  readings.takeTheChange(gainChanged(live(0.7)));
  readings.takeTheChange(gainChanged(live(0.3), "INNER-ID"));
  expect(told).toEqual([
    {
      kind: "values",
      stream_asset: "STREAM-ASSET",
      values: [
        { level: [], node_id: "MIX-ID", input: "gain", value_read: saved(0.5) },
        { level: ["SUB-ID"], node_id: "INNER-ID", input: "gain", value_read: { value: 1, comes_from: "default" } },
      ],
    },
    { kind: "changed", stream_asset: "STREAM-ASSET", change: { level: [], node_id: "MIX-ID", input: "gain", value_read: live(0.7) } },
    { kind: "changed", stream_asset: "STREAM-ASSET", change: { level: ["SUB-ID"], node_id: "INNER-ID", input: "gain", value_read: live(0.3) } },
  ]);
  const toldLater = watched(readings);
  expect(toldLater).toHaveLength(1);
  expect(toldLater[0]?.kind === "values" && toldLater[0].values[0]?.value_read).toEqual(live(0.7));
});

test("a_change_that_lands_during_a_read_is_applied_again_on_what_the_read_answers_and_one_from_before_it_started_is_not", () => {
  const readings = new StreamInputValuesReadings();
  readings.readStarting();
  readings.readLanded(graphReading(saved(0.5)));
  const told = watched(readings);
  readings.takeTheChange(gainChanged(live(0.6)));
  readings.readStarting();
  readings.takeTheChange(gainChanged(live(0.8)));
  readings.readLanded(graphReading(live(0.6)));
  const afterTheRead = told.at(-1);
  expect(afterTheRead?.kind === "values" && afterTheRead.values[0]?.value_read).toEqual(live(0.8));

  readings.readStarting();
  readings.readLanded(graphReading({ value: null, comes_from: "wire" }));
  const lastValues = told.at(-1);
  expect(lastValues?.kind === "values" && lastValues.values[0]?.value_read).toEqual({ value: null, comes_from: "wire" });
});

test("a_change_that_reads_what_is_kept_already_or_names_an_input_the_reading_does_not_hold_is_told_to_nobody_and_a_reading_like_the_last_neither", () => {
  const readings = new StreamInputValuesReadings();
  readings.readStarting();
  readings.readLanded(graphReading(saved(0.5)));
  const told = watched(readings);
  readings.takeTheChange(gainChanged(saved(0.5)));
  readings.takeTheChange({ node: "MIX-ID", input: "video", value_read: live(1) });
  readings.takeTheChange(gainChanged(live(1), "NEW-ID"));
  readings.readStarting();
  readings.readLanded(graphReading(saved(0.5)));
  readings.readStarting();
  readings.readLanded(null);
  expect(told).toHaveLength(1);
});
