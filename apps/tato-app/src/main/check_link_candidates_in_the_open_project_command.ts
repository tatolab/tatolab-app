// `check_link_candidates_in_the_open_project`: a wire drag's question from a studio window, run on Effect
// from the window's command to the runtime's `check_link_candidates` and back. Its arguments are decoded
// once, at the edge; the runtime's answer is the contract's type, passed on unchanged.

import { Effect, type ManagedRuntime } from "effect";
import type { LinkCandidatesAskedByTheWindow } from "../shared/check_link_candidates_in_the_open_project_arguments.js";
import { CheckLinkCandidatesInTheOpenProjectArguments } from "../shared/check_link_candidates_in_the_open_project_arguments.js";
import type { TatolabCommandAnswerTo } from "../shared/tatolab_electron_bridge_contract.js";
import { ListedStreams, StudioWindows, type StudioServices } from "./studio_runtime.js";
import type { TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { CommandRefused, windowCommand } from "./window_command.js";

/**
 * The runtime's `check_link_candidates` of the window's request, which changes nothing; a stream asset that is not one of the
 * window's project's is refused in Studio's words, and any refusal of the runtime's in its own.
 */
export const checkLinkCandidatesInTheOpenProject = Effect.fn("check_link_candidates_in_the_open_project")(function* (
  asking: LinkCandidatesAskedByTheWindow,
  commandFromWindow: TatolabCommandFromWindow,
) {
  const studioWindows = yield* StudioWindows;
  const projectFolder = yield* studioWindows.projectFolderOfTheWindow(commandFromWindow);
  const listedStreams = yield* ListedStreams;
  if (!listedStreams.streamAssetsOfTheProject(projectFolder).has(asking.stream)) {
    return yield* new CommandRefused({ words: `The stream asset ${asking.stream} is not one of the streams the runtime lists in ${projectFolder}.` });
  }
  const runtimeControl = yield* RuntimeControl;
  return yield* runtimeControl.call("check_link_candidates", asking);
});

/** The window's `check_link_candidates_in_the_open_project` on `studioRuntime`. */
export function checkLinkCandidatesInTheOpenProjectCommand(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): (sent: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<"check_link_candidates_in_the_open_project">> {
  return windowCommand(studioRuntime, "check_link_candidates_in_the_open_project", CheckLinkCandidatesInTheOpenProjectArguments, checkLinkCandidatesInTheOpenProject);
}
