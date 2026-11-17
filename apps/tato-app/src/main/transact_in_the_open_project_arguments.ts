// The arguments of `transact_in_the_open_project` as the window sends them, decoded once in main.
// The window's typed call takes their type from here with `import type`, so the two cannot drift.
// This module imports only `effect` and the shared contract, so the window's project type-checks it.

import { Schema } from "effect";
import { graphEditModeSchema, streamGraphActionSchema, type GraphEditMode, type StreamGraphAction } from "../shared/tatolab_backend_contract.js";

/** One graph action the runtime's `transact` takes, as the view SDK's schema of it checks. */
const StreamGraphActionTheRuntimeTakes = Schema.declare((sent: unknown): sent is StreamGraphAction => streamGraphActionSchema.safeParse(sent).success, {
  identifier: "StreamGraphAction",
});

/** `commit` or `live`, as the view SDK's schema of a graph edit's mode checks. */
const GraphEditModeTheRuntimeTakes = Schema.declare((sent: unknown): sent is GraphEditMode => graphEditModeSchema.safeParse(sent).success, {
  identifier: "GraphEditMode",
});

/** The graph actions a studio window sends as one transaction, at least one, with their mode and the gesture's idempotency key or none. */
export const TransactInTheOpenProjectArguments = Schema.Struct({
  operations: Schema.Array(StreamGraphActionTheRuntimeTakes).check(Schema.isNonEmpty()),
  mode: GraphEditModeTheRuntimeTakes,
  idempotency_key: Schema.NullOr(Schema.String),
});

/** The graph actions a studio window sends as one transaction, under its gesture's idempotency key or none. */
export type ProjectGraphTransactionSentByTheWindow = typeof TransactInTheOpenProjectArguments.Type;
