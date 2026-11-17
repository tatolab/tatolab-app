// `list_node_ui_elements`: every node UI element a window's views pick their controls from. Today
// that is the Studio's own node UI module, listed from its manifest under this copy's version; a
// project's elements join the listing once the runtime lists and checks them.

import { Effect, type ManagedRuntime, Schema } from "effect";
import type { TatolabCommandAnswerTo } from "../shared/tatolab_electron_bridge_contract.js";
import { StudioAppVersion, StudioWindows, type StudioServices } from "./studio_runtime.js";
import { theStudiosOwnNodeUiElements } from "./studio_node_ui_module.js";
import type { TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import { windowCommand } from "./window_command.js";

/** The node UI elements a studio window, or a view popped out of one, lists; refused in the Projects window, and in words when the Studio's own manifest does not read. */
export const listNodeUiElements = Effect.fn("list_node_ui_elements")(function* (_none: undefined, commandFromWindow: TatolabCommandFromWindow) {
  const studioWindows = yield* StudioWindows;
  yield* studioWindows.projectFolderOfTheWindow(commandFromWindow);
  const { version } = yield* StudioAppVersion;
  return yield* theStudiosOwnNodeUiElements(version).pipe(Effect.tapError((unreadable) => Effect.logError("the Studio's own node UI manifest did not read", unreadable.words)));
});

/** The window's `list_node_ui_elements` on `studioRuntime`. */
export function listNodeUiElementsCommand(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): (sent: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<"list_node_ui_elements">> {
  return windowCommand(studioRuntime, "list_node_ui_elements", Schema.Undefined, listNodeUiElements);
}
