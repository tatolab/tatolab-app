import path from "node:path";
import { type ListedStream, type JsonValue, type PoppedOutView, type PortViewerTarget, type ProjectTransaction, type ProjectTransactionAuthor, type ProjectAssetsImported, type AssetPreviewPicture } from "../shared/tatolab_backend_contract.js";
import { projectPlaybackAsListed, streamsOfTheProjectIn, theStreamsListTheProjectOpen } from "../shared/project_playback.js";
import type { TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject, isAJsonValue } from "./json_on_the_wire.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { studioViewsOfTheOpenProject } from "./open_project_views.js";
import type { ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import { answerTheWindow, answerTheWindowOnceTheRuntimeAnswered, type TatolabCommandFromWindow, NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL, studioWindowTheCommandCameFrom, isTextOrNull, oneTextArgumentFrom, type TatolabWindowCommandHandlers, commandAnswerFrom, commandAnswerOfNothingFrom } from "./tatolab_command_answers.js";

/** Ask the system for each device the views in `listedViews` declare, off the listing's answer path, logging a failure nothing expected. */
function askTheSystemAheadForTheDevicesTheViewsDeclare(sharedState: TatolabAppSharedState, listedViews: readonly ProjectViewTheRuntimeListed[]): void {
  sharedState.systemMediaAccessAskedAheadForViews.askForTheDevicesTheViewsDeclare(listedViews).catch((unexpectedFailure: unknown) => {
    sharedState.tatolabAppLog.error("asking the system for a device a view declares ended without finishing", { failure: describeCaughtFailure(unexpectedFailure) });
  });
}

/**
 * The playback of the project in `projectDirectory` started as the runtime last listed it, a failed stream of an open one first reloaded, which retries it and
 * keeps the playback: a closed project opened, then played; a paused one resumed; one with a running stream left as it plays once a reload retried its failed
 * stream, and otherwise handed to `start_playback`, which refuses it in its own words; a stopped or preparing one handed to `start_playback`.
 */
async function startThePlaybackOfTheProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<void, LocalApiRequestFailure>> {
  const { playback, a_stream_has_failed: aStreamHasFailed, a_stream_is_running: aStreamIsRunning } = projectPlaybackAsListed(sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [], projectDirectory);
  if (playback === "closed") {
    const opened = await sharedState.controller.openProject(projectDirectory);
    return resultWithoutItsAnswer(opened.ok ? await sharedState.controller.startPlayback(projectDirectory) : opened);
  }
  if (aStreamHasFailed) {
    const reloaded = await sharedState.controller.reloadProject(projectDirectory);
    if (!reloaded.ok) return reloaded;
  }
  switch (playback) {
    case "paused":
      return resultWithoutItsAnswer(await sharedState.controller.resumePlayback(projectDirectory));
    case "playing":
    case "stopping":
      return aStreamHasFailed && aStreamIsRunning ? succeeded(undefined) : resultWithoutItsAnswer(await sharedState.controller.startPlayback(projectDirectory));
    case "stopped":
    case "preparing":
      return resultWithoutItsAnswer(await sharedState.controller.startPlayback(projectDirectory));
  }
}

function resultWithoutItsAnswer<Answer>(answered: Result<Answer, LocalApiRequestFailure>): Result<void, LocalApiRequestFailure> {
  return answered.ok ? succeeded(undefined) : answered;
}

/** What a save of a project's node file asks of the runtime: `reload` while it holds the project in `projectDirectory` open, which keeps its playback, and `nothing` while it is closed. */
export function whatASavedNodeFileAsksOfTheRuntime(listedStreams: readonly ListedStream[], projectDirectory: string): "reload" | "nothing" {
  return theStreamsListTheProjectOpen(streamsOfTheProjectIn(listedStreams, projectDirectory)) ? "reload" : "nothing";
}

/** After a save of `savedFile`, a `.py` file of `projectDirectory`, the open project read again as `tatolab dev` does on a save, keeping its playback; a closed one is left alone, and a refusal is logged in the runtime's own words. */
export async function reloadTheOpenProjectAfterASaveOfItsPythonFile(sharedState: TatolabAppSharedState, projectDirectory: string, savedFile: string): Promise<void> {
  if (path.extname(savedFile) !== ".py") return;
  if (whatASavedNodeFileAsksOfTheRuntime(sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [], projectDirectory) === "nothing") return;
  const queued = await sharedState.controller.reloadProject(projectDirectory);
  sharedState.statusPublisher.requestRefresh();
  if (queued.ok) sharedState.tatolabAppLog.info("reloaded the project after a save of its Python file", { project_folder: projectDirectory, file: savedFile, action: queued.value.action });
  else sharedState.tatolabAppLog.warn("the runtime refused to reload the project after a save of its Python file", { project_folder: projectDirectory, file: savedFile, refusal: queued.failure.failureDescription });
}

/** `run_open_project`: the playback of the asking window's project started, opening it first while it is closed, reloading it first while a stream of it has failed and resuming it while it is paused, then a status round; refused in the Projects window, or in the runtime's own words. */
function runOpenProject(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  return answerTheWindow("run_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const reading = studioWindow.value.openProject.readOpenProject();
    if (reading.kind !== "read") return failedWith(reading.kind === "none_open" ? "No project is open to run." : `The project in ${reading.folder} could not be read: ${reading.refusal}`);
    const queued = await startThePlaybackOfTheProject(sharedState, reading.open_project.project.folder);
    sharedState.statusPublisher.requestRefresh();
    return queued.ok ? queued : failedWith(queued.failure.failureDescription);
  });
}

