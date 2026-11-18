import { Deferred, Effect, FiberSet } from "effect";
import { expect, test } from "vitest";
import { RuntimeUnreachable } from "./runtime_control_failures.js";
import { followedUntilTheConnectionEnds, runsOneAtATime, type AfterTheRun } from "./runtime_connection_following.js";

/** Runs of a key that each wait for the test to let them end, recording what each was asked. */
function runsHeldByTheTest(afterEachRun: AfterTheRun = "run_what_was_asked_since") {
  return Effect.gen(function* () {
    const runs = yield* FiberSet.make<void, never>();
    const runsStarted: string[] = [];
    const letTheRunEnd: Deferred.Deferred<void>[] = [];
    const oneAtATime = runsOneAtATime<string>(
      runs,
      (key, asked) =>
        Effect.gen(function* () {
          runsStarted.push(`${key}:${asked}`);
          const ended = yield* Deferred.make<void>();
          letTheRunEnd.push(ended);
          yield* Deferred.await(ended);
          return afterEachRun;
        }),
      (askedBefore, askedSince) => `${askedBefore}+${askedSince}`,
    );
    /** Let the run started `nth`, from 0, end, and what follows it start. */
    const endTheRun = (nth: number) => Effect.suspend(() => Deferred.succeed(letTheRunEnd[nth] ?? Deferred.makeUnsafe<void>(), undefined)).pipe(Effect.andThen(Effect.yieldNow));
    return { oneAtATime, runsStarted, endTheRun };
  });
}

test("what_is_asked_while_a_run_is_under_way_runs_once_after_it_merged_and_a_key_runs_apart_from_another", async () => {
  const runsStarted = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { oneAtATime, runsStarted, endTheRun } = yield* runsHeldByTheTest();
        yield* oneAtATime.ask("a", "1");
        yield* oneAtATime.ask("a", "2");
        yield* oneAtATime.ask("a", "3");
        yield* oneAtATime.ask("b", "1");
        yield* Effect.yieldNow;
        yield* endTheRun(0);
        return runsStarted;
      }),
    ),
  );

  expect(runsStarted).toEqual(["a:1", "b:1", "a:2+3"]);
});

test("a_run_that_ends_with_nothing_asked_since_lets_the_next_ask_start_a_new_run", async () => {
  const runsStarted = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { oneAtATime, runsStarted, endTheRun } = yield* runsHeldByTheTest();
        yield* oneAtATime.ask("a", "1");
        yield* Effect.yieldNow;
        yield* endTheRun(0);
        yield* oneAtATime.ask("a", "2");
        yield* oneAtATime.ask("a", "3");
        yield* oneAtATime.ask("a", "4");
        yield* Effect.yieldNow;
        yield* endTheRun(1);
        return runsStarted;
      }),
    ),
  );

  expect(runsStarted).toEqual(["a:1", "a:2", "a:3+4"]);
});

test("a_run_that_stops_forgets_what_was_asked_since", async () => {
  const runsStarted = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { oneAtATime, runsStarted, endTheRun } = yield* runsHeldByTheTest("stop");
        yield* oneAtATime.ask("a", "1");
        yield* oneAtATime.ask("a", "2");
        yield* Effect.yieldNow;
        yield* endTheRun(0);
        yield* oneAtATime.ask("a", "3");
        yield* Effect.yieldNow;
        return runsStarted;
      }),
    ),
  );

  expect(runsStarted).toEqual(["a:1", "a:3"]);
});

test("a_connection_that_fails_or_breaks_ends_in_why", async () => {
  const [failed, broke, ended] = await Effect.runPromise(
    Effect.all([
      followedUntilTheConnectionEnds(Effect.fail(new RuntimeUnreachable({ operation: "discover", words: "no runtime answers" })), (why) => why, "following"),
      followedUntilTheConnectionEnds(Effect.die(new Error("it broke")), (why) => why, "following"),
      followedUntilTheConnectionEnds(Effect.succeed("closed by the runtime"), (why) => why, "following"),
    ]),
  );

  expect([failed, broke, ended]).toEqual(["no runtime answers", "Error: it broke", "closed by the runtime"]);
});
