import type { ProjectCreationQueued, ProjectStreamActionQueued, StreamActionFollowed, StreamAssetCreated, StreamLocation, StreamProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import { streamsOfTheProjectIn, theStreamsListTheProjectOpen } from "../shared/project_playback.js";
import type { TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { openStreamProjectFolder, type StreamProjectFolderOpening } from "./stream_project_folder_opening.js";
import { newStreamDocumentPathNoFileHolds, PROJECT_STREAMS_FOLDER } from "./new_stream_document_path.js";
import { Effect, Schema, type ManagedRuntime } from "effect";
import { cancelStreamAction, describeNodeCatalog, describeStreamGraph, listProjectAssets, listProjectNodeTypes, readProjectLogRecords } from "./runtime_operations.js";
import { ListedStreams, StatusRounds, StudioWindows, type StudioServices } from "./studio_runtime.js";
import { CommandRefused, windowCommand } from "./window_command.js";
import { answerTheWindow, answerTheWindowOnceTheRuntimeAnswered, type TatolabCommandFromWindow, studioWindowTheCommandCameFrom, isTextOrNull, oneTextArgumentFrom, type TatolabWindowCommandHandlers, commandAnswerFrom, commandAnswerOfNothingFrom } from "./tatolab_command_answers.js";

/** `remove_project { project_directory }`: the runtime's `remove_project` queued on the project, so the listing shows its streams `stopping`; refused in the runtime's own words. */
export function removeProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<void, string>> {
  return answerTheWindowOnceTheRuntimeAnswered(sharedState, "remove_project", () => sharedState.controller.removeProject(projectDirectory));
}

/** `projectDirectory` when a stream the runtime last listed is from it, so a command naming a folder acts only on a project the runtime holds; refused naming it otherwise. */
function projectDirectoryTheRuntimeLastListed(sharedState: TatolabAppSharedState, projectDirectory: string): Result<string, string> {
  const isListed = streamsOfTheProjectIn(sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [], projectDirectory).length > 0;
  return isListed ? succeeded(projectDirectory) : failedWith(refusalOfAFolderTheRuntimeListsNoStreamFrom(projectDirectory));
}

/** The refusal of a command naming `projectDirectory`, a folder the runtime last listed no stream from. */
function refusalOfAFolderTheRuntimeListsNoStreamFrom(projectDirectory: string): string {
  return `The runtime lists no stream from ${projectDirectory}.`;
}

/** The arguments of a command on one stream: its id. */
const StreamArguments = Schema.Struct({ stream: Schema.String });

/** The arguments of a command on one project: its folder. */
const ProjectDirectoryArguments = Schema.Struct({ project_directory: Schema.String });

/** The arguments of a command on one stream action: its id. */
const StreamActionArguments = Schema.Struct({ action: Schema.String });

/** `read_project_log_records`'s arguments: the project's folder, the stream and stream action to narrow to, and the cursors of the page before and of where the read stops, each `null` for none. */
const ReadProjectLogRecordsArguments = Schema.Struct({
  project_directory: Schema.String,
  stream: Schema.NullOr(Schema.String),
  action: Schema.NullOr(Schema.String),
  after: Schema.NullOr(Schema.String),
  until: Schema.NullOr(Schema.String),
});

/**
 * `projectDirectory` when the window a command came from may ask the runtime about it: the folder of the window's own project or of
 * one of its imports, which the studio reads the log and node types of before its first run, or a project the runtime last listed a
 * stream from; refused naming it otherwise.
 */
const projectFolderTheWindowMayAskTheRuntimeAbout = Effect.fn("projectFolderTheWindowMayAskTheRuntimeAbout")(function* (projectDirectory: string, commandFromWindow: TatolabCommandFromWindow) {
  const studioWindows = yield* StudioWindows;
  const folderOfTheWindowsOpenProject = studioWindows.folderOfTheWindowsOpenProject(commandFromWindow, projectDirectory);
  if (folderOfTheWindowsOpenProject !== null) return folderOfTheWindowsOpenProject;
  const listedStreams = yield* ListedStreams;
  if (listedStreams.aStreamIsListedFrom(projectDirectory)) return projectDirectory;
  return yield* new CommandRefused({ words: refusalOfAFolderTheRuntimeListsNoStreamFrom(projectDirectory) });
});

/** What Tato Studio calls each stream edit in a refusal, as it asks and once done. */
const STREAM_EDIT_WORDS = { rename: "renamed", delete: "deleted" } as const;

/** Where the runtime last listed the stream with the id `stream`, its project folder and stream asset, or why Tato Studio cannot `edit` it. */
function streamLocationTheRuntimeLastListedFor(sharedState: TatolabAppSharedState, stream: string, edit: keyof typeof STREAM_EDIT_WORDS): Result<StreamLocation, string> {
  const listedStream = sharedState.statusPublisher.lastPublishedStatusNow()?.streams?.find((candidateListedStream) => candidateListedStream.stream === stream) ?? null;
  if (listedStream === null) return failedWith(`The runtime does not list ${stream}, so Tato Studio has no stream to ${edit}.`);
  if (listedStream.location === null) return failedWith(`The runtime lists no project for ${listedStream.display_name}, so it cannot be ${STREAM_EDIT_WORDS[edit]}.`);
  return succeeded(listedStream.location);
}

/** `rename_stream { stream, display_name }`: the runtime's `set_stream_display_name` by the person editing on the stream asset the runtime last listed for `stream`, then a status round whether it renamed or refused; refused in the runtime's own words, or for a stream it lists no project for. */
function renameStream(sharedState: TatolabAppSharedState, stream: string, displayName: string): Promise<Result<void, string>> {
  return answerTheWindow("rename_stream", async () => {
    const streamLocation = streamLocationTheRuntimeLastListedFor(sharedState, stream, "rename");
    if (!streamLocation.ok) return streamLocation;
    const renamed = await sharedState.controller.setStreamDisplayName(streamLocation.value.project_directory, streamLocation.value.stream_asset, displayName, sharedState.thePersonEditingInStudio);
    sharedState.statusPublisher.requestRefresh();
    return renamed.ok ? succeeded(undefined) : failedWith(renamed.failure.failureDescription);
  });
}

/** `delete_stream { stream }`: the runtime's `delete_stream` by the person editing on the stream asset the runtime last listed for `stream`, then a status round whether it deleted or refused; refused in the runtime's own words, or for a stream it lists no project for. */
function deleteStream(sharedState: TatolabAppSharedState, stream: string): Promise<Result<void, string>> {
  return answerTheWindow("delete_stream", async () => {
    const streamLocation = streamLocationTheRuntimeLastListedFor(sharedState, stream, "delete");
    if (!streamLocation.ok) return streamLocation;
    const deleted = await sharedState.controller.deleteStream(streamLocation.value.project_directory, streamLocation.value.stream_asset, sharedState.thePersonEditingInStudio);
    sharedState.statusPublisher.requestRefresh();
    return deleted.ok ? succeeded(undefined) : failedWith(deleted.failure.failureDescription);
  });
}

/** `create_stream_in_the_open_project { display_name }`: the runtime's `create_stream` by the person editing in the asking window's project, its graph document in `streams/` under a name no file there holds, then a status round; refused in the Projects window, or in the runtime's own words. */
function createStreamInTheOpenProject(sharedState: TatolabAppSharedState, displayName: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<StreamAssetCreated, string>> {
  return answerTheWindow("create_stream_in_the_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const projectFolder = studioWindow.value.projectTransactionsFeed.projectFolder;
    const filesUnderTheStreamsFolder = await sharedState.controller.listProjectFiles(projectFolder, PROJECT_STREAMS_FOLDER);
    if (!filesUnderTheStreamsFolder.ok) return failedWith(filesUnderTheStreamsFolder.failure.failureDescription);
    const created = await sharedState.controller.createStream(
      projectFolder,
      newStreamDocumentPathNoFileHolds(displayName, filesUnderTheStreamsFolder.value),
      displayName,
      sharedState.thePersonEditingInStudio,
    );
    sharedState.statusPublisher.requestRefresh();
    return created.ok ? succeeded({ stream_asset: created.value.stream_asset }) : failedWith(created.failure.failureDescription);
  });
}

/** Where each command that opens a stream's project folder opens it. */
const STREAM_PROJECT_FOLDER_OPENING_OF_THE_COMMAND = {
  open_stream_project_folder: "file_manager",
  open_terminal_at_stream_project: "terminal",
  open_stream_log_folder: "log_folder_in_the_file_manager",
} as const satisfies Record<string, StreamProjectFolderOpening>;

/** A command that opens a stream's project folder. */
type StreamProjectFolderCommandName = keyof typeof STREAM_PROJECT_FOLDER_OPENING_OF_THE_COMMAND;

/** `open_stream_project_folder`, `open_terminal_at_stream_project` or `open_stream_log_folder { stream }`: the project folder the runtime last listed for `stream`, or its log folder, opened where `commandName` opens it; refused naming why. */
function openStreamProjectFolderOnRequest(
  sharedState: TatolabAppSharedState,
  commandName: StreamProjectFolderCommandName,
  stream: string,
): Promise<Result<void, string>> {
  return answerTheWindow(commandName, () =>
    openStreamProjectFolder(
      sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? null,
      stream,
      STREAM_PROJECT_FOLDER_OPENING_OF_THE_COMMAND[commandName],
      sharedState.streamProjectFolderOpeners,
    ),
  );
}

/** `choose_stream_project_folder { chosen_for }`: the app's folder dialog, answering the chosen folder as the runtime lists a project's; `null` when the person cancels. */
function chooseStreamProjectFolder(sharedState: TatolabAppSharedState, chosenFor: StreamProjectFolderChosenFor): Promise<Result<string | null, string>> {
  return answerTheWindow("choose_stream_project_folder", () => sharedState.streamProjectAdding.chooseStreamProjectFolder(chosenFor));
}

/** `create_stream_project { folder }`: the runtime's `create_project` queued in `folder`, or with `null` in a folder it draws, then a status round; refused in the runtime's own words. */
function createStreamProject(sharedState: TatolabAppSharedState, folder: string | null): Promise<Result<ProjectCreationQueued, string>> {
  return answerTheWindow("create_stream_project", async () => {
    const queued = await sharedState.streamProjectAdding.createStreamProject(folder);
    sharedState.statusPublisher.requestRefresh();
    return queued;
  });
}

/** `open_stream_project { folder }`: the runtime's `open_project` queued on `folder`, which opens it with its playback stopped, then a status round; refused in the runtime's own words. */
function openStreamProject(sharedState: TatolabAppSharedState, folder: string): Promise<Result<ProjectStreamActionQueued, string>> {
  return answerTheWindow("open_stream_project", async () => {
    const queued = await sharedState.streamProjectAdding.openStreamProject(folder);
    sharedState.statusPublisher.requestRefresh();
    return queued;
  });
}

/** Whether the runtime last listed the project in `projectDirectory` open. */
function theRuntimeLastListedTheProjectOpen(sharedState: Pick<TatolabAppSharedState, "statusPublisher">, projectDirectory: string): boolean {
  return theStreamsListTheProjectOpen(streamsOfTheProjectIn(sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [], projectDirectory));
}

/**
 * `open_project` queued on the project in `projectDirectory` when the runtime, asked now, lists no stream of it or each of them `closed`, since it draws and
 * edits only a loaded stream's graph, then a status round; nothing when it holds the project open. Refused in the runtime's own words.
 */
export async function openTheProjectWhenTheRuntimeHoldsItClosed(
  sharedState: Pick<TatolabAppSharedState, "controller" | "statusPublisher">,
  projectDirectory: string,
): Promise<Result<void, string>> {
  const listedStreams = await sharedState.controller.listStreams();
  if (!listedStreams.ok) return failedWith(listedStreams.failure.failureDescription);
  if (theStreamsListTheProjectOpen(streamsOfTheProjectIn(listedStreams.value, projectDirectory))) return succeeded(undefined);
  const queued = await sharedState.controller.openProject(projectDirectory);
  sharedState.statusPublisher.requestRefresh();
  return queued.ok ? succeeded(undefined) : failedWith(queued.failure.failureDescription);
}

/** The runtime's `reload_project` queued on `projectDirectory` when it last listed the project open, which keeps its playback, else its `open_project`. */
function reloadOrOpenTheProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
  return theRuntimeLastListedTheProjectOpen(sharedState, projectDirectory) ? sharedState.controller.reloadProject(projectDirectory) : sharedState.controller.openProject(projectDirectory);
}

/** `reload_project { project_directory }`: a project the runtime lists read again from disk with `reload_project` while it is open, keeping its playback, or opened with `open_project` while it is closed, then a status round; refused in the runtime's own words. */
function reloadProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<ProjectStreamActionQueued, string>> {
  return answerTheWindow("reload_project", async () => {
    const queued = await reloadOrOpenTheProject(sharedState, projectDirectory);
    sharedState.statusPublisher.requestRefresh();
    return queued.ok ? queued : failedWith(queued.failure.failureDescription);
  });
}

/** `describe_stream_action { action }`: where the action is, or the runtime's words that it no longer holds it; refused when the runtime could not be asked. */
function describeStreamAction(sharedState: TatolabAppSharedState, action: string): Promise<Result<StreamActionFollowed, string>> {
  return answerTheWindow("describe_stream_action", async (): Promise<Result<StreamActionFollowed, string>> => {
    const followed = await sharedState.controller.describeStreamAction(action);
    return followed.ok ? followed : failedWith(followed.failure.failureDescription);
  });
}

/** The `{ stream }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function streamArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ stream: string }, string> {
  const stream = oneTextArgumentFrom(commandName, commandArguments, "stream", "a stream's id");
  return stream.ok ? succeeded({ stream: stream.value }) : stream;
}

/** `rename_stream`'s arguments as the window sends them, or why they are not. */
function renameStreamArgumentsFrom(commandArguments: unknown): Result<{ stream: string; display_name: string }, string> {
  const stream = oneTextArgumentFrom("rename_stream", commandArguments, "stream", "a stream's id");
  if (!stream.ok) return stream;
  const displayName = oneTextArgumentFrom("rename_stream", commandArguments, "display_name", "the display name to show it under");
  return displayName.ok ? succeeded({ stream: stream.value, display_name: displayName.value }) : displayName;
}

/** `delete_stream`'s arguments as the window sends them, or why they are not. */
function deleteStreamArgumentsFrom(commandArguments: unknown): Result<{ stream: string }, string> {
  const stream = oneTextArgumentFrom("delete_stream", commandArguments, "stream", "a stream's id");
  return stream.ok ? succeeded({ stream: stream.value }) : stream;
}

/** `create_stream_in_the_open_project`'s arguments as the window sends them, or why they are not. */
function createStreamInTheOpenProjectArgumentsFrom(commandArguments: unknown): Result<{ display_name: string }, string> {
  const displayName = oneTextArgumentFrom("create_stream_in_the_open_project", commandArguments, "display_name", "the display name to show the new stream under");
  return displayName.ok ? succeeded({ display_name: displayName.value }) : displayName;
}

/** The `{ folder }` arguments of the command `commandName` as the window sends them, or why they are not. */
function folderArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ folder: string }, string> {
  const folder = oneTextArgumentFrom(commandName, commandArguments, "folder", "a folder chosen in the window");
  return folder.ok ? succeeded({ folder: folder.value }) : folder;
}

