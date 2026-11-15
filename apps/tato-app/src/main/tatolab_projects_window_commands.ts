import type { ChosenProjectFolder, ProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { NO_PROJECT_OPEN_IN_THE_WINDOW } from "./tatolab_app_windows.js";
import { answerTheWindow, answerTheWindowThenRefreshTheStatus, type TatolabCommandFromWindow, oneTextArgumentFrom, type TatolabWindowCommandHandlers, commandAnswerFrom, commandAnswerOfNothingFrom } from "./tatolab_command_answers.js";

/** A project opened from the Projects window steps it aside for the project's own window; one opened from a studio window leaves that window as it is. */
function stepTheProjectsWindowAsideOnceItOpenedAProject(
  sharedState: TatolabAppSharedState,
  commandFromWindow: TatolabCommandFromWindow,
  opened: Result<unknown, string>,
): void {
  if (opened.ok && opened.value !== null && sharedState.appWindows.isTheProjectsWindow(commandFromWindow.windowContentsId)) {
    sharedState.appWindows.projectsWindow.hide();
  }
}

/** `choose_project_folder { chosen_for }`: the app's folder dialog, opened beside the asking window's project, the chosen folder opened in its own studio window; `null` when the person cancels. */
async function chooseProjectFolder(
  sharedState: TatolabAppSharedState,
  chosenFor: ProjectFolderChosenFor,
  commandFromWindow: TatolabCommandFromWindow,
): Promise<Result<ChosenProjectFolder | null, string>> {
  const projectFolderOfTheWindow = sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId)?.openProject.projectFolder ?? null;
  const chosen = await answerTheWindow("choose_project_folder", () => sharedState.projectOpening.chooseProjectFolder(chosenFor, projectFolderOfTheWindow));
  stepTheProjectsWindowAsideOnceItOpenedAProject(sharedState, commandFromWindow, chosen);
  return chosen;
}

/** `choose_project_folder`'s arguments as the window sends them, or why they are not. */
function chooseProjectFolderArgumentsFrom(commandArguments: unknown): Result<{ chosen_for: ProjectFolderChosenFor }, string> {
  const chosenFor = isAJsonObject(commandArguments) ? commandArguments["chosen_for"] : undefined;
  if (chosenFor !== "project_to_open") return failedWith("choose_project_folder needs `chosen_for`, project_to_open");
  return succeeded({ chosen_for: chosenFor });
}

/** `create_new_project { name, location }`: the runtime's `create_project` at `<location>/<name>`, opened in its own studio window, then a status round; refused in the app's words or the runtime's own. */
async function createNewProject(
  sharedState: TatolabAppSharedState,
  name: string,
  location: string,
  commandFromWindow: TatolabCommandFromWindow,
): Promise<Result<ChosenProjectFolder, string>> {
  const created = await answerTheWindow("create_new_project", async () => {
    const createdProject = await sharedState.projectOpening.createNewProject(name, location);
    sharedState.statusPublisher.requestRefresh();
    return createdProject;
  });
  stepTheProjectsWindowAsideOnceItOpenedAProject(sharedState, commandFromWindow, created);
  return created;
}

/** `open_recent_project { folder }`: one of the recent projects opened in its own studio window, or that window brought forward. */
async function openRecentProject(sharedState: TatolabAppSharedState, folder: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  const opened = await answerTheWindow("open_recent_project", () => sharedState.projectOpening.openRecentProject(folder));
  stepTheProjectsWindowAsideOnceItOpenedAProject(sharedState, commandFromWindow, opened.ok ? succeeded(folder) : opened);
  return opened;
}

/** `import_project_archive { archive, name, location }`: the runtime's `import_project` of `archive` into `<location>/<name>`, opened in its own studio window, then a status round; refused in the app's words or the runtime's own. */
async function importProjectArchive(
  sharedState: TatolabAppSharedState,
  importArguments: { archive: string; name: string; location: string },
  commandFromWindow: TatolabCommandFromWindow,
): Promise<Result<ChosenProjectFolder, string>> {
  const imported = await answerTheWindow("import_project_archive", async () => {
    const importedProject = await sharedState.projectOpening.importProjectArchive(importArguments.archive, importArguments.name, importArguments.location);
    sharedState.statusPublisher.requestRefresh();
    return importedProject;
  });
  stepTheProjectsWindowAsideOnceItOpenedAProject(sharedState, commandFromWindow, imported);
  return imported;
}

