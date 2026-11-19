import path from "node:path";
import { projectTransactionAuthorSchema } from "@tatolab/tato-app-view-sdk/studio_host/studio_reading_schemas";
import { Effect, Schema, type ManagedRuntime } from "effect";
import type { JsonValue, OpenProjectReading, PoppedOutView, PortViewerTarget, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { isAJsonObject, isAJsonValue } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { studioViewsOfTheOpenProject } from "./open_project_views.js";
import { createANodeFileInTheOpenProject, listTheOpenProjectsFiles, readTheOpenProjectsFile, saveTheOpenProjectsFile } from "./open_project_files.js";
import { importTheFilesThePersonChooses } from "./project_assets_imported_from_chosen_files.js";
import { deleteAsset, openProject, pausePlayback, readAssetPreview, relocateAsset, reloadProject, resumePlayback, startPlayback, stopPlayback, undoOrRedo } from "./runtime_operations.js";
import { ListedStreams, PersonEditingInStudio, StudioWindows, thenAStatusRound, type StatusRounds, type StudioServices } from "./studio_runtime.js";
import { CommandRefused, windowCommand } from "./window_command.js";
import { type TatolabCommandFromWindow, NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL, studioWindowTheCommandCameFrom, oneTextArgumentFrom, type TatolabWindowCommandHandlers, commandAnswerFrom, commandAnswerOfNothingFrom } from "./tatolab_command_answers.js";

/**
 * The playback of the project in `projectFolder` started as the runtime last listed it, a failed stream of an open one first reloaded, which retries it and
 * keeps the playback: a closed project opened, then played; a paused one resumed; one with a running stream left as it plays once a reload retried its failed
 * stream, and otherwise handed to `start_playback`, which refuses it in its own words; a stopped or preparing one handed to `start_playback`.
 */
const startThePlaybackOfTheProject = Effect.fn("startThePlaybackOfTheProject")(function* (projectFolder: string) {
  const { playback, a_stream_has_failed: aStreamHasFailed, a_stream_is_running: aStreamIsRunning } = (yield* ListedStreams).playbackOfTheProject(projectFolder);
  if (playback === "closed") {
    yield* openProject(projectFolder);
    yield* startPlayback(projectFolder);
    return;
  }
  if (aStreamHasFailed) yield* reloadProject(projectFolder);
  switch (playback) {
    case "paused":
      yield* resumePlayback(projectFolder);
      return;
    case "playing":
    case "stopping":
      if (!(aStreamHasFailed && aStreamIsRunning)) yield* startPlayback(projectFolder);
      return;
    case "stopped":
    case "preparing":
      yield* startPlayback(projectFolder);
      return;
    default:
      return playback satisfies never;
  }
});

/** `run_open_project`: the playback of the asking window's project started, opening it first while it is closed, reloading it first while a stream of it has failed and resuming it while it is paused, then a status round; refused in the Projects window, or in the runtime's own words. */
const runOpenProject = Effect.fn("runOpenProject")(function* (commandFromWindow: TatolabCommandFromWindow) {
  const reading = yield* (yield* StudioWindows).openProjectReadingOfTheWindow(commandFromWindow);
  if (reading.kind === "none_open") return yield* new CommandRefused({ words: "No project is open to run." });
  if (reading.kind === "unreadable") return yield* new CommandRefused({ words: `The project in ${reading.folder} could not be read: ${reading.refusal}` });
  yield* thenAStatusRound(startThePlaybackOfTheProject(reading.open_project.project.folder));
  return null;
});

/** The asking window's project's folder handed to `ofTheFolder`; refused in the Projects window. */
function ofTheWindowsProject<Answer, Failure, Services>(
  commandFromWindow: TatolabCommandFromWindow,
  ofTheFolder: (projectFolder: string) => Effect.Effect<Answer, Failure, Services>,
): Effect.Effect<Answer, Failure | CommandRefused, Services | StudioWindows> {
  return StudioWindows.use((studioWindows) => studioWindows.projectFolderOfTheWindow(commandFromWindow)).pipe(Effect.flatMap(ofTheFolder));
}

/** The asking window's project's folder handed to `ofTheFolder`, then a status round whether the runtime carried it out or refused it, answering nothing; refused in the Projects window. */
function ofTheWindowsProjectThenAStatusRound<Answer, Failure, Services>(
  commandFromWindow: TatolabCommandFromWindow,
  ofTheFolder: (projectFolder: string) => Effect.Effect<Answer, Failure, Services>,
): Effect.Effect<null, Failure | CommandRefused, Services | StudioWindows | StatusRounds> {
  return ofTheWindowsProject(commandFromWindow, (projectFolder) => thenAStatusRound(ofTheFolder(projectFolder))).pipe(Effect.as(null));
}

/** The asking window's project's folder and the person editing in Studio handed to `byThePerson`, answering nothing; refused in the Projects window. */
function byThePersonEditingInTheWindowsProject<Answer, Failure, Services>(
  commandFromWindow: TatolabCommandFromWindow,
  byThePerson: (projectFolder: string, author: ProjectTransactionAuthor) => Effect.Effect<Answer, Failure, Services>,
): Effect.Effect<null, Failure | CommandRefused, Services | StudioWindows | PersonEditingInStudio> {
  return ofTheWindowsProject(commandFromWindow, (projectFolder) => PersonEditingInStudio.use(({ author }) => byThePerson(projectFolder, author))).pipe(Effect.as(null));
}

/** The window's `undo_in_the_open_project` or `redo_in_the_open_project` on `studioRuntime`: the runtime's `undo` or `redo` by the window's author on its project, answering the transaction it applied; refused in the Projects window, or in the runtime's own words. */
function undoOrRedoCommand(studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>, undoOrRedoTool: "undo" | "redo") {
  return windowCommand(studioRuntime, `${undoOrRedoTool}_in_the_open_project`, UndoOrRedoArguments, ({ author }, commandFromWindow) =>
    ofTheWindowsProject(commandFromWindow, (projectFolder) => undoOrRedo(undoOrRedoTool, projectFolder, author)),
  );
}

/** The arguments of `undo_in_the_open_project` and `redo_in_the_open_project`: the person or agent by the name history shows. */
const UndoOrRedoArguments = Schema.Struct({ author: projectTransactionAuthorSchema });

/** The arguments of `relocate_asset_in_the_open_project`: the UUID of an asset of the open project and its new path in the project. */
const RelocateAssetArguments = Schema.Struct({ asset: Schema.String, to_path: Schema.String });

/** The arguments of `import_assets_into_the_open_project`: the `media_facts` members the dialog offers files of first, `null` for any. */
const ImportAssetsArguments = Schema.Struct({ media: Schema.NullOr(Schema.Array(Schema.String)) });

/** The arguments of the commands on one asset of the open project: its UUID. */
const AssetArguments = Schema.Struct({ asset: Schema.String });

/** After a save of `savedFile`, a `.py` file of `projectDirectory`, the open project read again as `tatolab dev` does on a save, keeping its playback, then a status round; a closed one is left alone, and a refusal is logged in the runtime's own words. */
export const reloadTheOpenProjectAfterASaveOfItsPythonFile = Effect.fn("reloadTheOpenProjectAfterASaveOfItsPythonFile")(function* (projectDirectory: string, savedFile: string) {
  if (path.extname(savedFile) !== ".py" || !(yield* ListedStreams).theProjectIsListedOpen(projectDirectory)) return;
  yield* thenAStatusRound(reloadProject(projectDirectory)).pipe(
    Effect.matchEffect({
      onSuccess: (queued) => Effect.logInfo("reloaded the project after a save of its Python file").pipe(Effect.annotateLogs({ action: queued.action })),
      onFailure: (refused) => Effect.logWarning("the runtime refused to reload the project after a save of its Python file").pipe(Effect.annotateLogs({ refusal: refused.words })),
    }),
    Effect.annotateLogs({ project_folder: projectDirectory, file: savedFile }),
  );
});

/** `save_project_file`: `text` saved to `file` of the open project `reading` holds when it still has `based_on_version`, then the project reloaded for a saved Python file it plays. */
const saveTheOpenProjectFileThenReload = Effect.fn("saveTheOpenProjectFileThenReload")(function* (reading: OpenProjectReading, file: string, text: string, basedOnVersion: string | null) {
  const saved = yield* saveTheOpenProjectsFile(reading, file, text, basedOnVersion);
  if (reading.kind === "read") yield* reloadTheOpenProjectAfterASaveOfItsPythonFile(reading.open_project.project.folder, file);
  return saved;
});

/** The asking window's open project as read now handed to `ofTheReading`; refused in the Projects window. */
function ofTheWindowsOpenProject<Answer, Failure, Services>(
  commandFromWindow: TatolabCommandFromWindow,
  ofTheReading: (reading: OpenProjectReading) => Effect.Effect<Answer, Failure, Services>,
): Effect.Effect<Answer, Failure | CommandRefused, Services | StudioWindows> {
  return StudioWindows.use((studioWindows) => studioWindows.openProjectReadingOfTheWindow(commandFromWindow)).pipe(Effect.flatMap(ofTheReading));
}

/** The arguments of `read_project_file` and `create_node_file`: an absolute path in the open project. */
const ProjectFileArguments = Schema.Struct({ file: Schema.String });

/** The arguments of `save_project_file`: an absolute path in the open project, its whole text, and the version it was read at, `null` for a new file. */
const SaveProjectFileArguments = Schema.Struct({ file: Schema.String, text: Schema.String, based_on_version: Schema.NullOr(Schema.String) });

/** The arguments of `list_project_files`: the folder of the open project or of one of its imports. */
const ListProjectFilesArguments = Schema.Struct({ project_folder: Schema.String });

/** `pop_out_view`'s arguments as the window sends them, or why they are not. */
function popOutViewArgumentsFrom(commandArguments: unknown): Result<PoppedOutView, string> {
  const pinnedTo = isAJsonObject(commandArguments) ? commandArguments["pinned_to"] : undefined;
  if (
    !isAJsonObject(commandArguments) ||
    typeof commandArguments["view_type_id"] !== "string" ||
    typeof commandArguments["window_title"] !== "string" ||
    pinnedTo === undefined ||
    !isAJsonValue(pinnedTo)
  ) {
    return failedWith("pop_out_view needs `view_type_id`, the view type to pop out, `window_title`, the words its window is titled with, and `pinned_to`, a JSON value the window reads back");
  }
  return succeeded({ view_type_id: commandArguments["view_type_id"], window_title: commandArguments["window_title"], pinned_to: pinnedTo });
}

/** `pop_out_view`: a view pinned to `target` popped out of the asking studio window; refused from any other window. */
function popOutView(sharedState: TatolabAppSharedState, target: PoppedOutView, commandFromWindow: TatolabCommandFromWindow): Result<void, string> {
  const studioWindow = sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId);
  if (studioWindow === null) return failedWith("Only a project's studio window can pop out one of its views.");
  sharedState.appWindows.popOutTheViewOf(studioWindow, target);
  return succeeded(undefined);
}

