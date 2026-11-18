// Whether the runtime answering serves the control contract this Studio was built against, read once
// each time a runtime comes up by `discover` on `/control/ws`, and, when it refuses, the record it
// states: which side is older, its release and both contracts, with the one thing to do about it.

import { Effect } from "effect";
import type { RuntimeOfAnotherAge, RuntimeOfAnotherAgeRemedy } from "../shared/tatolab_backend_contract.js";
import { RuntimeControl, type ControlContractVersionMismatch } from "./tatolab_runtime_control_operation_call.js";

/** How the runtime answering came to run: the app started the one it carries, the app carries one but did not start this one, or the app carries none. */
export type HowTheRunningRuntimeRuns = "started_by_the_app" | "not_started_by_the_app" | "the_app_carries_none";

/** What `discover` told of the runtime's contract: it serves this Studio's; it refused it, naming the older side; or it could not be read, with why. */
export type RuntimeContractAgeReading =
  | { readonly kind: "agrees" }
  | { readonly kind: "of_another_age"; readonly runtimeOfAnotherAge: RuntimeOfAnotherAge; readonly runtimeWords: string }
  | { readonly kind: "unread"; readonly why: string };

/**
 * The one thing to do about the older side: a Studio older than the runtime is updated; so is one whose own runtime is the older,
 * since what it carries is what it starts again; a runtime it did not start is quit, so it starts the one it carries; and in a
 * build that carries none, the runtime is updated. Studio never stops or replaces a runtime it did not start.
 */
export function remedyForTheOlderSide(olderSide: RuntimeOfAnotherAge["older_side"], howTheRuntimeRuns: HowTheRunningRuntimeRuns): RuntimeOfAnotherAgeRemedy {
  if (olderSide === "studio") return "update_studio";
  switch (howTheRuntimeRuns) {
    case "started_by_the_app":
      return "update_studio";
    case "not_started_by_the_app":
      return "quit_the_running_runtime";
    case "the_app_carries_none":
      return "update_the_runtime";
  }
}

/** The runtime's mismatch record as the window's status carries it, with the remedy for how the runtime runs. */
export function runtimeOfAnotherAgeOf(mismatch: ControlContractVersionMismatch, howTheRuntimeRuns: HowTheRunningRuntimeRuns): RuntimeOfAnotherAge {
  const olderSide = mismatch.older_side === "client" ? "studio" : "runtime";
  return {
    older_side: olderSide,
    runtime_version: mismatch.runtime_version,
    runtime_contract: { version: mismatch.runtime_contract_version, revision: mismatch.runtime_contract_revision },
    studio_contract: { version: mismatch.client_contract_version, revision: mismatch.client_contract_revision },
    remedy: remedyForTheOlderSide(olderSide, howTheRuntimeRuns),
  };
}

/** Read the runtime's contract age by `discover`, for a runtime that runs as `howTheRuntimeRuns` says; every failure is a reading. */
export function readTheRuntimesContractAge(howTheRuntimeRuns: HowTheRunningRuntimeRuns): Effect.Effect<RuntimeContractAgeReading, never, RuntimeControl> {
  return Effect.gen(function* () {
    const runtimeControl = yield* RuntimeControl;
    return yield* runtimeControl.discover.pipe(
      Effect.as<RuntimeContractAgeReading>({ kind: "agrees" }),
      Effect.catch((failure) =>
        Effect.succeed<RuntimeContractAgeReading>(
          failure._tag === "RuntimeOfAnotherContract"
            ? { kind: "of_another_age", runtimeOfAnotherAge: runtimeOfAnotherAgeOf(failure.mismatch, howTheRuntimeRuns), runtimeWords: failure.words }
            : { kind: "unread", why: failure.words },
        ),
      ),
    );
  });
}
