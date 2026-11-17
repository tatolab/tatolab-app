// The window's one store of input values, one per view frame, and its one set-value path. It starts
// from each input's value in the latest graph reading, shows a gesture's value at once, and sends
// every value as `set_node_input_value` through one sender per input.

import { inputAddressKey, isOnTheStreamsOwnLevel, type GraphAddress, type InputAddress } from "../pin_model/node_inputs.js";
import { setNodeInputValueAction } from "../pin_model/input_value_actions.js";
import type { StopWatching, TatoAppViewConnection } from "../tato_app_view_connection.js";
import type { InputValueComesFrom, JsonValue, StreamGraphNode, StreamGraphSummary } from "../studio_readings.js";
import { createInputValueSender, type InputValueSender, type InputValueWrite, type InputValueWriteAnswer } from "./input_value_sender.js";

/** The value an input shows and where it comes from; `null` for both while it reads none, and a `null` value while a link feeds it. */
export interface ShownValue {
  readonly value: JsonValue | null;
  readonly comes_from: InputValueComesFrom | null;
}

/** One gesture on one input's value: a drag, or a lone edit released at once. */
export interface InputValueGesture {
  /** Show `value` and send it live, on a stream's own level; below it nothing is sent until the release. */
  move(value: JsonValue | null): void;
  /** End the gesture at `value`: one commit under the gesture's key, or for a gesture released live, the last live value, which below a stream's own level is not sent. */
  release(value: JsonValue | null): void;
  /** End the gesture where it began: a live value it sent is taken off, or set back to the live value it began at, and nothing is recorded. */
  cancel(): void;
}

/** The store's interface: watch functions and a gesture object, each changing its state synchronously. */
export interface InputValues {
  shownValue(address: InputAddress): ShownValue;
  /** The value `address` shows, at once and on each change. */
  watchValue(address: InputAddress, listener: (shown: ShownValue) => void): StopWatching;
  /** Why the latest write of `address` was refused, in the words of what refused it, at once and on each change; `null` once a write applies. */
  watchRefusal(address: InputAddress, listener: (refusal: string | null) => void): StopWatching;
  /** Open a gesture on `address`, ended by one commit or by its last live value; it takes the place of a gesture still open there. */
  beginGesture(address: InputAddress, release: "commit" | "live"): InputValueGesture;
  /** Take what each input of `graph`, a stream of the project in `projectFolder`, reads in its latest reading, at every level, forgetting an input of that stream it no longer holds that nothing watches or sends. */
  takeTheGraphReading(projectFolder: string, graph: StreamGraphSummary): void;
}

/** What the store sends through: the frame's connection, and the key a new gesture is sent under. */
export interface InputValuesSending {
  readonly transactInTheProject: TatoAppViewConnection["transactInTheProject"];
  readonly newGestureIdempotencyKey: () => string;
}

const READS_NOTHING: ShownValue = Object.freeze({ value: null, comes_from: null });

/**
 * The readings a value sent ahead waits for, once its last write is answered, before the runtime's own value is shown in its
 * place: the first may have been asked for before that write landed.
 */
const READINGS_A_VALUE_SENT_AHEAD_WAITS_FOR = 2;

interface OpenGesture {
  readonly began_at: ShownValue;
  shown: ShownValue;
  has_sent_live: boolean;
}

interface ValueSentAhead {
  readonly shown: ShownValue;
  readings_since_settled: number;
}

interface InputValueState {
  readonly address: InputAddress;
  read: ShownValue;
  gesture: OpenGesture | null;
  sent_ahead: ValueSentAhead | null;
  refusal: string | null;
  shown_last: ShownValue;
  sender: InputValueSender | null;
  readonly value_listeners: Set<(shown: ShownValue) => void>;
  readonly refusal_listeners: Set<(refusal: string | null) => void>;
}

const holdTheSameValue = (a: JsonValue | null, b: JsonValue | null): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

const showTheSame = (a: ShownValue, b: ShownValue): boolean => a.comes_from === b.comes_from && holdTheSameValue(a.value, b.value);

const shownBy = (state: InputValueState): ShownValue => state.gesture?.shown ?? state.sent_ahead?.shown ?? state.read;

