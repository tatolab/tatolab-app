import { expect, test } from "vitest";
import type { InputAddress } from "../pin_model/node_inputs.js";
import type { GraphEditMode, JsonValue, ProjectGraphTransactionApplying, StreamGraphAction, StreamGraphInputValueRead, StreamInputValuesReading } from "../studio_readings.js";
import { createInputValues, type ShownValue } from "./input_values.js";

const PROJECT = "/projects/demo";
const STREAM_ASSET = "11111111-2222-3333-4444-555555555555";
const GAIN: InputAddress = { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: "MIX-ID", input: "gain" };
const INSIDE: InputAddress = { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: ["SUB-ID"] }, node_id: "INNER-ID", input: "gain" };

/** Every input's value as the host keeps it: Mix's gain on the stream's own level, and the gain of a node inside a subgraph. */
const valuesRead = (gain: StreamGraphInputValueRead | null, innerGain: StreamGraphInputValueRead | null = null): StreamInputValuesReading => ({
  kind: "values",
  stream_asset: STREAM_ASSET,
  values: [
    ...(gain === null ? [] : [{ level: [], node_id: "MIX-ID", input: "gain", value_read: gain }]),
    ...(innerGain === null ? [] : [{ level: ["SUB-ID"], node_id: "INNER-ID", input: "gain", value_read: innerGain }]),
  ],
});

/** A change the runtime announced of Mix's gain. */
const gainChanged = (value_read: StreamGraphInputValueRead): StreamInputValuesReading => ({ kind: "changed", stream_asset: STREAM_ASSET, change: { level: [], node_id: "MIX-ID", input: "gain", value_read } });

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

test("an_input_shows_the_value_the_host_keeps_for_it_and_follows_each_new_reading_as_an_edit_or_an_undo_makes_it", () => {
  const { inputValues } = storeOverAHeldConnection();
  const shown = valuesShownAt(inputValues, GAIN);
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: 1, comes_from: "default" }, saved(0.25)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 1, comes_from: "default" });
  expect(inputValues.shownValue(INSIDE)).toEqual({ value: 0.25, comes_from: "saved" });
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: 1, comes_from: "default" }));
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: null, comes_from: "wire" }));
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
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
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
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.1)));
  expect(inputValues.shownValue(GAIN).value).toBe(0.6);
  gesture.release(0.9);
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: 0.6, comes_from: "live" }));
  expect(inputValues.shownValue(GAIN).value).toBe(0.9);
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.9)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.9, comes_from: "saved" });
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.2)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.2, comes_from: "saved" });
});

test("a_value_sent_ahead_gives_way_to_the_runtimes_once_a_second_reading_after_its_answer_still_differs", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.beginGesture(GAIN, "commit").release(0.9);
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  expect(inputValues.shownValue(GAIN).value).toBe(0.9);
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.3)));
  expect(inputValues.shownValue(GAIN).value).toBe(0.3);
});

test("a_refused_commit_shows_the_value_the_graph_reads_again_and_keeps_the_runtimes_words", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  const refusals: (string | null)[] = [];
  inputValues.watchRefusal(GAIN, (refusal) => refusals.push(refusal));
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.beginGesture(GAIN, "commit").release(7);
  await answerTheNext({ kind: "not_sent", because: "input_value_not_valid: 7 is above the range" });
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  inputValues.beginGesture(GAIN, "commit").release(0.75);
  await answerTheNext();
  expect(refusals).toEqual([null, "input_value_not_valid: 7 is above the range", null]);
});

test("below_a_streams_own_level_a_drag_sends_only_its_commit_with_the_level", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5), saved(0.25)));
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

test("a_drag_of_a_setting_that_rebuilds_its_node_shows_each_value_at_once_and_sends_only_its_release_as_one_commit", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const gesture = inputValues.beginGesture(GAIN, "commit_alone");
  gesture.move(0.6);
  gesture.move(0.7);
  expect(inputValues.shownValue(GAIN).value).toBe(0.7);
  expect(sent).toEqual([]);
  gesture.release(0.8);
  await answerTheNext();
  expect(sent).toEqual([{ project_folder: PROJECT, operations: [{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "MIX-ID", input: "gain", value: 0.8 }], mode: "commit", idempotency_key: "gesture-1" }]);
});

/** The mode and value of each `set_node_input_value` sent, in order. */
const valuesSent = (sent: readonly TransactionSent[]) => sent.map(({ operations, mode }) => [mode, operations[0]?.operation === "set_node_input_value" ? operations[0].value : undefined]);

