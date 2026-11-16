// The main process's logic runs on Effect, installed at exactly 4.1.4, whose package names no Node
// version it needs. This test runs one Effect through @effect/vitest on the Node the tests run on,
// CI's included: a value it yields, and a failure it raises and recovers by its tag.

import { expect, it } from "@effect/vitest";
import { Data, Effect } from "effect";

class RuntimeAnsweredNo extends Data.TaggedError("RuntimeAnsweredNo")<{ readonly words: string }> {}

it.effect("an Effect yields its value and recovers a tagged failure on this Node", () =>
  Effect.gen(function* () {
    const refused = yield* new RuntimeAnsweredNo({ words: "no such node" }).pipe(
      Effect.catchTag("RuntimeAnsweredNo", (failure) => Effect.succeed(`refused: ${failure.words}`)),
    );
    expect(refused).toBe("refused: no such node");
  }),
);