/** `send_to_python_language_server`'s arguments as the window sends them, or why they are not. */
function sendToPythonLanguageServerArgumentsFrom(commandArguments: unknown): Result<{ session: string; message: JsonValue }, string> {
  const message = isAJsonObject(commandArguments) ? commandArguments["message"] : undefined;
  const session = isAJsonObject(commandArguments) ? commandArguments["session"] : undefined;
  if (typeof session !== "string" || !isAJsonObject(message) || !isAJsonValue(message)) {
    return failedWith("send_to_python_language_server needs `session`, a language server's session, and `message`, one JSON-RPC message");
  }
  return succeeded({ session, message });
}

/** `open_port_viewer`'s arguments as the window sends them, or why they are not. */
function openPortViewerArgumentsFrom(commandArguments: unknown): Result<PortViewerTarget, string> {
  if (
    !isAJsonObject(commandArguments) ||
    typeof commandArguments["stream"] !== "string" ||
    typeof commandArguments["node_id"] !== "string" ||
    typeof commandArguments["port"] !== "string"
  ) {
    return failedWith("open_port_viewer needs `stream`, a stream's id, `node_id`, a node's id as the graph lists it, and `port`, one of its output ports");
  }
  return succeeded({ stream: commandArguments["stream"], node_id: commandArguments["node_id"], port: commandArguments["port"] });
}