/** `import_project_archive`'s arguments as the window sends them, or why they are not. */
function importProjectArchiveArgumentsFrom(commandArguments: unknown): Result<{ archive: string; name: string; location: string }, string> {
  const archive = oneTextArgumentFrom("import_project_archive", commandArguments, "archive", "the project .zip chosen in the dialog");
  if (!archive.ok) return archive;
  const name = oneTextArgumentFrom("import_project_archive", commandArguments, "name", "the imported project's name");
  if (!name.ok) return name;
  const location = oneTextArgumentFrom("import_project_archive", commandArguments, "location", "the folder the project goes in");
  if (!location.ok) return location;
  return succeeded({ archive: archive.value, name: name.value, location: location.value });
}

/** `rename_recent_project`'s arguments as the window sends them, or why they are not. */
function renameRecentProjectArgumentsFrom(commandArguments: unknown): Result<{ folder: string; name: string }, string> {
  const folder = oneTextArgumentFrom("rename_recent_project", commandArguments, "folder", "one of the recent projects' folders");
  if (!folder.ok) return folder;
  const name = oneTextArgumentFrom("rename_recent_project", commandArguments, "name", "the project's new name");
  if (!name.ok) return name;
  return succeeded({ folder: folder.value, name: name.value });
}

/** `set_recent_project_description`'s arguments as the window sends them, or why they are not. */
function setRecentProjectDescriptionArgumentsFrom(commandArguments: unknown): Result<{ folder: string; description: string }, string> {
  const folder = oneTextArgumentFrom("set_recent_project_description", commandArguments, "folder", "one of the recent projects' folders");
  if (!folder.ok) return folder;
  const description = oneTextArgumentFrom("set_recent_project_description", commandArguments, "description", "what the project is, blank to clear it");
  if (!description.ok) return description;
  return succeeded({ folder: folder.value, description: description.value });
}

/** `set_recent_project_cover`'s arguments as the window sends them, or why they are not. */
function setRecentProjectCoverArgumentsFrom(commandArguments: unknown): Result<{ folder: string; image: string | null }, string> {
  const folder = oneTextArgumentFrom("set_recent_project_cover", commandArguments, "folder", "one of the recent projects' folders");
  if (!folder.ok) return folder;
  const image = isAJsonObject(commandArguments) ? commandArguments["image"] : undefined;
  if (image !== null && typeof image !== "string") return failedWith("set_recent_project_cover needs `image`, the full path of an image, or null for the plain cover");
  return succeeded({ folder: folder.value, image });
}

/** `create_new_project`'s arguments as the window sends them, or why they are not. */
function createNewProjectArgumentsFrom(commandArguments: unknown): Result<{ name: string; location: string }, string> {
  const name = oneTextArgumentFrom("create_new_project", commandArguments, "name", "the new project's name");
  if (!name.ok) return name;
  const location = oneTextArgumentFrom("create_new_project", commandArguments, "location", "the full path of the folder it goes in");
  return location.ok ? succeeded({ name: name.value, location: location.value }) : location;
}

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
  | "delete_recent_project"
  | "read_recent_project_cover"
  | "set_recent_project_description"
  | "choose_project_cover_image"
  | "set_recent_project_cover"
  | "choose_project_archive_to_import"
  | "import_project_archive"
  | "show_projects_window";