/** `pause_open_project`: the runtime's `pause_playback` of the asking window's project's folder, which holds every stream of it loaded and `paused` at once, then a status round; refused in the Projects window, or in the runtime's own words. */
async function pauseOpenProject(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
  if (!studioWindow.ok) return studioWindow;
  return answerTheWindowOnceTheRuntimeAnswered(sharedState, "pause_open_project", () => sharedState.controller.pausePlayback(studioWindow.value.openProject.projectFolder));
}

/** `stop_open_project`: the runtime's `stop_playback` queued on the asking window's project's folder, which keeps its graphs loaded, so the listing shows its streams `stopping`; refused in the Projects window, or in the runtime's own words. */
async function stopOpenProject(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
  if (!studioWindow.ok) return studioWindow;
  return answerTheWindowOnceTheRuntimeAnswered(sharedState, "stop_open_project", () => sharedState.controller.stopPlayback(studioWindow.value.openProject.projectFolder));
}

/** `undo_in_the_open_project`'s and `redo_in_the_open_project`'s `{ author }` as the window sends it, or why it is not. */
function undoOrRedoArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<ProjectTransactionAuthor, string> {
  const author = isAJsonObject(commandArguments) ? commandArguments["author"] : undefined;
  if (!isAJsonObject(author) || (author["kind"] !== "person" && author["kind"] !== "agent") || typeof author["name"] !== "string") {
    return failedWith(`${commandName} needs \`author\`, a person or an agent by the name history shows`);
  }
  return succeeded({ kind: author["kind"], name: author["name"] });
}

/** The runtime's `undo` or `redo` by `author` on the asking window's project, as the feed names its folder; refused in the Projects window, or in the runtime's own words. */
function undoOrRedoInTheOpenProject(
  sharedState: TatolabAppSharedState,
  undoOrRedo: "undo" | "redo",
  author: ProjectTransactionAuthor,
  commandFromWindow: TatolabCommandFromWindow,
): Promise<Result<ProjectTransaction, string>> {
  const commandName = undoOrRedo === "undo" ? "undo_in_the_open_project" : "redo_in_the_open_project";
  return answerTheWindow(commandName, async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const projectFolder = studioWindow.value.projectTransactionsFeed.projectFolder;
    const applied =
      undoOrRedo === "undo" ? await sharedState.controller.undoInTheProject(projectFolder, author) : await sharedState.controller.redoInTheProject(projectFolder, author);
    return applied.ok ? applied : failedWith(applied.failure.failureDescription);
  });
}