/** `choose_stream_project_folder`'s arguments as the window sends them, or why they are not. */
function chooseStreamProjectFolderArgumentsFrom(commandArguments: unknown): Result<{ chosen_for: StreamProjectFolderChosenFor }, string> {
  const chosenFor = isAJsonObject(commandArguments) ? commandArguments["chosen_for"] : undefined;
  if (chosenFor !== "project_to_open" && chosenFor !== "new_project_directory") {
    return failedWith("choose_stream_project_folder needs `chosen_for`, project_to_open or new_project_directory");
  }
  return succeeded({ chosen_for: chosenFor });
}

/** `create_stream_project`'s arguments as the window sends them, or why they are not. */
function createStreamProjectArgumentsFrom(commandArguments: unknown): Result<{ folder: string | null }, string> {
  if (!isAJsonObject(commandArguments) || !isTextOrNull(commandArguments["folder"])) {
    return failedWith("create_stream_project needs `folder`, a folder chosen in the window, or null for one the runtime draws under ~/streams");
  }
  return succeeded({ folder: commandArguments["folder"] });
}

async function streamProjectFolderOpeningOnTheStreamNamedIn(
  sharedState: TatolabAppSharedState,
  commandName: StreamProjectFolderCommandName,
  commandArguments: unknown,
): Promise<Result<void, string>> {
  const streamArguments = streamArgumentsFrom(commandName, commandArguments);
  return streamArguments.ok ? openStreamProjectFolderOnRequest(sharedState, commandName, streamArguments.value.stream) : streamArguments;
}