/** The handlers of the Projects window's commands on new, recent and imported projects, over `sharedState`. */
export function projectsWindowCommandHandlersOf(sharedState: TatolabAppSharedState): Pick<TatolabWindowCommandHandlers, ProjectsWindowCommandName> {
  return {
    choose_project_folder: async (commandArguments, commandFromWindow) => {
      const chooseArguments = chooseProjectFolderArgumentsFrom(commandArguments);
      if (!chooseArguments.ok) return { ok: false, refusal: chooseArguments.failure };
      return commandAnswerFrom(await chooseProjectFolder(sharedState, chooseArguments.value.chosen_for, commandFromWindow));
    },
    read_new_project_defaults: async () => ({ ok: true, value: await sharedState.projectOpening.readNewProjectDefaults() }),
    choose_new_project_location: async (commandArguments) => {
      const startingAt = oneTextArgumentFrom("choose_new_project_location", commandArguments, "starting_at", "the folder the dialog opens in");
      if (!startingAt.ok) return { ok: false, refusal: startingAt.failure };
      return commandAnswerFrom(await answerTheWindow("choose_new_project_location", () => sharedState.projectOpening.chooseNewProjectLocation(startingAt.value)));
    },
    create_new_project: async (commandArguments, commandFromWindow) => {
      const createArguments = createNewProjectArgumentsFrom(commandArguments);
      if (!createArguments.ok) return { ok: false, refusal: createArguments.failure };
      return commandAnswerFrom(await createNewProject(sharedState, createArguments.value.name, createArguments.value.location, commandFromWindow));
    },
    read_open_project: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId)?.openProject.readOpenProject() ?? NO_PROJECT_OPEN_IN_THE_WINDOW,
    }),
    read_recent_projects: async () => ({ ok: true, value: await sharedState.projectOpening.readRecentProjects() }),
    open_recent_project: async (commandArguments, commandFromWindow) => {
      const folder = oneTextArgumentFrom("open_recent_project", commandArguments, "folder", "one of the recent projects' folders");
      if (!folder.ok) return { ok: false, refusal: folder.failure };
      return commandAnswerOfNothingFrom(await openRecentProject(sharedState, folder.value, commandFromWindow));
    },
    rename_recent_project: async (commandArguments) => {
      const renameArguments = renameRecentProjectArgumentsFrom(commandArguments);
      if (!renameArguments.ok) return { ok: false, refusal: renameArguments.failure };
      return commandAnswerOfNothingFrom(
        await answerTheWindow("rename_recent_project", () => sharedState.projectOpening.renameRecentProject(renameArguments.value.folder, renameArguments.value.name)),
      );
    },
    duplicate_recent_project: async (commandArguments) => {
      const folder = oneTextArgumentFrom("duplicate_recent_project", commandArguments, "folder", "one of the recent projects' folders");
      if (!folder.ok) return { ok: false, refusal: folder.failure };
      return commandAnswerFrom(await answerTheWindow("duplicate_recent_project", () => sharedState.projectOpening.duplicateRecentProject(folder.value)));
    },
    delete_recent_project: async (commandArguments) => {
      const folder = oneTextArgumentFrom("delete_recent_project", commandArguments, "folder", "one of the recent projects' folders");
      if (!folder.ok) return { ok: false, refusal: folder.failure };
      return commandAnswerOfNothingFrom(
        await answerTheWindowThenRefreshTheStatus(sharedState, "delete_recent_project", () => sharedState.projectOpening.deleteRecentProject(folder.value)),
      );
    },
    read_recent_project_cover: async (commandArguments) => {
      const folder = oneTextArgumentFrom("read_recent_project_cover", commandArguments, "folder", "one of the recent projects' folders");
      if (!folder.ok) return { ok: false, refusal: folder.failure };
      return commandAnswerFrom(await answerTheWindow("read_recent_project_cover", () => sharedState.projectOpening.readRecentProjectCover(folder.value)));
    },
    set_recent_project_description: async (commandArguments) => {
      const descriptionArguments = setRecentProjectDescriptionArgumentsFrom(commandArguments);
      if (!descriptionArguments.ok) return { ok: false, refusal: descriptionArguments.failure };
      return commandAnswerOfNothingFrom(
        await answerTheWindow("set_recent_project_description", () => sharedState.projectOpening.setRecentProjectDescription(descriptionArguments.value.folder, descriptionArguments.value.description)),
      );
    },
    choose_project_cover_image: async () => commandAnswerFrom(await answerTheWindow("choose_project_cover_image", () => sharedState.projectOpening.chooseProjectCoverImage())),
    set_recent_project_cover: async (commandArguments) => {
      const coverArguments = setRecentProjectCoverArgumentsFrom(commandArguments);
      if (!coverArguments.ok) return { ok: false, refusal: coverArguments.failure };
      return commandAnswerOfNothingFrom(
        await answerTheWindow("set_recent_project_cover", () => sharedState.projectOpening.setRecentProjectCover(coverArguments.value.folder, coverArguments.value.image)),
      );
    },
    choose_project_archive_to_import: async () =>
      commandAnswerFrom(await answerTheWindow("choose_project_archive_to_import", () => sharedState.projectOpening.chooseProjectArchiveToImport())),
    import_project_archive: async (commandArguments, commandFromWindow) => {
      const importArguments = importProjectArchiveArgumentsFrom(commandArguments);
      if (!importArguments.ok) return { ok: false, refusal: importArguments.failure };
      return commandAnswerFrom(await importProjectArchive(sharedState, importArguments.value, commandFromWindow));
    },
    show_projects_window: async () => {
      sharedState.appWindows.showTheProjectsWindow();
      return { ok: true, value: null };
    },
  };
}