/** `import_assets_into_the_open_project`'s `{ media }` as the window sends it: the `media_facts` members the dialog offers files of, `null` for any; or why it is not. */
function importAssetsArgumentsFrom(commandArguments: unknown): Result<{ media: readonly string[] | null }, string> {
  const media = isAJsonObject(commandArguments) ? commandArguments["media"] : undefined;
  if (media === null) return succeeded({ media: null });
  if (Array.isArray(media) && media.every((medium: unknown): medium is string => typeof medium === "string")) return succeeded({ media });
  return failedWith("import_assets_into_the_open_project needs `media`, a list of media names or null");
}

/** `import_assets_into_the_open_project`: the files the person chooses, the dialog offering those of `media` first, imported into the asking window's project by the person editing; `null` when they choose nothing, refused in the Projects window. */
function importAssetsIntoTheOpenProject(sharedState: TatolabAppSharedState, media: readonly string[] | null, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectAssetsImported | null, string>> {
  return answerTheWindow("import_assets_into_the_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    return sharedState.projectAssetsImportedFromChosenFiles.importTheFilesThePersonChooses(studioWindow.value.projectTransactionsFeed.projectFolder, media, sharedState.thePersonEditingInStudio);
  });
}

const AN_ASSET_OF_THE_OPEN_PROJECT_IN_WORDS = "the UUID of an asset of the open project";

/** `relocate_asset_in_the_open_project`'s `{ asset, to_path }` as the window sends it, or why it is not. */
function relocateAssetArgumentsFrom(commandArguments: unknown): Result<{ asset: string; to_path: string }, string> {
  const asset = oneTextArgumentFrom("relocate_asset_in_the_open_project", commandArguments, "asset", AN_ASSET_OF_THE_OPEN_PROJECT_IN_WORDS);
  if (!asset.ok) return asset;
  const toPath = oneTextArgumentFrom("relocate_asset_in_the_open_project", commandArguments, "to_path", "the asset's new path in the project");
  return toPath.ok ? succeeded({ asset: asset.value, to_path: toPath.value }) : toPath;
}

/** `relocate_asset_in_the_open_project`: `asset` of the asking window's project put at `toPath` by the person editing; refused in the Projects window, or in the runtime's own words. */
function relocateAssetInTheOpenProject(sharedState: TatolabAppSharedState, asset: string, toPath: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  return answerTheWindow("relocate_asset_in_the_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const relocated = await sharedState.controller.relocateAsset(studioWindow.value.projectTransactionsFeed.projectFolder, asset, toPath, sharedState.thePersonEditingInStudio);
    return relocated.ok ? succeeded(undefined) : failedWith(relocated.failure.failureDescription);
  });
}

/** `read_asset_preview_of_the_open_project`: the preview picture of `asset` of the asking window's project as a `data:` URL; refused in the Projects window, or in the runtime's own words, as for an asset with none. */
function readAssetPreviewOfTheOpenProject(sharedState: TatolabAppSharedState, asset: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<AssetPreviewPicture, string>> {
  return answerTheWindow("read_asset_preview_of_the_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const picture = await sharedState.controller.readAssetPreview(studioWindow.value.projectTransactionsFeed.projectFolder, asset);
    if (!picture.ok) return failedWith(picture.failure.failureDescription);
    const { media_type: mediaType, picture_bytes: pictureBytes, pixel_width: pixelWidth, pixel_height: pixelHeight } = picture.value;
    return succeeded({ picture_url: `data:${mediaType};base64,${pictureBytes.toString("base64")}`, pixel_width: pixelWidth, pixel_height: pixelHeight });
  });
}

