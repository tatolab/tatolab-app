// The refusals of `transact` the mock replays, each a recording of the runtime's own (`mock_recordings.ts`), picked
// with `?refusal=`: `link_of_another_type` answers the first transaction holding a `connect` with the runtime's
// refusal of a link between pins of two types, and `value_of_another_type` answers the first gesture setting an
// input's value, its live moves and the commit that ends it, with its refusal of a value of another type. The mock
// looks at no value and no pin: the refusal answers the operation the scenario names, and every transaction after
// the commit it refuses applies.

import type { GraphEditMode, ProjectActionRefusal, StreamGraphAction } from "../src/shared/tatolab_backend_contract";
import { MOCK_RECORDED_REFUSAL_OF_A_LINK_OF_ANOTHER_TYPE, MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE } from "./mock_recordings";

/** What `?refusal=` names. */
export type MockReplayedRefusal = "link_of_another_type" | "value_of_another_type";

/** The refusal `?refusal=` names, `null` when it names none the mock replays. */
export function mockReplayedRefusalNamed(refusalInTheQuery: string | null): MockReplayedRefusal | null {
  return refusalInTheQuery === "link_of_another_type" || refusalInTheQuery === "value_of_another_type" ? refusalInTheQuery : null;
}

const REPLAYED: Record<MockReplayedRefusal, { operation: StreamGraphAction["operation"]; refusal: ProjectActionRefusal }> = {
  link_of_another_type: { operation: "connect", refusal: MOCK_RECORDED_REFUSAL_OF_A_LINK_OF_ANOTHER_TYPE },
  value_of_another_type: { operation: "set_node_input_value", refusal: MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE },
};

/** The one refusal a page's scenario replays, until it has answered a commit. */
export class MockReplayedRefusals {
  #stillReplayed: MockReplayedRefusal | null;

  constructor(scenario: MockReplayedRefusal | null) {
    this.#stillReplayed = scenario;
  }

  /** The recorded refusal answering `operations` sent in `mode`, naming the index of the operation it answers; `null` once a commit has been refused, or for a transaction holding no operation it answers. */
  refusalOf(operations: readonly StreamGraphAction[], mode: GraphEditMode): ProjectActionRefusal | null {
    if (this.#stillReplayed === null) return null;
    const replayed = REPLAYED[this.#stillReplayed];
    const refusedOperationIndex = operations.findIndex((operation) => operation.operation === replayed.operation);
    if (refusedOperationIndex === -1) return null;
    if (mode === "commit") this.#stillReplayed = null;
    return { ...replayed.refusal, refused_operation_index: refusedOperationIndex };
  }
}
