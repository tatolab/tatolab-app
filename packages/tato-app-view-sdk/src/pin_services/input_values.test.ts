import { expect, test } from "vitest";
import type { InputAddress } from "../pin_model/node_inputs.js";
import { NODE_STUDIO_FIELDS_NONE_SET, type GraphEditMode, type JsonValue, type ProjectGraphTransactionApplying, type StreamGraphAction, type StreamGraphInputValueRead, type StreamGraphNode, type StreamGraphSummary } from "../studio_readings.js";
import { createInputValues, type ShownValue } from "./input_values.js";

const PROJECT = "/projects/demo";
const STREAM_ASSET = "11111111-2222-3333-4444-555555555555";
const GAIN: InputAddress = { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: "MIX-ID", input: "gain" };
const INSIDE: InputAddress = { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: ["SUB-ID"] }, node_id: "INNER-ID", input: "gain" };

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
    graph_interface: null,
  };
}

const graphReading = (gain: StreamGraphInputValueRead | null, innerGain: StreamGraphInputValueRead | null = null): StreamGraphSummary => ({
  stream: "main",
  stream_asset: STREAM_ASSET,
  groups: [],
  notes: [],
  nodes: [graphNode("MIX-ID", gain), graphNode("SUB-ID", null, [graphNode("INNER-ID", innerGain)])],
  links: [],
  graph_document_text: "{}",
});

const saved = (value: JsonValue): StreamGraphInputValueRead => ({ value, comes_from: "saved" });

interface TransactionSent {
  project_folder: string;
  operations: readonly StreamGraphAction[];
  mode: GraphEditMode;
  idempotency_key: string | null;
}

/** A store over a connection that holds each transaction until the test answers it, in the order sent. */
function storeOverAHeldConnection() {
  const sent: TransactionSent[] = [];
  const answers: ((applying: ProjectGraphTransactionApplying) => void)[] = [];
  let gesturesBegun = 0;
  const inputValues = createInputValues({
    transactInTheProject: (projectFolder, operations, sending) => {
      sent.push({ project_folder: projectFolder, operations, mode: sending.mode, idempotency_key: sending.idempotencyKey });
      return new Promise((answer) => answers.push(answer));
    },
    newGestureIdempotencyKey: () => `gesture-${(gesturesBegun += 1)}`,
  });
  const answerTheNext = async (applying: ProjectGraphTransactionApplying = { kind: "applied", transaction: { mode: "commit", transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } }) => {
    answers.shift()?.(applying);
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  };
  return { inputValues, sent, answerTheNext };
}

function valuesShownAt(inputValues: ReturnType<typeof createInputValues>, address: InputAddress): ShownValue[] {
  const shown: ShownValue[] = [];
  inputValues.watchValue(address, (value) => shown.push(value));
  return shown;
}

test("an_input_shows_the_value_its_graph_reading_gives_and_follows_each_new_reading_as_an_edit_or_an_undo_makes_it", () => {
  const { inputValues } = storeOverAHeldConnection();
  const shown = valuesShownAt(inputValues, GAIN);
  inputValues.takeTheGraphReading(PROJECT, graphReading({ value: 1, comes_from: "default" }, saved(0.25)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 1, comes_from: "default" });
  expect(inputValues.shownValue(INSIDE)).toEqual({ value: 0.25, comes_from: "saved" });
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  inputValues.takeTheGraphReading(PROJECT, graphReading({ value: 1, comes_from: "default" }));
  inputValues.takeTheGraphReading(PROJECT, graphReading({ value: null, comes_from: "wire" }));
  expect(shown).toEqual([
    { value: null, comes_from: null },
    { value: 1, comes_from: "default" },
    { value: 0.5, comes_from: "saved" },
    { value: 1, comes_from: "default" },
    { value: null, comes_from: "wire" },
  ]);
});