type StreamAndRuntimeProjectCommandName =
  | "read_project_log_records"
  | "describe_stream_graph"
  | "describe_node_catalog"
  | "list_project_node_types"
  | "list_project_assets"
  | "remove_project"
  | "rename_stream"
  | "delete_stream"
  | "create_stream_in_the_open_project"
  | "open_stream_project_folder"
  | "open_terminal_at_stream_project"
  | "open_stream_log_folder"
  | "choose_stream_project_folder"
  | "create_stream_project"
  | "open_stream_project"
  | "reload_project"
  | "describe_stream_action"
  | "cancel_stream_action"
  | "follow_stream_graph_changes"
  | "stop_following_stream_graph_changes"
  | "follow_project_log_records"
  | "stop_following_project_log_records";

/** The handlers of the window's commands on the projects and streams the runtime lists, their logs, graphs and stream actions, over `sharedState`, the converted ones run on `studioRuntime`. */
export function streamAndRuntimeProjectCommandHandlersOf(
  sharedState: TatolabAppSharedState,
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): Pick<TatolabWindowCommandHandlers, StreamAndRuntimeProjectCommandName> {
  return {
    read_project_log_records: windowCommand(studioRuntime, "read_project_log_records", ReadProjectLogRecordsArguments, (reading, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(reading.project_directory, commandFromWindow).pipe(
        Effect.flatMap((projectFolder) => readProjectLogRecords(projectFolder, { stream: reading.stream, action: reading.action }, reading.after, reading.until)),
      ),
    ),
    describe_stream_graph: windowCommand(studioRuntime, "describe_stream_graph", StreamArguments, ({ stream }) => describeStreamGraph(stream)),
    describe_node_catalog: windowCommand(studioRuntime, "describe_node_catalog", StreamArguments, ({ stream }) => describeNodeCatalog(stream)),
    list_project_node_types: windowCommand(studioRuntime, "list_project_node_types", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(Effect.flatMap(listProjectNodeTypes)),
    ),
    list_project_assets: windowCommand(studioRuntime, "list_project_assets", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(Effect.flatMap(listProjectAssets)),
    ),
    cancel_stream_action: windowCommand(studioRuntime, "cancel_stream_action", StreamActionArguments, ({ action }) =>
      cancelStreamAction(action).pipe(Effect.ensuring(StatusRounds.use((statusRounds) => statusRounds.requestARound))),
    ),
    remove_project: async (commandArguments) => {
      const projectDirectory = oneTextArgumentFrom("remove_project", commandArguments, "project_directory", "a project's folder as the runtime lists it");
      if (!projectDirectory.ok) return { ok: false, refusal: projectDirectory.failure };
      const listedProjectDirectory = projectDirectoryTheRuntimeLastListed(sharedState, projectDirectory.value);
      if (!listedProjectDirectory.ok) return { ok: false, refusal: listedProjectDirectory.failure };
      return commandAnswerOfNothingFrom(await removeProject(sharedState, listedProjectDirectory.value));
    },
    rename_stream: async (commandArguments) => {
      const renameStreamArguments = renameStreamArgumentsFrom(commandArguments);
      if (!renameStreamArguments.ok) return { ok: false, refusal: renameStreamArguments.failure };
      return commandAnswerOfNothingFrom(await renameStream(sharedState, renameStreamArguments.value.stream, renameStreamArguments.value.display_name));
    },
    delete_stream: async (commandArguments) => {
      const deleteStreamArguments = deleteStreamArgumentsFrom(commandArguments);
      if (!deleteStreamArguments.ok) return { ok: false, refusal: deleteStreamArguments.failure };
      return commandAnswerOfNothingFrom(await deleteStream(sharedState, deleteStreamArguments.value.stream));
    },
    create_stream_in_the_open_project: async (commandArguments, commandFromWindow) => {
      const createStreamArguments = createStreamInTheOpenProjectArgumentsFrom(commandArguments);
      if (!createStreamArguments.ok) return { ok: false, refusal: createStreamArguments.failure };
      return commandAnswerFrom(await createStreamInTheOpenProject(sharedState, createStreamArguments.value.display_name, commandFromWindow));
    },
    open_stream_project_folder: async (commandArguments) =>
      commandAnswerOfNothingFrom(await streamProjectFolderOpeningOnTheStreamNamedIn(sharedState, "open_stream_project_folder", commandArguments)),
    open_terminal_at_stream_project: async (commandArguments) =>
      commandAnswerOfNothingFrom(await streamProjectFolderOpeningOnTheStreamNamedIn(sharedState, "open_terminal_at_stream_project", commandArguments)),
    open_stream_log_folder: async (commandArguments) =>
      commandAnswerOfNothingFrom(await streamProjectFolderOpeningOnTheStreamNamedIn(sharedState, "open_stream_log_folder", commandArguments)),
    choose_stream_project_folder: async (commandArguments) => {
      const chooseArguments = chooseStreamProjectFolderArgumentsFrom(commandArguments);
      if (!chooseArguments.ok) return { ok: false, refusal: chooseArguments.failure };
      return commandAnswerFrom(await chooseStreamProjectFolder(sharedState, chooseArguments.value.chosen_for));
    },
    create_stream_project: async (commandArguments) => {
      const folderArguments = createStreamProjectArgumentsFrom(commandArguments);
      if (!folderArguments.ok) return { ok: false, refusal: folderArguments.failure };
      return commandAnswerFrom(await createStreamProject(sharedState, folderArguments.value.folder));
    },
    open_stream_project: async (commandArguments) => {
      const folderArguments = folderArgumentsFrom("open_stream_project", commandArguments);
      if (!folderArguments.ok) return { ok: false, refusal: folderArguments.failure };
      return commandAnswerFrom(await openStreamProject(sharedState, folderArguments.value.folder));
    },
    reload_project: async (commandArguments) => {
      const projectDirectory = oneTextArgumentFrom("reload_project", commandArguments, "project_directory", "a project's folder as the runtime lists it");
      if (!projectDirectory.ok) return { ok: false, refusal: projectDirectory.failure };
      const listedProjectDirectory = projectDirectoryTheRuntimeLastListed(sharedState, projectDirectory.value);
      if (!listedProjectDirectory.ok) return { ok: false, refusal: listedProjectDirectory.failure };
      return commandAnswerFrom(await reloadProject(sharedState, listedProjectDirectory.value));
    },
    describe_stream_action: async (commandArguments) => {
      const action = oneTextArgumentFrom("describe_stream_action", commandArguments, "action", "a stream action's id");
      if (!action.ok) return { ok: false, refusal: action.failure };
      return commandAnswerFrom(await describeStreamAction(sharedState, action.value));
    },
    follow_stream_graph_changes: async (commandArguments, commandFromWindow) => {
      const followed = streamArgumentsFrom("follow_stream_graph_changes", commandArguments);
      if (!followed.ok) return { ok: false, refusal: followed.failure };
      const windowFollowingStreamGraphs = sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId);
      if (windowFollowingStreamGraphs === null) return { ok: false, refusal: "Only a studio window or a popped-out view follows a stream's graph." };
      sharedState.streamGraphChangesFollowed.follow(followed.value.stream, windowFollowingStreamGraphs);
      return { ok: true, value: null };
    },
    stop_following_stream_graph_changes: async (commandArguments, commandFromWindow) => {
      const followed = streamArgumentsFrom("stop_following_stream_graph_changes", commandArguments);
      if (!followed.ok) return { ok: false, refusal: followed.failure };
      const windowFollowingStreamGraphs = sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId);
      if (windowFollowingStreamGraphs !== null) sharedState.streamGraphChangesFollowed.stopFollowing(followed.value.stream, windowFollowingStreamGraphs);
      return { ok: true, value: null };
    },
    follow_project_log_records: windowCommand(studioRuntime, "follow_project_log_records", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(
        Effect.flatMap(() => {
          const windowFollowingProjectLogs = sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId);
          if (windowFollowingProjectLogs === null) return Effect.fail(new CommandRefused({ words: "Only a studio window or a popped-out view follows a project's log." }));
          return Effect.sync(() => sharedState.projectLogRecordsFollowed.follow(project_directory, windowFollowingProjectLogs)).pipe(Effect.as(null));
        }),
      ),
    ),
    stop_following_project_log_records: async (commandArguments, commandFromWindow) => {
      const projectDirectory = oneTextArgumentFrom("stop_following_project_log_records", commandArguments, "project_directory", "the directory of a project the window follows the log of");
      if (!projectDirectory.ok) return { ok: false, refusal: projectDirectory.failure };
      const windowFollowingProjectLogs = sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId);
      if (windowFollowingProjectLogs !== null) sharedState.projectLogRecordsFollowed.stopFollowing(projectDirectory.value, windowFollowingProjectLogs);
      return { ok: true, value: null };
    },
  };
}
