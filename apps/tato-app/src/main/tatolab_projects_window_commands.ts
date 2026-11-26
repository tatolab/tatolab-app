import { Effect, Schema, type ManagedRuntime } from "effect";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { NO_PROJECT_OPEN_IN_THE_WINDOW } from "./tatolab_app_windows.js";
import type { TatolabCommandFromWindow, TatolabWindowCommandHandlers } from "./tatolab_command_answers.js";
import {
  chooseNewProjectLocation,
  chooseProjectArchiveToImport,
  chooseProjectCoverImage,
  chooseProjectFolder,
  createNewProject,
  deleteRecentProject,
  duplicateRecentProject,
  importProjectArchive,
  openRecentProject,
  readNewProjectDefaults,
  readRecentProjectCover,
  readRecentProjects,
  removeRecentProject,
  renameRecentProject,
  setRecentProjectCover,
  setRecentProjectDescription,
} from "./open_project.js";
import { StudioWindows, thenAStatusRound, type StudioServices } from "./studio_runtime.js";
import { windowCommand } from "./window_command.js";

/** The Projects window stepped aside for the project's own window when `commandFromWindow` came from it; a studio window is left as it is. */
function stepTheProjectsWindowAsideFor(commandFromWindow: TatolabCommandFromWindow): Effect.Effect<void, never, StudioWindows> {
  return StudioWindows.use((studioWindows) => studioWindows.stepTheProjectsWindowAsideFor(commandFromWindow));
}

/** `opening`, then, once it opened a project, the Projects window stepped aside as `stepTheProjectsWindowAsideFor` does. */
function thenStepTheProjectsWindowAside<Answer, Failure, Services>(
  commandFromWindow: TatolabCommandFromWindow,
  opening: Effect.Effect<Answer, Failure, Services>,
): Effect.Effect<Answer, Failure, Services | StudioWindows> {
  return opening.pipe(Effect.tap(() => stepTheProjectsWindowAsideFor(commandFromWindow)));
}

/** The arguments of `choose_project_folder`: what the folder is chosen for. */
const ChooseProjectFolderArguments = Schema.Struct({ chosen_for: Schema.Literal("project_to_open") });

/** The arguments of `choose_new_project_location`: the folder the dialog opens in. */
const ChooseNewProjectLocationArguments = Schema.Struct({ starting_at: Schema.String });

/** The arguments of `create_new_project`: the new project's name and the full path of the folder it goes in. */
const CreateNewProjectArguments = Schema.Struct({ name: Schema.String, location: Schema.String });

/** The arguments of the commands on one recent project: its folder. */
const RecentProjectArguments = Schema.Struct({ folder: Schema.String });

/** The arguments of `rename_recent_project`: one of the recent projects' folders and its new name. */
const RenameRecentProjectArguments = Schema.Struct({ folder: Schema.String, name: Schema.String });

/** The arguments of `set_recent_project_description`: one of the recent projects' folders and what it is, blank to clear it. */
const SetRecentProjectDescriptionArguments = Schema.Struct({ folder: Schema.String, description: Schema.String });

/** The arguments of `set_recent_project_cover`: one of the recent projects' folders and the full path of an image, or `null` for the plain cover. */
const SetRecentProjectCoverArguments = Schema.Struct({ folder: Schema.String, image: Schema.NullOr(Schema.String) });

/** The arguments of `import_project_archive`: the project `.zip` chosen in the dialog, the imported project's name and the folder it goes in. */
const ImportProjectArchiveArguments = Schema.Struct({ archive: Schema.String, name: Schema.String, location: Schema.String });

type ProjectsWindowCommandName =
  | "choose_project_folder"
  | "read_new_project_defaults"
  | "choose_new_project_location"
  | "create_new_project"
  | "read_open_project"
  | "read_recent_projects"
  | "open_recent_project"
  | "rename_recent_project"
  | "duplicate_recent_project"
  | "remove_recent_project"
  | "delete_recent_project"
  | "read_recent_project_cover"
  | "set_recent_project_description"
  | "choose_project_cover_image"
  | "set_recent_project_cover"
  | "choose_project_archive_to_import"
  | "import_project_archive"
  | "show_projects_window";