type OpenProjectCommandName =
  | "pop_out_view"
  | "read_popped_out_view"
  | "read_project_file"
  | "save_project_file"
  | "create_node_file"
  | "list_project_files"
  | "list_studio_views_of_the_open_project"
  | "run_open_project"
  | "pause_open_project"
  | "stop_open_project"
  | "read_open_project_transactions"
  | "undo_in_the_open_project"
  | "import_assets_into_the_open_project"
  | "relocate_asset_in_the_open_project"
  | "read_asset_preview_of_the_open_project"
  | "delete_asset_from_the_open_project"
  | "read_the_person_editing_in_studio"
  | "redo_in_the_open_project"
  | "start_python_language_server"
  | "send_to_python_language_server"
  | "stop_python_language_server"
  | "open_port_viewer"
  | "close_port_viewer";

/** The handlers of a studio window's commands on its open project: its files, playback, transactions, assets, views, pop-outs, language servers and port viewers, over `sharedState`, the converted ones run on `studioRuntime`. */
export function openProjectCommandHandlersOf(
  sharedState: TatolabAppSharedState,
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): Pick<TatolabWindowCommandHandlers, OpenProjectCommandName> {
  return {
    pop_out_view: async (commandArguments, commandFromWindow) => {
      const target = popOutViewArgumentsFrom(commandArguments);
      if (!target.ok) return { ok: false, refusal: target.failure };
      return commandAnswerOfNothingFrom(popOutView(sharedState, target.value, commandFromWindow));
    },
    read_popped_out_view: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.poppedOutViewOfTheWindowWithContents(commandFromWindow.windowContentsId),
    }),
    read_project_file: windowCommand(studioRuntime, "read_project_file", ProjectFileArguments, ({ file }, commandFromWindow) =>
      ofTheWindowsOpenProject(commandFromWindow, (reading) => readTheOpenProjectsFile(reading, file)),
    ),
    save_project_file: windowCommand(studioRuntime, "save_project_file", SaveProjectFileArguments, ({ file, text, based_on_version }, commandFromWindow) =>
      ofTheWindowsOpenProject(commandFromWindow, (reading) => saveTheOpenProjectFileThenReload(reading, file, text, based_on_version)),
    ),
    create_node_file: windowCommand(studioRuntime, "create_node_file", ProjectFileArguments, ({ file }, commandFromWindow) =>
      ofTheWindowsOpenProject(commandFromWindow, (reading) => createANodeFileInTheOpenProject(reading, file)),
    ),
    list_project_files: windowCommand(studioRuntime, "list_project_files", ListProjectFilesArguments, ({ project_folder }, commandFromWindow) =>
      ofTheWindowsOpenProject(commandFromWindow, (reading) => listTheOpenProjectsFiles(reading, project_folder)),
    ),
    list_studio_views_of_the_open_project: windowCommand(studioRuntime, "list_studio_views_of_the_open_project", Schema.Undefined, (_nothing, commandFromWindow) =>
      ofTheWindowsOpenProject(commandFromWindow, studioViewsOfTheOpenProject),
    ),
    run_open_project: windowCommand(studioRuntime, "run_open_project", Schema.Undefined, (_nothing, commandFromWindow) => runOpenProject(commandFromWindow)),
    pause_open_project: windowCommand(studioRuntime, "pause_open_project", Schema.Undefined, (_nothing, commandFromWindow) =>
      ofTheWindowsProjectThenAStatusRound(commandFromWindow, pausePlayback),
    ),
    stop_open_project: windowCommand(studioRuntime, "stop_open_project", Schema.Undefined, (_nothing, commandFromWindow) =>
      ofTheWindowsProjectThenAStatusRound(commandFromWindow, stopPlayback),
    ),
    read_open_project_transactions: async (_commandArguments, commandFromWindow) => {
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      return studioWindow.ok ? { ok: true, value: studioWindow.value.projectTransactionsFeed.readProjectTransactions() } : { ok: false, refusal: studioWindow.failure };
    },
    undo_in_the_open_project: undoOrRedoCommand(studioRuntime, "undo"),
    import_assets_into_the_open_project: windowCommand(studioRuntime, "import_assets_into_the_open_project", ImportAssetsArguments, ({ media }, commandFromWindow) =>
      ofTheWindowsProject(commandFromWindow, (projectFolder) => PersonEditingInStudio.use(({ author }) => importTheFilesThePersonChooses(projectFolder, media, author))),
    ),
    relocate_asset_in_the_open_project: windowCommand(studioRuntime, "relocate_asset_in_the_open_project", RelocateAssetArguments, ({ asset, to_path }, commandFromWindow) =>
      byThePersonEditingInTheWindowsProject(commandFromWindow, (projectFolder, author) => relocateAsset(projectFolder, asset, to_path, author)),
    ),
    read_asset_preview_of_the_open_project: windowCommand(studioRuntime, "read_asset_preview_of_the_open_project", AssetArguments, ({ asset }, commandFromWindow) =>
      ofTheWindowsProject(commandFromWindow, (projectFolder) => readAssetPreview(projectFolder, asset)).pipe(
        Effect.map(({ media_type, picture_bytes, pixel_width, pixel_height }) => ({ picture_url: `data:${media_type};base64,${picture_bytes.toString("base64")}`, pixel_width, pixel_height })),
      ),
    ),
    delete_asset_from_the_open_project: windowCommand(studioRuntime, "delete_asset_from_the_open_project", AssetArguments, ({ asset }, commandFromWindow) =>
      byThePersonEditingInTheWindowsProject(commandFromWindow, (projectFolder, author) => deleteAsset(projectFolder, asset, author)),
    ),
    read_the_person_editing_in_studio: async () => ({ ok: true, value: sharedState.thePersonEditingInStudio }),
    redo_in_the_open_project: undoOrRedoCommand(studioRuntime, "redo"),
    start_python_language_server: async (commandArguments, commandFromWindow) => {
      const projectFolder = oneTextArgumentFrom("start_python_language_server", commandArguments, "project_folder", "the folder of the open project or of one of its imports");
      if (!projectFolder.ok) return { ok: false, refusal: projectFolder.failure };
      const languageServerOfTheWindow = sharedState.appWindows.languageServerOfTheWindowWithContents(commandFromWindow.windowContentsId);
      if (languageServerOfTheWindow === null) return { ok: false, refusal: NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL };
      return commandAnswerFrom(sharedState.pythonLanguageServers.startALanguageServer(projectFolder.value, languageServerOfTheWindow));
    },
    send_to_python_language_server: async (commandArguments) => {
      const sendArguments = sendToPythonLanguageServerArgumentsFrom(commandArguments);
      if (!sendArguments.ok) return { ok: false, refusal: sendArguments.failure };
      return commandAnswerOfNothingFrom(sharedState.pythonLanguageServers.sendToALanguageServer(sendArguments.value.session, sendArguments.value.message));
    },
    stop_python_language_server: async (commandArguments) => {
      const session = oneTextArgumentFrom("stop_python_language_server", commandArguments, "session", "a language server's session");
      if (!session.ok) return { ok: false, refusal: session.failure };
      sharedState.pythonLanguageServers.stopALanguageServer(session.value);
      return { ok: true, value: null };
    },
    open_port_viewer: async (commandArguments, commandFromWindow) => {
      const target = openPortViewerArgumentsFrom(commandArguments);
      if (!target.ok) return { ok: false, refusal: target.failure };
      const windowShowingPortViewers = sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId);
      if (windowShowingPortViewers === null) return { ok: false, refusal: "Only a studio window or a popped-out view shows a port." };
      return commandAnswerFrom(await sharedState.runtimePortViewers.openAPortViewer(target.value, windowShowingPortViewers));
    },
    close_port_viewer: async (commandArguments, commandFromWindow) => {
      const portViewer = oneTextArgumentFrom("close_port_viewer", commandArguments, "port_viewer", "a port viewer the window opened");
      if (!portViewer.ok) return { ok: false, refusal: portViewer.failure };
      const windowShowingPortViewers = sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId);
      if (windowShowingPortViewers !== null) sharedState.runtimePortViewers.closeAPortViewer(portViewer.value, windowShowingPortViewers);
      return { ok: true, value: null };
    },
  };
}
