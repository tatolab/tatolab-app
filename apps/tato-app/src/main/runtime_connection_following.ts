// What every follower of the runtime's `/control/ws` pushes shares: one connection's following run
// until it ends, its failure and any defect turned into why it ended, and work asked of it run one
// at a time per key, a run asked for while one is under way run once after it.

import { Effect, FiberSet, type Scope } from "effect";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";

/**
 * `followedOverOneConnection` run in a scope of its own until it ends: what it ended with, or `endedBecause` of its failure in the
 * runtime's words, or of a defect, which is logged naming `whatBrokeAsTheLogNamesIt`.
 */
export function followedUntilTheConnectionEnds<Ended, Services>(
  followedOverOneConnection: Effect.Effect<Ended, RuntimeControlFailure, Services | Scope.Scope>,
  endedBecause: (why: string) => Ended,
  whatBrokeAsTheLogNamesIt: string,
): Effect.Effect<Ended, never, Exclude<Services, Scope.Scope>> {
  return Effect.scoped(followedOverOneConnection).pipe(
    Effect.catch((failure) => Effect.succeed(endedBecause(failure.words))),
    Effect.catchDefect((defect) => Effect.logError(`${whatBrokeAsTheLogNamesIt} broke`, defect).pipe(Effect.as(endedBecause(String(defect))))),
  );
}

/** Whether a run carries on to the run asked for while it was under way, or stops, forgetting it. */
export type AfterTheRun = "run_what_was_asked_since" | "stop";

/** Work asked of one connection by key, one run at a time per key. */
export interface RunsOneAtATime<Asked> {
  /** Run `key` with `asked`, at once when no run of it is under way, or once after the run under way otherwise. */
  readonly ask: (key: string, asked: Asked) => Effect.Effect<void>;
}

/**
 * Runs of `run` in `runs`, one at a time per key: what is asked while a run of a key is under way is merged with `mergeAsked` into
 * the one run after it.
 */
export function runsOneAtATime<Asked>(
  runs: FiberSet.FiberSet<void, never>,
  run: (key: string, asked: Asked) => Effect.Effect<AfterTheRun>,
  mergeAsked: (askedBefore: Asked, askedSince: Asked) => Asked,
): RunsOneAtATime<Asked> {
  const runsUnderWay = new Map<string, { askedSince: { readonly asked: Asked } | null }>();
  return {
    ask: (key, asked) =>
      Effect.suspend(() => {
        const runUnderWay = runsUnderWay.get(key);
        if (runUnderWay !== undefined) {
          runUnderWay.askedSince = { asked: runUnderWay.askedSince === null ? asked : mergeAsked(runUnderWay.askedSince.asked, asked) };
          return Effect.void;
        }
        const thisRun: { askedSince: { readonly asked: Asked } | null } = { askedSince: null };
        runsUnderWay.set(key, thisRun);
        const runWhileAsked = Effect.gen(function* () {
          let next: Asked = asked;
          for (;;) {
            const afterTheRun = yield* run(key, next);
            const askedSince = thisRun.askedSince;
            thisRun.askedSince = null;
            if (afterTheRun === "stop" || askedSince === null) {
              runsUnderWay.delete(key);
              return;
            }
            next = askedSince.asked;
          }
        }).pipe(Effect.onInterrupt(() => Effect.sync(() => runsUnderWay.delete(key))));
        return FiberSet.run(runs, runWhileAsked).pipe(Effect.asVoid);
      }),
  };
}
