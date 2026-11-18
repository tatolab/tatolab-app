// The commands the window's frontend invokes, under the names it invokes them by. A request that
// changes the machine starts in the background, as the tray's choices do, and its outcome reaches
// the window as the next `tatolab-status-changed`. A question the window awaits is answered with
// its answer or a refusal in words, never a thrown error.

import type { ManagedRuntime } from "effect";
import type { StudioServices } from "./studio_runtime.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import type { TatolabWindowCommandHandlers } from "./tatolab_command_answers.js";
import { statusRuntimeAndSettingsCommandHandlersOf } from "./tatolab_status_runtime_and_settings_commands.js";
import { streamAndRuntimeProjectCommandHandlersOf } from "./tatolab_stream_and_runtime_project_commands.js";
import { projectsWindowCommandHandlersOf } from "./tatolab_projects_window_commands.js";
import { openProjectCommandHandlersOf } from "./tatolab_open_project_commands.js";
import { moduleManagerCommandHandlersOf } from "./tatolab_module_manager_commands.js";
import { transactInTheOpenProjectCommand } from "./transact_in_the_open_project_command.js";
import { listNodeUiElementsCommand } from "./list_node_ui_elements_command.js";

/** The handler of every command the window invokes, over `sharedState`, a converted one run on `studioRuntime`; `quit_tatolab_app` quits through `quitTheApp`. */
export function tatolabWindowCommandHandlers(sharedState: TatolabAppSharedState, studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>, quitTheApp: () => void): TatolabWindowCommandHandlers {
  return {
    ...statusRuntimeAndSettingsCommandHandlersOf(sharedState, quitTheApp),
    ...streamAndRuntimeProjectCommandHandlersOf(sharedState, studioRuntime),
    ...projectsWindowCommandHandlersOf(sharedState, studioRuntime),
    ...openProjectCommandHandlersOf(sharedState, studioRuntime),
    ...moduleManagerCommandHandlersOf(sharedState, studioRuntime),
    transact_in_the_open_project: transactInTheOpenProjectCommand(studioRuntime),
    list_node_ui_elements: listNodeUiElementsCommand(studioRuntime),
  };
}