test("a_drag_shows_each_value_at_once_and_its_release_is_one_commit_under_the_gestures_key", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.6, comes_from: "live" });
  gesture.move(0.7);
  gesture.move(0.8);
  gesture.release(0.9);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.9, comes_from: "saved" });
  await answerTheNext();
  await answerTheNext();
  const setGain = (value: number): StreamGraphAction => ({ operation: "set_node_input_value", stream: STREAM_ASSET, node: "MIX-ID", input: "gain", value });
  expect(sent).toEqual([
    { project_folder: PROJECT, operations: [setGain(0.6)], mode: "live", idempotency_key: null },
    { project_folder: PROJECT, operations: [setGain(0.9)], mode: "commit", idempotency_key: "gesture-1" },
  ]);
});

test("a_reading_that_lands_while_a_gesture_is_open_does_not_move_its_value_and_the_value_sent_is_held_until_a_reading_shows_it", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.1)));
  expect(inputValues.shownValue(GAIN).value).toBe(0.6);
  gesture.release(0.9);
  await answerTheNext();
  inputValues.takeTheGraphReading(PROJECT, graphReading({ value: 0.6, comes_from: "live" }));
  expect(inputValues.shownValue(GAIN).value).toBe(0.9);
  await answerTheNext();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.9)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.9, comes_from: "saved" });
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.2)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.2, comes_from: "saved" });
});

test("a_value_sent_ahead_gives_way_to_the_runtimes_once_a_second_reading_after_its_answer_still_differs", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  inputValues.beginGesture(GAIN, "commit").release(0.9);
  await answerTheNext();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  expect(inputValues.shownValue(GAIN).value).toBe(0.9);
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.3)));
  expect(inputValues.shownValue(GAIN).value).toBe(0.3);
});

test("a_refused_commit_shows_the_value_the_graph_reads_again_and_keeps_the_runtimes_words", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  const refusals: (string | null)[] = [];
  inputValues.watchRefusal(GAIN, (refusal) => refusals.push(refusal));
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  inputValues.beginGesture(GAIN, "commit").release(7);
  await answerTheNext({ kind: "not_sent", because: "input_value_not_valid: 7 is above the range" });
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  inputValues.beginGesture(GAIN, "commit").release(0.75);
  await answerTheNext();
  expect(refusals).toEqual([null, "input_value_not_valid: 7 is above the range", null]);
});

test("below_a_streams_own_level_a_drag_sends_only_its_commit_with_the_level", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5), saved(0.25)));
  const gesture = inputValues.beginGesture(INSIDE, "commit");
  gesture.move(0.3);
  gesture.move(0.4);
  expect(inputValues.shownValue(INSIDE).value).toBe(0.4);
  expect(sent).toEqual([]);
  gesture.release(0.45);
  await answerTheNext();
  expect(sent).toEqual([
    { project_folder: PROJECT, operations: [{ operation: "set_node_input_value", stream: STREAM_ASSET, level: ["SUB-ID"], node: "INNER-ID", input: "gain", value: 0.45 }], mode: "commit", idempotency_key: "gesture-1" },
  ]);
});

test("a_cancelled_drag_goes_back_live_to_where_it_began_and_commits_nothing", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  gesture.move(0.7);
  gesture.cancel();
  gesture.release(0.8);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  await answerTheNext();
  await answerTheNext();
  expect(sent.map(({ operations, mode }) => [mode, operations[0]?.operation === "set_node_input_value" ? operations[0].value : undefined])).toEqual([
    ["live", 0.6],
    ["live", 0.5],
  ]);
});

test("a_gesture_released_live_sends_its_last_value_live_and_records_nothing", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheGraphReading(PROJECT, graphReading(saved(0.5)));
  inputValues.beginGesture(GAIN, "live").release(0.8);
  await answerTheNext();
  expect(sent.map(({ mode, idempotency_key }) => [mode, idempotency_key])).toEqual([["live", null]]);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.8, comes_from: "live" });
});