/** A store sending through `sending`. */
export function createInputValues(sending: InputValuesSending): InputValues {
  const statesByKey = new Map<string, InputValueState>();
  const stateOf = (address: InputAddress): InputValueState => {
    const key = inputAddressKey(address);
    const known = statesByKey.get(key);
    if (known !== undefined) return known;
    const state: InputValueState = { address, read: READS_NOTHING, gesture: null, sent_ahead: null, refusal: null, shown_last: READS_NOTHING, sender: null, value_listeners: new Set(), refusal_listeners: new Set() };
    statesByKey.set(key, state);
    return state;
  };
  const publishTheValue = (state: InputValueState): void => {
    const shown = shownBy(state);
    if (showTheSame(shown, state.shown_last)) return;
    state.shown_last = shown;
    for (const listener of state.value_listeners) listener(shown);
  };
  const keepTheRefusal = (state: InputValueState, refusal: string | null): void => {
    if (state.refusal === refusal) return;
    state.refusal = refusal;
    for (const listener of state.refusal_listeners) listener(refusal);
  };
  const sendTheWrite = (address: InputAddress, write: InputValueWrite): Promise<InputValueWriteAnswer> =>
    sending
      .transactInTheProject(address.graph.project_folder, [setNodeInputValueAction(address, write.value)], { mode: write.mode, idempotencyKey: write.mode === "commit" ? write.idempotency_key : null })
      .then((applying): InputValueWriteAnswer => {
        if (applying.kind === "applied") return { kind: "applied" };
        return { kind: "refused", because: applying.kind === "refused" ? applying.refusal.runtime_words : applying.because };
      });
  const senderOf = (state: InputValueState): InputValueSender => {
    if (state.sender !== null) return state.sender;
    const sender = createInputValueSender((write) => sendTheWrite(state.address, write), {
      onWriteAnswered: (_write, answer) => {
        keepTheRefusal(state, answer.kind === "refused" ? answer.because : null);
        // A refused write a later one overtook leaves the value sent ahead for that later one.
        if (answer.kind === "refused" && state.sent_ahead !== null && sender.isSettled()) {
          state.sent_ahead = null;
          publishTheValue(state);
        }
      },
      onSettled: () => {
        if (state.sent_ahead === null) return;
        state.sent_ahead.readings_since_settled = 0;
        if (holdTheSameValue(state.sent_ahead.shown.value, state.read.value)) {
          state.sent_ahead = null;
          publishTheValue(state);
        }
      },
    });
    state.sender = sender;
    return sender;
  };
  const takeTheRead = (state: InputValueState, read: ShownValue): void => {
    state.read = read;
    const sentAhead = state.sent_ahead;
    if (sentAhead !== null && (state.sender === null || state.sender.isSettled())) {
      sentAhead.readings_since_settled += 1;
      if (holdTheSameValue(sentAhead.shown.value, read.value) || sentAhead.readings_since_settled >= READINGS_A_VALUE_SENT_AHEAD_WAITS_FOR) state.sent_ahead = null;
    }
    publishTheValue(state);
  };
  /** Takes each read of `nodes` at `graph`, keying each input it holds in `keysRead`. A link renders on every input it feeds, one that takes no stored value too, so a wired input is taken only where the store already holds it. */
  const takeTheLevel = (graph: GraphAddress, nodes: readonly StreamGraphNode[], keysRead: Set<string>): void => {
    for (const node of nodes) {
      for (const port of node.input_ports) {
        if (port.value_read === null) continue;
        const address: InputAddress = { graph, node_id: node.id, input: port.name };
        const key = inputAddressKey(address);
        const known = statesByKey.get(key);
        if (port.value_read.comes_from === "wire" && known === undefined) continue;
        keysRead.add(key);
        takeTheRead(known ?? stateOf(address), port.value_read);
      }
      if (node.fragment !== null) takeTheLevel({ ...graph, level: [...graph.level, node.id] }, node.fragment.nodes, keysRead);
    }
  };
  const isForgettable = (state: InputValueState): boolean =>
    state.value_listeners.size === 0 && state.refusal_listeners.size === 0 && state.gesture === null && (state.sender === null || state.sender.isSettled());
  return {
    shownValue: (address) => shownBy(stateOf(address)),
    watchValue: (address, listener) => {
      const state = stateOf(address);
      state.value_listeners.add(listener);
      listener(shownBy(state));
      return () => {
        state.value_listeners.delete(listener);
      };
    },
    watchRefusal: (address, listener) => {
      const state = stateOf(address);
      state.refusal_listeners.add(listener);
      listener(state.refusal);
      return () => {
        state.refusal_listeners.delete(listener);
      };
    },
    beginGesture: (address, release) => {
      const state = stateOf(address);
      const began_at = shownBy(state);
      const gesture: OpenGesture = { began_at, shown: began_at, has_sent_live: false };
      state.gesture = gesture;
      const idempotencyKey = sending.newGestureIdempotencyKey();
      const isLiveSent = isOnTheStreamsOwnLevel(address);
      const isOpen = () => state.gesture === gesture;
      const endWithTheValueSentAhead = (shown: ShownValue | null): void => {
        state.gesture = null;
        if (shown !== null) state.sent_ahead = { shown, readings_since_settled: 0 };
        publishTheValue(state);
      };
      return {
        move: (value) => {
          if (!isOpen()) return;
          gesture.shown = { value, comes_from: "live" };
          publishTheValue(state);
          if (!isLiveSent) return;
          gesture.has_sent_live = true;
          senderOf(state).sendLive(value);
        },
        release: (value) => {
          if (!isOpen()) return;
          if (release === "commit") {
            senderOf(state).sendCommit(value, idempotencyKey);
            endWithTheValueSentAhead({ value, comes_from: "saved" });
          } else if (isLiveSent) {
            senderOf(state).sendLive(value);
            endWithTheValueSentAhead({ value, comes_from: "live" });
          } else {
            endWithTheValueSentAhead(null);
          }
        },
        cancel: () => {
          if (!isOpen()) return;
          if (!gesture.has_sent_live) {
            endWithTheValueSentAhead(null);
            return;
          }
          // A live value holds over the saved one until a live `null` takes it off, so a gesture that began on a saved or
          // default value goes back by taking its live value off.
          senderOf(state).sendLive(gesture.began_at.comes_from === "live" ? gesture.began_at.value : null);
          endWithTheValueSentAhead(gesture.began_at);
        },
      };
    },
    takeTheGraphReading: (projectFolder, graph) => {
      const streamAsset = graph.stream_asset;
      if (streamAsset === null) return;
      const keysRead = new Set<string>();
      takeTheLevel({ project_folder: projectFolder, stream_asset: streamAsset, level: [] }, graph.nodes, keysRead);
      for (const [key, state] of statesByKey) {
        const isOfTheStream = state.address.graph.project_folder === projectFolder && state.address.graph.stream_asset === streamAsset;
        if (isOfTheStream && !keysRead.has(key) && isForgettable(state)) statesByKey.delete(key);
      }
    },
  };
}
