// `transact_in_the_open_project`: a graph edit from a studio window, run on Effect from the window's
// command to the runtime's `transact` and back. Its arguments are decoded once, at the edge; the
// runtime's answer and its refusal are the contract's types from the socket on.

import { Effect, type ManagedRuntime } from "effect";
import type { GraphTransactionToolResult } from "@tatolab/runtime-client";
import type { ProjectGraphTransaction, ProjectGraphTransactionTheRuntimeAnswered } from "../shared/tatolab_backend_contract.js";
import type { TatolabCommandAnswerTo } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonValue } from "./json_on_the_wire.js";
import { projectActionRefusalOfTheContract } from "./project_transactions_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { fromResult } from "./result_as_effect.js";
import { ContractMismatch } from "./runtime_control_failures.js";
import { ListedStreams, PersonEditingInStudio, StudioWindows, type StudioServices } from "./studio_runtime.js";
import type { TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import { authorOnTheWire, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { TransactInTheOpenProjectArguments, type ProjectGraphTransactionSentByTheWindow } from "../shared/transact_in_the_open_project_arguments.js";
import { CommandRefused, windowCommand } from "./window_command.js";

/** The transaction `transact` answered, as the window reads it: each absent key the contract allows as `null` or empty; or why its mode or an operation is not one the window reads. */
function transactionTheWindowReads(answered: GraphTransactionToolResult): Result<ProjectGraphTransaction, string> {
  const { mode, operations } = answered;
  if (mode !== "commit" && mode !== "live") return failedWith(`the runtime's transact answered the mode \`${mode}\`, neither commit nor live`);
  if (!operations.every(isAJsonValue)) return failedWith("the runtime's transact answered an applied operation that is not JSON");
  return succeeded({
    mode,
    transaction: answered.transaction ?? null,
    commit: answered.commit ?? null,
    operations,
    added_nodes: answered.added_nodes.map((addedNode) => ({ stream: addedNode.stream, node: addedNode.node, name: addedNode.name, as: addedNode.as ?? null })),
    connected_links: answered.connected_links.map((connectedLink) => ({
      stream: connectedLink.stream,
      source: { node: connectedLink.source.node, port: connectedLink.source.port },
      target: { node: connectedLink.target.node, port: connectedLink.target.port },
      state: connectedLink.state ?? null,
      error_reason: connectedLink.error_reason ?? null,
    })),
    added_groups: (answered.added_groups ?? []).map((addedGroup) => ({ stream: addedGroup.stream, group: addedGroup.group, title: addedGroup.title })),
    added_notes: (answered.added_notes ?? []).map((addedNote) => ({ stream: addedNote.stream, note: addedNote.note })),
  });
}

/**
 * The runtime's `transact` of the window's graph actions by the person editing in Studio, answering what it applied or its
 * structured refusal, whatever JSON-RPC code carried it; a stream asset that is not one of the window's project's is refused
 * in Studio's words, and a refusal the runtime gave no structure for in the runtime's own.
 */
export const transactInTheOpenProject = Effect.fn("transact_in_the_open_project")(function* (
  transacting: ProjectGraphTransactionSentByTheWindow,
  commandFromWindow: TatolabCommandFromWindow,
) {
  const studioWindows = yield* StudioWindows;
  const projectFolder = yield* studioWindows.projectFolderOfTheWindow(commandFromWindow);
  const listedStreams = yield* ListedStreams;
  const streamAssetsOfTheProject = listedStreams.streamAssetsOfTheProject(projectFolder);
  const foreignOperation = transacting.operations.find((operation) => !streamAssetsOfTheProject.has(operation.stream));
  if (foreignOperation !== undefined) {
    return yield* new CommandRefused({ words: `The stream asset ${foreignOperation.stream} is not one of the streams the runtime lists in ${projectFolder}.` });
  }
  const { author } = yield* PersonEditingInStudio;
  const runtimeControl = yield* RuntimeControl;
  return yield* runtimeControl
    .call("transact", {
      operations: [...transacting.operations],
      mode: transacting.mode,
      author: authorOnTheWire(author),
      ...(transacting.idempotency_key === null ? {} : { idempotency_key: transacting.idempotency_key }),
    })
    .pipe(
      Effect.flatMap((answered) => fromResult(transactionTheWindowReads(answered), (words) => new ContractMismatch({ operation: "transact", words, direction: "answer" }))),
      Effect.map((transaction): ProjectGraphTransactionTheRuntimeAnswered => ({ kind: "applied", transaction })),
      Effect.catchTag("RuntimeRefused", (refused) =>
        refused.refusal === undefined ? Effect.fail(refused) : Effect.succeed<ProjectGraphTransactionTheRuntimeAnswered>({ kind: "refused", refusal: projectActionRefusalOfTheContract(refused.refusal) }),
      ),
    );
});

/** The window's `transact_in_the_open_project` on `studioRuntime`. */
export function transactInTheOpenProjectCommand(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): (sent: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<"transact_in_the_open_project">> {
  return windowCommand(studioRuntime, "transact_in_the_open_project", TransactInTheOpenProjectArguments, transactInTheOpenProject);
}
