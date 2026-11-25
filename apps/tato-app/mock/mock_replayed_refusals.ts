// The refusals of `transact` the mock replays, each a recording of the runtime's own (`mock_recordings.ts`),
// picked with `?refusal=`: `link_of_another_type` answers a `connect` of the very ports the
// recording names with the runtime's refusal of a link between pins of two types, `link_needs_a_module_conversion`
// answers a `connect` of `sweep.result` into `beat.beats_per_minute` with the refusal suggesting the
// `transact` that places the sample's `SweepPosition`, on the stream the `connect` names, `input_takes_no_wire` answers a
// `connect` of `caption.result` into `warmth_base.port`, a Graph Input's setting, with the refusal of a link into an input
// that takes none, under the graph recorded once each setting became an input, and `value_of_another_type`
// answers a value set on the very input the recording names, its live moves and the commit that ends the gesture,
// with its refusal of a value of another type. The mock looks at no value and no pin: the refusal answers the operation the recording answered,
// re-indexed to where it sits in the transaction, and every transaction after the commit it refuses applies.

import type { GraphEditMode, ProjectActionRefusal, StreamGraphAction } from "../src/shared/tatolab_backend_contract";
import { MOCK_RECORDED_REFUSAL_OF_A_LINK_OF_ANOTHER_TYPE, MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE, MOCK_RECORDED_REFUSAL_OF_A_WIRE_INTO_A_SETTING_THAT_TAKES_NONE, mockRecordedRefusalOfASweepIntoAFloat } from "./mock_recordings";

/** What `?refusal=` names. */
export type MockReplayedRefusal = "link_of_another_type" | "link_needs_a_module_conversion" | "input_takes_no_wire" | "value_of_another_type";

/** The refusal `?refusal=` names, `null` when it names none the mock replays. */
export function mockReplayedRefusalNamed(refusalInTheQuery: string | null): MockReplayedRefusal | null {
  return Object.keys(REPLAYED).find((replayed): replayed is MockReplayedRefusal => replayed === refusalInTheQuery) ?? null;
}

/** Whether `operation` is the one `refusal` was recorded answering: a `connect` of the link it names, or a value set on the input of the node it names. */
function isTheOperationTheRecordingAnswered(operation: StreamGraphAction, refusal: ProjectActionRefusal): boolean {
  switch (operation.operation) {
    case "connect": {
      const link = refusal.refused_link;
      return link !== null && operation.source.node === link.source.node && operation.source.port === link.source.port && operation.target.node === link.target.node && operation.target.port === link.target.port;
    }
    case "set_node_input_value":
      return refusal.refused_link === null && operation.node === refusal.refused_node && operation.input === refusal.refused_input;
    default:
      return false;
  }
}

/** Each refusal replayed, on the stream the runtime lists by the id given. */
const REPLAYED: Record<MockReplayedRefusal, (streamId: string) => ProjectActionRefusal> = {
  link_of_another_type: () => MOCK_RECORDED_REFUSAL_OF_A_LINK_OF_ANOTHER_TYPE,
  link_needs_a_module_conversion: mockRecordedRefusalOfASweepIntoAFloat,
  input_takes_no_wire: () => MOCK_RECORDED_REFUSAL_OF_A_WIRE_INTO_A_SETTING_THAT_TAKES_NONE,
  value_of_another_type: () => MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE,
};

/** The one refusal a page's scenario replays, until it has answered a commit. */
export class MockReplayedRefusals {
  #stillReplayed: MockReplayedRefusal | null;

  constructor(scenario: MockReplayedRefusal | null) {
    this.#stillReplayed = scenario;
  }

  /**
   * The recorded refusal answering `operations` sent in `mode`, naming the index of the operation it answers, on the stream
   * `streamIdOf` gives the id of; `null` once a commit has been refused, or for a transaction holding no operation it was recorded answering.
   */
  refusalOf(operations: readonly StreamGraphAction[], mode: GraphEditMode, streamIdOf: (stream: string) => string): ProjectActionRefusal | null {
    if (this.#stillReplayed === null) return null;
    const replayedOn = REPLAYED[this.#stillReplayed];
    const refusedOperationIndex = operations.findIndex((operation) => isTheOperationTheRecordingAnswered(operation, replayedOn(streamIdOf(operation.stream))));
    const refusedOperation = operations[refusedOperationIndex];
    if (refusedOperation === undefined) return null;
    const replayed = replayedOn(streamIdOf(refusedOperation.stream));
    if (mode === "commit") this.#stillReplayed = null;
    return {
      ...replayed,
      refused_operation_index: refusedOperationIndex,
      refused_params_pointer: replayed.refused_params_pointer?.replace(/^\/operations\/\d+/, `/operations/${refusedOperationIndex}`) ?? null,
    };
  }
}
