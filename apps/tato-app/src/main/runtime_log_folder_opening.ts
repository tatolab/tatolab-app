// Opening the runtime's own log folder from Settings. The window names nothing: the folder is the
// one the runtime names in `describe_runtime` when asked, so a page can never have the app open a
// path of its choosing.

import { Effect } from "effect";
import { describeRuntime } from "./runtime_operations.js";
import { FileManager } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

/** Why the log folder of a runtime that keeps no own log cannot be opened. */
export const RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL = "The runtime keeps no log of its own, so there is no folder to open.";

/** The folder the runtime names for its own log when asked now, shown in the file manager; refused naming why when the runtime did not describe itself, keeps no log, or the folder is not on this machine. */
export const openTheRuntimesLogFolder = Effect.gen(function* () {
  const { runtime_log_directory: runtimeLogFolder } = yield* describeRuntime();
  if (runtimeLogFolder === null) return yield* new CommandRefused({ words: RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL });
  yield* (yield* FileManager).showAnExistingFolder(runtimeLogFolder, `${runtimeLogFolder} is not a folder on this machine.`);
});