/** The handlers of the Projects window's commands on new, recent and imported projects, run on `studioRuntime`, over `sharedState`'s windows. */
export function projectsWindowCommandHandlersOf(
  sharedState: TatolabAppSharedState,
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): Pick<TatolabWindowCommandHandlers, ProjectsWindowCommandName> {
  return {
    choose_project_folder: windowCommand(studioRuntime, "choose_project_folder", ChooseProjectFolderArguments, ({ chosen_for }, commandFromWindow) =>
      StudioWindows.use((studioWindows) =>
        chooseProjectFolder(chosen_for, studioWindows.openedFolderOfTheStudioWindow(commandFromWindow)).pipe(
          Effect.tap((chosen) => (chosen === null ? Effect.void : stepTheProjectsWindowAsideFor(commandFromWindow))),
        ),
      ),
    ),
    read_new_project_defaults: windowCommand(studioRuntime, "read_new_project_defaults", Schema.Undefined, () => readNewProjectDefaults),
    choose_new_project_location: windowCommand(studioRuntime, "choose_new_project_location", ChooseNewProjectLocationArguments, ({ starting_at }) => chooseNewProjectLocation(starting_at)),
    create_new_project: windowCommand(studioRuntime, "create_new_project", CreateNewProjectArguments, ({ name, location }, commandFromWindow) =>
      thenStepTheProjectsWindowAside(commandFromWindow, thenAStatusRound(createNewProject(name, location))),
    ),
    read_open_project: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId)?.openProject.readOpenProject() ?? NO_PROJECT_OPEN_IN_THE_WINDOW,
    }),
    read_recent_projects: windowCommand(studioRuntime, "read_recent_projects", Schema.Undefined, () => readRecentProjects),
    open_recent_project: windowCommand(studioRuntime, "open_recent_project", RecentProjectArguments, ({ folder }, commandFromWindow) =>
      thenStepTheProjectsWindowAside(commandFromWindow, openRecentProject(folder)).pipe(Effect.as(null)),
    ),
    rename_recent_project: windowCommand(studioRuntime, "rename_recent_project", RenameRecentProjectArguments, ({ folder, name }) => renameRecentProject(folder, name).pipe(Effect.as(null))),
    duplicate_recent_project: windowCommand(studioRuntime, "duplicate_recent_project", RecentProjectArguments, ({ folder }) => duplicateRecentProject(folder)),
    remove_recent_project: windowCommand(studioRuntime, "remove_recent_project", RecentProjectArguments, ({ folder }) => thenAStatusRound(removeRecentProject(folder)).pipe(Effect.as(null))),
    delete_recent_project: windowCommand(studioRuntime, "delete_recent_project", RecentProjectArguments, ({ folder }) => thenAStatusRound(deleteRecentProject(folder)).pipe(Effect.as(null))),
    read_recent_project_cover: windowCommand(studioRuntime, "read_recent_project_cover", RecentProjectArguments, ({ folder }) => readRecentProjectCover(folder)),
    set_recent_project_description: windowCommand(studioRuntime, "set_recent_project_description", SetRecentProjectDescriptionArguments, ({ folder, description }) =>
      setRecentProjectDescription(folder, description).pipe(Effect.as(null)),
    ),
    choose_project_cover_image: windowCommand(studioRuntime, "choose_project_cover_image", Schema.Undefined, () => chooseProjectCoverImage),
    set_recent_project_cover: windowCommand(studioRuntime, "set_recent_project_cover", SetRecentProjectCoverArguments, ({ folder, image }) =>
      setRecentProjectCover(folder, image).pipe(Effect.as(null)),
    ),
    choose_project_archive_to_import: windowCommand(studioRuntime, "choose_project_archive_to_import", Schema.Undefined, () => chooseProjectArchiveToImport),
    import_project_archive: windowCommand(studioRuntime, "import_project_archive", ImportProjectArchiveArguments, ({ archive, name, location }, commandFromWindow) =>
      thenStepTheProjectsWindowAside(commandFromWindow, thenAStatusRound(importProjectArchive(archive, name, location))),
    ),
    show_projects_window: async () => {
      sharedState.appWindows.showTheProjectsWindow();
      return { ok: true, value: null };
    },
  };
}