test("a_cancelled_drag_that_began_on_a_saved_value_takes_its_live_value_off_and_commits_nothing", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  gesture.move(0.7);
  gesture.cancel();
  gesture.release(0.8);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  await answerTheNext();
  await answerTheNext();
  expect(valuesSent(sent)).toEqual([
    ["live", 0.6],
    ["live", null],
  ]);
});

test("a_cancelled_drag_that_began_on_the_default_takes_its_live_value_off_and_one_that_began_live_goes_back_to_it", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: 1, comes_from: "default" }));
  const fromTheDefault = inputValues.beginGesture(GAIN, "commit");
  fromTheDefault.move(0.6);
  fromTheDefault.cancel();
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 1, comes_from: "default" });
  await answerTheNext();
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: 0.3, comes_from: "live" }));
  const fromALiveValue = inputValues.beginGesture(GAIN, "live");
  fromALiveValue.move(0.4);
  fromALiveValue.cancel();
  await answerTheNext();
  await answerTheNext();
  expect(valuesSent(sent)).toEqual([
    ["live", 0.6],
    ["live", null],
    ["live", 0.4],
    ["live", 0.3],
  ]);
});

test("a_refused_live_write_a_waiting_commit_overtook_keeps_the_value_sent_ahead_shown", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const shown = valuesShownAt(inputValues, GAIN);
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  gesture.release(0.9);
  await answerTheNext({ kind: "not_sent", because: "the stream is stopped" });
  expect(inputValues.shownValue(GAIN).value).toBe(0.9);
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.9)));
  expect(shown.map(({ value }) => value)).toEqual([0.5, 0.6, 0.9]);
});

test("a_linked_input_is_held_only_where_the_store_already_holds_it_and_an_input_gone_from_the_stream_that_nothing_watches_is_forgotten", () => {
  const { inputValues } = storeOverAHeldConnection();
  const wiredOnly = valuesRead({ value: null, comes_from: "wire" });
  inputValues.takeTheInputValues(PROJECT, wiredOnly);
  const shown = valuesShownAt(inputValues, GAIN);
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.takeTheInputValues(PROJECT, wiredOnly);
  expect(shown).toEqual([
    { value: null, comes_from: null },
    { value: 0.5, comes_from: "saved" },
    { value: null, comes_from: "wire" },
  ]);
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5), saved(0.25)));
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  expect(inputValues.shownValue(INSIDE)).toEqual({ value: null, comes_from: null });
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
});

test("a_gesture_released_live_sends_its_last_value_live_and_records_nothing", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.beginGesture(GAIN, "live").release(0.8);
  await answerTheNext();
  expect(sent.map(({ mode, idempotency_key }) => [mode, idempotency_key])).toEqual([["live", null]]);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.8, comes_from: "live" });
});

test("clearing_an_input_commits_its_value_off_under_a_new_key_and_shows_it_at_its_default_until_a_reading_gives_that_default", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.clear(GAIN, "commit");
  expect(inputValues.shownValue(GAIN)).toEqual({ value: null, comes_from: "default" });
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: null, comes_from: "default" });
  inputValues.takeTheInputValues(PROJECT, valuesRead({ value: 1, comes_from: "default" }));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 1, comes_from: "default" });
  expect(sent).toEqual([{ project_folder: PROJECT, operations: [{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "MIX-ID", input: "gain", value: null }], mode: "commit", idempotency_key: "gesture-1" }]);
});

test("two_clears_in_a_row_send_one_commit_and_clearing_an_input_at_its_default_sends_nothing", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5), { value: 1, comes_from: "default" }));
  inputValues.clear(GAIN, "commit");
  inputValues.clear(GAIN, "commit");
  inputValues.clear(INSIDE, "commit");
  await answerTheNext();
  await answerTheNext();
  expect(sent.map((transaction) => transaction.operations)).toEqual([[{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "MIX-ID", input: "gain", value: null }]]);
});

test("clearing_an_input_ends_a_gesture_open_on_it_so_its_release_sends_nothing_more", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5), saved(0.25)));
  const gesture = inputValues.beginGesture(INSIDE, "commit");
  gesture.move(0.4);
  inputValues.clear(INSIDE, "commit");
  gesture.release(0.9);
  await answerTheNext();
  await answerTheNext();
  expect(sent.map((transaction) => [transaction.operations, transaction.mode])).toEqual([
    [[{ operation: "set_node_input_value", stream: STREAM_ASSET, level: ["SUB-ID"], node: "INNER-ID", input: "gain", value: null }], "commit"],
  ]);
});

