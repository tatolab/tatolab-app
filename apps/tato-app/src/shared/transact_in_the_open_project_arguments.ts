// The arguments of `transact_in_the_open_project` as the window sends them, decoded once in main.
// The bridge contract takes their type from here with `import type`, so the window's typed call and
// main's decode cannot drift, and neither preload nor the window carries Schema code. A graph action
// and the edit mode are the control contract's, checked by the runtime client.

import { contractValue } from "@tatolab/tato-app-view-sdk/studio_host/contract_value";
import { Schema } from "effect";

/** The graph actions a studio window sends as one transaction, at least one, with their mode and the gesture's idempotency key or none. */
export const TransactInTheOpenProjectArguments = Schema.Struct({
  operations: Schema.Array(contractValue("StreamGraphAction")).check(Schema.isNonEmpty()),
  mode: contractValue("GraphEditMode"),
  idempotency_key: Schema.NullOr(Schema.String),
});

/** The graph actions a studio window sends as one transaction, under its gesture's idempotency key or none. */
export type ProjectGraphTransactionSentByTheWindow = typeof TransactInTheOpenProjectArguments.Type;
