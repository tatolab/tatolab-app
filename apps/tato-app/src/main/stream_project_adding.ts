// Adding a project from the Projects window's add menu: choosing its folder in the app's own dialog,
// then queuing the runtime's creation or open of it. A command naming a folder acts only on one the
// app handed the window from that dialog, so a page can never have the runtime create or open a path
// of its choosing.

import path from "node:path";
import { Effect } from "effect";
import type { StreamProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import { isAnExistingFolderOnThisMachine, realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import type { Result } from "./result.js";
import { createProject, openProject } from "./runtime_operations.js";
import { FoldersChosenInTheWindow, ProjectDialogs, thenAStatusRound, ThisMachinesFolders } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

/** The folder under the home directory the runtime draws a new project's folder in, where the dialog opens for one. */
const NEW_STREAM_PROJECTS_FOLDER_IN_HOME = "streams";

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`: an existing project to import, or a new project's folder, which may not exist yet. `null` when they cancel. */
export type StreamProjectFolderDialog = (chosenFor: StreamProjectFolderChosenFor, defaultFolder: string) => Promise<Result<string | null, string>>;

/** Where the dialog opens for `chosenFor`: the home folder for a project to open, `~/streams` for a new project's folder once that folder exists. */
const dialogsDefaultFolder = Effect.fn("dialogsDefaultFolder")(function* (chosenFor: StreamProjectFolderChosenFor) {
  const { homeDirectory } = yield* ThisMachinesFolders;
  const newStreamProjectsFolder = path.join(homeDirectory, NEW_STREAM_PROJECTS_FOLDER_IN_HOME);
  switch (chosenFor) {
    case "project_to_open":
      return homeDirectory;
    case "new_project_directory":
      return (yield* Effect.promise(() => isAnExistingFolderOnThisMachine(newStreamProjectsFolder))) ? newStreamProjectsFolder : homeDirectory;
  }
});

/** `choose_stream_project_folder`: a folder the person chooses in the dialog, absolute with its links resolved as the runtime lists a project's, remembered as handed to the window; `null` when they cancel. */
export const chooseAStreamProjectFolder = Effect.fn("chooseAStreamProjectFolder")(function* (chosenFor: StreamProjectFolderChosenFor) {
  const chosenFolder = yield* (yield* ProjectDialogs).chooseAStreamProjectFolder(chosenFor, yield* dialogsDefaultFolder(chosenFor));
  if (chosenFolder === null) return null;
  const resolvedFolder = yield* Effect.promise(() => realPathOrAsGiven(path.resolve(chosenFolder)));
  yield* (yield* FoldersChosenInTheWindow).remember(resolvedFolder);
  return resolvedFolder;
});

/** `folder` resolved, when the app handed it to the window from its dialog; refused otherwise. */
const folderChosenInTheWindow = Effect.fn("folderChosenInTheWindow")(function* (folder: string) {
  if (yield* (yield* FoldersChosenInTheWindow).holds(folder)) return path.resolve(folder);
  return yield* new CommandRefused({ words: `Tato Studio acts only on a folder chosen in its window. Choose ${folder} again.` });
});

/** `create_stream_project`: the runtime's `create_project` queued in `folder`, or with `null` in a folder it draws under `~/streams`, then a status round; refused for a folder not chosen in the window, or in the runtime's own words. */
export const createAStreamProject = Effect.fn("createAStreamProject")(function* (folder: string | null) {
  const projectFolder = folder === null ? null : yield* folderChosenInTheWindow(folder);
  return yield* thenAStatusRound(createProject(projectFolder));
});

/** `open_stream_project`: the runtime's `open_project` queued on `folder`, which opens it with its playback stopped, then a status round; refused for a folder not chosen in the window, or in the runtime's own words. */
export const openAStreamProject = Effect.fn("openAStreamProject")(function* (folder: string) {
  return yield* thenAStatusRound(openProject(yield* folderChosenInTheWindow(folder)));
});