test("back_to_saved_sends_a_live_null_recorded_nowhere_and_shows_the_live_value_until_the_runtime_reads_the_saved_one_and_sends_nothing_off_a_saved_value", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  inputValues.clear(GAIN, "live");
  expect(sent).toEqual([]);
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.8, comes_from: "live" }));
  const gesture = inputValues.beginGesture(GAIN, "live");
  gesture.move(0.9);
  await answerTheNext();
  inputValues.clear(GAIN, "live");
  gesture.release(0.95);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.8, comes_from: "live" });
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.5, comes_from: "saved" }));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  expect(sent.map(({ operations, mode, idempotency_key }) => [operations, mode, idempotency_key])).toEqual([
    [[{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "MIX-ID", input: "gain", value: 0.9 }], "live", null],
    [[{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "MIX-ID", input: "gain", value: null }], "live", null],
  ]);
});

test("a_refused_clear_keeps_the_runtimes_words_and_shows_the_value_the_graph_reads_again", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const refusals: (string | null)[] = [];
  inputValues.watchRefusal(GAIN, (refusal) => refusals.push(refusal));
  inputValues.clear(GAIN, "commit");
  await answerTheNext({ kind: "not_sent", because: "the project is read only" });
  expect(refusals).toEqual([null, "the project is read only"]);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
});

test("a_change_the_runtime_announces_shows_at_once_and_one_for_an_input_the_store_holds_no_link_for_is_not_taken", () => {
  const { inputValues } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const shown = valuesShownAt(inputValues, GAIN);
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.7, comes_from: "live" }));
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.5, comes_from: "saved" }));
  expect(shown).toEqual([
    { value: 0.5, comes_from: "saved" },
    { value: 0.7, comes_from: "live" },
    { value: 0.5, comes_from: "saved" },
  ]);
  const OTHER: InputAddress = { ...GAIN, node_id: "OTHER-ID" };
  inputValues.takeTheInputValues(PROJECT, { kind: "changed", stream_asset: STREAM_ASSET, change: { level: [], node_id: "OTHER-ID", input: "gain", value_read: { value: null, comes_from: "wire" } } });
  expect(inputValues.shownValue(OTHER)).toEqual({ value: null, comes_from: null });
});

test("a_dragged_control_does_not_jump_as_its_own_live_values_come_back_and_holds_its_release_until_the_runtime_announces_it", async () => {
  const { inputValues, answerTheNext } = storeOverAHeldConnection();
  inputValues.takeTheInputValues(PROJECT, valuesRead(saved(0.5)));
  const shown = valuesShownAt(inputValues, GAIN);
  const gesture = inputValues.beginGesture(GAIN, "commit");
  gesture.move(0.6);
  gesture.move(0.7);
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.6, comes_from: "live" }));
  await answerTheNext();
  gesture.move(0.8);
  gesture.release(0.9);
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.7, comes_from: "live" }));
  await answerTheNext();
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.7, comes_from: "live" }));
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.9, comes_from: "saved" }));
  expect(shown.map(({ value }) => value)).toEqual([0.5, 0.6, 0.7, 0.8, 0.9]);
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.9, comes_from: "saved" });
  inputValues.takeTheInputValues(PROJECT, gainChanged({ value: 0.2, comes_from: "live" }));
  expect(inputValues.shownValue(GAIN)).toEqual({ value: 0.2, comes_from: "live" });
});

test("each_fire_of_a_trigger_is_one_live_set_of_no_value_sent_after_the_one_before_is_answered_never_merged_and_its_refusal_kept_until_one_applies", async () => {
  const { inputValues, sent, answerTheNext } = storeOverAHeldConnection();
  const FLASH: InputAddress = { ...GAIN, node_id: "FLASH-ID", input: "flash" };
  const refusals: (string | null)[] = [];
  inputValues.watchRefusal(FLASH, (refusal) => refusals.push(refusal));
  inputValues.fire(FLASH);
  inputValues.fire(FLASH);
  inputValues.fire(FLASH);
  await answerTheNext();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toEqual({ project_folder: PROJECT, operations: [{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "FLASH-ID", input: "flash", value: null }], mode: "live", idempotency_key: null });
  await answerTheNext({ kind: "not_sent", because: "its project's playback is stopped" });
  await answerTheNext();
  expect(sent.map(({ mode, operations }) => [mode, operations[0]?.operation === "set_node_input_value" ? operations[0].value : "other"])).toEqual([
    ["live", null],
    ["live", null],
    ["live", null],
  ]);
  expect(refusals).toEqual([null, "its project's playback is stopped", null]);
  expect(inputValues.shownValue(FLASH)).toEqual({ value: null, comes_from: null });
});
