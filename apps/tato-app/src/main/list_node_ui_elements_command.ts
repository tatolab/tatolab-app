// `list_node_ui_elements`: every node UI element a window's views pick their controls from: the
// Studio's own node UI module, listed from its manifest under this copy's version, then the
// elements the window's project and its imports register, each module's folder through the
// extension check gate.

import { Effect, type ManagedRuntime, Schema } from "effect";
import type { TatolabCommandAnswerTo } from "../shared/tatolab_electron_bridge_contract.js";
import { projectNodeUiElementsOfTheOpenProject } from "./project_node_ui_elements.js";
import { StudioAppVersion, StudioWindows, type StudioServices } from "./studio_runtime.js";
import { theStudiosOwnNodeUiElements } from "./studio_node_ui_module.js";
import type { TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import { windowCommand } from "./window_command.js";

/** The node UI elements a studio window, or a view popped out of one, lists: the Studio's own, then its project's; refused in the Projects window, and in words when the Studio's own manifest does not read. */
export const listNodeUiElements = Effect.fn("list_node_ui_elements")(function* (_none: undefined, commandFromWindow: TatolabCommandFromWindow) {
  const studioWindows = yield* StudioWindows;
  const projectFolder = yield* studioWindows.projectFolderOfTheWindow(commandFromWindow);
  const { version } = yield* StudioAppVersion;
  const studiosOwn = yield* theStudiosOwnNodeUiElements(version).pipe(Effect.tapError((unreadable) => Effect.logError("the Studio's own node UI manifest did not read", unreadable.words)));
  return [...studiosOwn, ...(yield* projectNodeUiElementsOfTheOpenProject(projectFolder))];
});

/** The window's `list_node_ui_elements` on `studioRuntime`. */
export function listNodeUiElementsCommand(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): (sent: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<"list_node_ui_elements">> {
  return windowCommand(studioRuntime, "list_node_ui_elements", Schema.Undefined, listNodeUiElements);
}