/** `delete_asset_from_the_open_project`: `asset` of the asking window's project no longer tracked, by the person editing; refused in the Projects window, or in the runtime's own words. */
function deleteAssetFromTheOpenProject(sharedState: TatolabAppSharedState, asset: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  return answerTheWindow("delete_asset_from_the_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const deleted = await sharedState.controller.deleteAsset(studioWindow.value.projectTransactionsFeed.projectFolder, asset, sharedState.thePersonEditingInStudio);
    return deleted.ok ? succeeded(undefined) : failedWith(deleted.failure.failureDescription);
  });
}

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

/** `save_project_file`'s arguments as the window sends them, or why they are not. */
function saveProjectFileArgumentsFrom(commandArguments: unknown): Result<{ file: string; text: string; based_on_version: string | null }, string> {
  if (
    !isAJsonObject(commandArguments) ||
    typeof commandArguments["file"] !== "string" ||
    typeof commandArguments["text"] !== "string" ||
    !isTextOrNull(commandArguments["based_on_version"])
  ) {
    return failedWith("save_project_file needs `file`, an absolute path, `text`, and `based_on_version`, the version it was read at or null for a new file");
  }
  return succeeded({ file: commandArguments["file"], text: commandArguments["text"], based_on_version: commandArguments["based_on_version"] });
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

/** The handlers of a studio window's commands on its open project: its files, playback, transactions, assets, views, pop-outs, language servers and port viewers, over `sharedState`. */
export function openProjectCommandHandlersOf(sharedState: TatolabAppSharedState): Pick<TatolabWindowCommandHandlers, OpenProjectCommandName> {
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
    read_project_file: async (commandArguments, commandFromWindow) => {
      const file = oneTextArgumentFrom("read_project_file", commandArguments, "file", "an absolute path in the open project");
      if (!file.ok) return { ok: false, refusal: file.failure };
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      if (!studioWindow.ok) return { ok: false, refusal: studioWindow.failure };
      return commandAnswerFrom(await answerTheWindow("read_project_file", () => studioWindow.value.openProjectFiles.readProjectFile(file.value)));
    },
    save_project_file: async (commandArguments, commandFromWindow) => {
      const saveArguments = saveProjectFileArgumentsFrom(commandArguments);
      if (!saveArguments.ok) return { ok: false, refusal: saveArguments.failure };
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      if (!studioWindow.ok) return { ok: false, refusal: studioWindow.failure };
      const { file, text, based_on_version } = saveArguments.value;
      const saved = await answerTheWindow("save_project_file", () => studioWindow.value.openProjectFiles.saveProjectFile(file, text, based_on_version));
      if (saved.ok) await reloadTheOpenProjectAfterASaveOfItsPythonFile(sharedState, studioWindow.value.openProject.projectFolder, file);
      return commandAnswerFrom(saved);
    },
    create_node_file: async (commandArguments, commandFromWindow) => {
      const file = oneTextArgumentFrom("create_node_file", commandArguments, "file", "an absolute path for a new .py file in the open project");
      if (!file.ok) return { ok: false, refusal: file.failure };
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      if (!studioWindow.ok) return { ok: false, refusal: studioWindow.failure };
      return commandAnswerFrom(await answerTheWindow("create_node_file", () => studioWindow.value.openProjectFiles.createNodeFile(file.value)));
    },
    list_project_files: async (commandArguments, commandFromWindow) => {
      const projectFolder = oneTextArgumentFrom("list_project_files", commandArguments, "project_folder", "the folder of the open project or of one of its imports");
      if (!projectFolder.ok) return { ok: false, refusal: projectFolder.failure };
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      if (!studioWindow.ok) return { ok: false, refusal: studioWindow.failure };
      return commandAnswerFrom(await answerTheWindow("list_project_files", () => studioWindow.value.openProjectFiles.listProjectFiles(projectFolder.value)));
    },
    list_studio_views_of_the_open_project: async (_commandArguments, commandFromWindow) => {
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      if (!studioWindow.ok) return { ok: false, refusal: studioWindow.failure };
      return commandAnswerFrom(
        await answerTheWindow("list_studio_views_of_the_open_project", () =>
          studioViewsOfTheOpenProject(studioWindow.value.openProject.readOpenProject(), async (projectDirectory) => {
            const listed = await sharedState.controller.listProjectViews(projectDirectory);
            if (!listed.ok) return failedWith(listed.failure.failureDescription);
            askTheSystemAheadForTheDevicesTheViewsDeclare(sharedState, listed.value);
            return listed;
          }, sharedState.projectViewsListed),
        ),
      );
    },
    run_open_project: async (_commandArguments, commandFromWindow) => commandAnswerOfNothingFrom(await runOpenProject(sharedState, commandFromWindow)),
    pause_open_project: async (_commandArguments, commandFromWindow) => commandAnswerOfNothingFrom(await pauseOpenProject(sharedState, commandFromWindow)),
    stop_open_project: async (_commandArguments, commandFromWindow) => commandAnswerOfNothingFrom(await stopOpenProject(sharedState, commandFromWindow)),
    read_open_project_transactions: async (_commandArguments, commandFromWindow) => {
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      return studioWindow.ok ? { ok: true, value: studioWindow.value.projectTransactionsFeed.readProjectTransactions() } : { ok: false, refusal: studioWindow.failure };
    },
    undo_in_the_open_project: async (commandArguments, commandFromWindow) => {
      const author = undoOrRedoArgumentsFrom("undo_in_the_open_project", commandArguments);
      if (!author.ok) return { ok: false, refusal: author.failure };
      return commandAnswerFrom(await undoOrRedoInTheOpenProject(sharedState, "undo", author.value, commandFromWindow));
    },
    import_assets_into_the_open_project: async (commandArguments, commandFromWindow) => {
      const importing = importAssetsArgumentsFrom(commandArguments);
      if (!importing.ok) return { ok: false, refusal: importing.failure };
      return commandAnswerFrom(await importAssetsIntoTheOpenProject(sharedState, importing.value.media, commandFromWindow));
    },
    relocate_asset_in_the_open_project: async (commandArguments, commandFromWindow) => {
      const relocating = relocateAssetArgumentsFrom(commandArguments);
      if (!relocating.ok) return { ok: false, refusal: relocating.failure };
      return commandAnswerOfNothingFrom(await relocateAssetInTheOpenProject(sharedState, relocating.value.asset, relocating.value.to_path, commandFromWindow));
    },
    read_asset_preview_of_the_open_project: async (commandArguments, commandFromWindow) => {
      const asset = oneTextArgumentFrom("read_asset_preview_of_the_open_project", commandArguments, "asset", AN_ASSET_OF_THE_OPEN_PROJECT_IN_WORDS);
      if (!asset.ok) return { ok: false, refusal: asset.failure };
      return commandAnswerFrom(await readAssetPreviewOfTheOpenProject(sharedState, asset.value, commandFromWindow));
    },
    delete_asset_from_the_open_project: async (commandArguments, commandFromWindow) => {
      const asset = oneTextArgumentFrom("delete_asset_from_the_open_project", commandArguments, "asset", AN_ASSET_OF_THE_OPEN_PROJECT_IN_WORDS);
      if (!asset.ok) return { ok: false, refusal: asset.failure };
      return commandAnswerOfNothingFrom(await deleteAssetFromTheOpenProject(sharedState, asset.value, commandFromWindow));
    },
    read_the_person_editing_in_studio: async () => ({ ok: true, value: sharedState.thePersonEditingInStudio }),
    redo_in_the_open_project: async (commandArguments, commandFromWindow) => {
      const author = undoOrRedoArgumentsFrom("redo_in_the_open_project", commandArguments);
      if (!author.ok) return { ok: false, refusal: author.failure };
      return commandAnswerFrom(await undoOrRedoInTheOpenProject(sharedState, "redo", author.value, commandFromWindow));
    },
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
