// Where Effect code calls plain code that answers a hand-written `Result`. Nothing goes the other way:
// plain code starts an Effect only at an edge.

import { Effect } from "effect";
import type { Result } from "./result.js";

/** `outcome` as an Effect: its value, or the failure `failureOf` makes of its failure. */
export function fromResult<Value, Failure, EffectFailure>(outcome: Result<Value, Failure>, failureOf: (failure: Failure) => EffectFailure): Effect.Effect<Value, EffectFailure> {
  return outcome.ok ? Effect.succeed(outcome.value) : Effect.fail(failureOf(outcome.failure));
}
