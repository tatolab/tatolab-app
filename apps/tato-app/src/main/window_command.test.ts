import { Effect, ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import { tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { TransactInTheOpenProjectArguments } from "../shared/transact_in_the_open_project_arguments.js";
import { CommandRefused, windowCommand } from "./window_command.js";

const runtimesToDispose: ManagedRuntime.ManagedRuntime<never, never>[] = [];
afterEach(async () => {
  await Promise.all(runtimesToDispose.splice(0).map((studioRuntime) => studioRuntime.dispose()));
});

/** A runtime whose Effect logs go to an app log at `debug`, with every line it wrote. */
function studioRuntimeLoggingEachLine() {
  const loggedLines: string[] = [];
  const studioRuntime = ManagedRuntime.make(tatolabAppLogAsEffectsLogger(createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine))));
  runtimesToDispose.push(studioRuntime);
  return { studioRuntime, loggedLines };
}

const FROM_A_STUDIO_WINDOW = { windowContentsId: 2 };
const SET_THE_SIZE = { operation: "set_node_config", stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", node: "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a", config: { width: 640 } };

test("a command answers its handler's value or the words of the failure it ended with, and refuses arguments its Schema does not decode with the command's name and the Schema's message", async () => {
  const { studioRuntime, loggedLines } = studioRuntimeLoggingEachLine();
  const transactInTheOpenProject = windowCommand(studioRuntime, "transact_in_the_open_project", TransactInTheOpenProjectArguments, (decoded) =>
    decoded.mode === "live"
      ? Effect.succeed({ kind: "refused" as const, refusal: { action: "transact", refused_operation_index: null, refused_node: null, refused_link: null, refused_field: null, runtime_words: decoded.operations[0]?.stream ?? "" } })
      : Effect.fail(new CommandRefused({ words: "a commit is refused here" })),
  );

  expect(await transactInTheOpenProject({ operations: [SET_THE_SIZE], mode: "live", idempotency_key: null }, FROM_A_STUDIO_WINDOW)).toMatchObject({
    ok: true,
    value: { kind: "refused", refusal: { runtime_words: SET_THE_SIZE.stream } },
  });
  expect(await transactInTheOpenProject({ operations: [SET_THE_SIZE], mode: "commit", idempotency_key: null }, FROM_A_STUDIO_WINDOW)).toEqual({ ok: false, refusal: "a commit is refused here" });
  expect(await transactInTheOpenProject(undefined, FROM_A_STUDIO_WINDOW)).toEqual({ ok: false, refusal: "transact_in_the_open_project: Expected object" });
  expect(loggedLines).toEqual([]);
});

test("a defect in a command's handler is logged to the app's log and answers that the command ended without an answer", async () => {
  const { studioRuntime, loggedLines } = studioRuntimeLoggingEachLine();
  const transactInTheOpenProject = windowCommand(studioRuntime, "transact_in_the_open_project", TransactInTheOpenProjectArguments, () => Effect.die(new Error("a planted bug")));

  expect(await transactInTheOpenProject({ operations: [SET_THE_SIZE], mode: "commit", idempotency_key: null }, FROM_A_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: "transact_in_the_open_project ended without an answer: a planted bug",
  });
  expect(loggedLines).toEqual([expect.stringMatching(/^ERROR transact_in_the_open_project ended without an answer details=".*Error: a planted bug/s)]);
});

test("a command sent after its runtime was disposed, as the app quits, answers that it ended without an answer", async () => {
  const { studioRuntime } = studioRuntimeLoggingEachLine();
  const transactInTheOpenProject = windowCommand(studioRuntime, "transact_in_the_open_project", TransactInTheOpenProjectArguments, () => Effect.never);
  const answer = transactInTheOpenProject({ operations: [SET_THE_SIZE], mode: "commit", idempotency_key: null }, FROM_A_STUDIO_WINDOW);
  await studioRuntime.dispose();

  expect(await answer).toEqual({ ok: false, refusal: expect.stringMatching(/^transact_in_the_open_project ended without an answer: /) });
});
