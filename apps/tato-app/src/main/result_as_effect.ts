// Where Effect code and plain code that answers a hand-written `Result` meet: Effect code calls such
// code through `fromResult`, and an edge where plain code starts an Effect answers its `Result`.

import { Effect } from "effect";
import { failedWith, succeeded, type Result } from "./result.js";

/** `outcome` as an Effect: its value, or the failure `failureOf` makes of its failure. */
export function fromResult<Value, Failure, EffectFailure>(outcome: Result<Value, Failure>, failureOf: (failure: Failure) => EffectFailure): Effect.Effect<Value, EffectFailure> {
  return outcome.ok ? Effect.succeed(outcome.value) : Effect.fail(failureOf(outcome.failure));
}

/** `effect`'s outcome as a `Result`: its value, or the failure it ended with. */
export function resultOf<Value, Failure, Services>(effect: Effect.Effect<Value, Failure, Services>): Effect.Effect<Result<Value, Failure>, never, Services> {
  return Effect.match(effect, { onSuccess: (value): Result<Value, Failure> => succeeded(value), onFailure: (failure) => failedWith(failure) });
}

/** `effect`'s outcome as a `Result`: its value, or the words of the failure it ended with. */
export function resultInWordsOf<Value, Services>(effect: Effect.Effect<Value, { readonly words: string }, Services>): Effect.Effect<Result<Value, string>, never, Services> {
  return resultOf(Effect.mapError(effect, (failure) => failure.words));
}
