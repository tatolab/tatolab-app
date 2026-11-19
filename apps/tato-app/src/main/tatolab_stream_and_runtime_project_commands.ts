import { chooseAStreamProjectFolder, createAStreamProject, openAStreamProject } from "./stream_project_adding.js";
import { openTheStreamsProjectFolder, type StreamProjectFolderOpening } from "./stream_project_folder_opening.js";
import { newStreamDocumentPathNoFileHolds, PROJECT_STREAMS_FOLDER } from "./new_stream_document_path.js";
import { Effect, Schema, type ManagedRuntime } from "effect";
import {
  cancelStreamAction,
  createStream,
  deleteStream,
  describeNodeTypes,
  describeStreamAction,
  describeStreamGraph,
  listProjectAssets,
  listProjectFiles,
  listNodeTypes,
  openProject,
  readProjectLogRecords,
  reloadProject,
  removeProject,
  setStreamDisplayName,
} from "./runtime_operations.js";
import { ListedStreams, PersonEditingInStudio, ProjectLogsFollowed, StreamGraphsFollowed, StudioWindows, thenAStatusRound, type StudioServices, type WindowFollowingTheRuntime } from "./studio_runtime.js";
import { CommandRefused, windowCommand } from "./window_command.js";
import type { TatolabCommandFromWindow, TatolabWindowCommandHandlers } from "./tatolab_command_answers.js";

/** What Tato Studio calls each stream edit in a refusal, as it asks and once done. */
const STREAM_EDIT_WORDS = { rename: "renamed", delete: "deleted" } as const;

/** Where the runtime last listed the stream with the id `stream`, its project folder and stream asset; refused naming why Tato Studio cannot `edit` it. */
const streamLocationTheRuntimeLastListedFor = Effect.fn("streamLocationTheRuntimeLastListedFor")(function* (stream: string, edit: keyof typeof STREAM_EDIT_WORDS) {
  const listedStream = (yield* ListedStreams).listedStream(stream);
  if (listedStream === null) return yield* new CommandRefused({ words: `The runtime does not list ${stream}, so Tato Studio has no stream to ${edit}.` });
  if (listedStream.location === null) return yield* new CommandRefused({ words: `The runtime lists no project for ${listedStream.display_name}, so it cannot be ${STREAM_EDIT_WORDS[edit]}.` });
  return listedStream.location;
});

/** `projectDirectory` when the runtime last listed a stream from it, so a command naming a folder acts only on a project the runtime holds; refused naming it otherwise. */
const projectFolderTheRuntimeLastListed = Effect.fn("projectFolderTheRuntimeLastListed")(function* (projectDirectory: string) {
  if ((yield* ListedStreams).aStreamIsListedFrom(projectDirectory)) return projectDirectory;
  return yield* new CommandRefused({ words: `The runtime lists no stream from ${projectDirectory}.` });
});

/** The arguments of `rename_stream`: the stream's id and the display name to show it under. */
const RenameStreamArguments = Schema.Struct({ stream: Schema.String, display_name: Schema.String });

/** The arguments of `create_stream_in_the_open_project`: the display name to show the new stream under. */
const CreateStreamArguments = Schema.Struct({ display_name: Schema.String });

/** The arguments of a command on one stream: its id. */
const StreamArguments = Schema.Struct({ stream: Schema.String });

/** The arguments of a command on one project: its folder. */
const ProjectDirectoryArguments = Schema.Struct({ project_directory: Schema.String });

/** `describe_node_types`' arguments: the project's folder and the node types to describe, each as `list_node_types` names it. */
const DescribeNodeTypesArguments = Schema.Struct({ project_directory: Schema.String, node_types: Schema.Array(Schema.String) });

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
  return yield* projectFolderTheRuntimeLastListed(projectDirectory);
});

/** The window a command came from when it follows the runtime's pushes, a studio window or a view popped out of one; `null` for any other. */
function windowFollowingTheRuntimeOf(commandFromWindow: TatolabCommandFromWindow) {
  return StudioWindows.use((studioWindows) => Effect.succeed(studioWindows.windowFollowingTheRuntimeOf(commandFromWindow)));
}

/** The window a command came from as one that follows the runtime's pushes; refused with `refusal` from any other. */
function windowFollowingTheRuntime(commandFromWindow: TatolabCommandFromWindow, refusal: string) {
  return windowFollowingTheRuntimeOf(commandFromWindow).pipe(
    Effect.flatMap((windowFollowing) => (windowFollowing === null ? Effect.fail(new CommandRefused({ words: refusal })) : Effect.succeed(windowFollowing))),
  );
}

/** `stop` of the window a command came from, when it is one that follows the runtime's pushes; nothing from any other. */
function whenAWindowFollowsTheRuntime<Services>(commandFromWindow: TatolabCommandFromWindow, stop: (windowFollowing: WindowFollowingTheRuntime) => Effect.Effect<void, never, Services>) {
  return windowFollowingTheRuntimeOf(commandFromWindow).pipe(
    Effect.flatMap((windowFollowing) => (windowFollowing === null ? Effect.void : stop(windowFollowing))),
    Effect.as(null),
  );
}

/** The arguments of `choose_stream_project_folder`: what the folder is chosen for. */
const ChooseStreamProjectFolderArguments = Schema.Struct({ chosen_for: Schema.Literals(["project_to_open", "new_project_directory"]) });

/** The arguments of `create_stream_project`: a folder chosen in the window, or `null` for one the runtime draws under `~/streams`. */
const CreateStreamProjectArguments = Schema.Struct({ folder: Schema.NullOr(Schema.String) });

/** The arguments of `open_stream_project`: a folder chosen in the window. */
const OpenStreamProjectArguments = Schema.Struct({ folder: Schema.String });

/** The window's `commandName { stream }` on `studioRuntime`: the project folder the runtime last listed for the stream, or its log folder, opened as `opening` asks, answering nothing. */
function streamProjectFolderCommand(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
  commandName: "open_stream_project_folder" | "open_terminal_at_stream_project" | "open_stream_log_folder",
  opening: StreamProjectFolderOpening,
) {
  return windowCommand(studioRuntime, commandName, StreamArguments, ({ stream }) => openTheStreamsProjectFolder(stream, opening).pipe(Effect.as(null)));
}

type StreamAndRuntimeProjectCommandName =
  | "read_project_log_records"
  | "describe_stream_graph"
  | "list_node_types"
  | "describe_node_types"
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

/** The handlers of the window's commands on the projects and streams the runtime lists, their logs, graphs and stream actions, run on `studioRuntime`. */
export function streamAndRuntimeProjectCommandHandlersOf(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): Pick<TatolabWindowCommandHandlers, StreamAndRuntimeProjectCommandName> {
  return {
    read_project_log_records: windowCommand(studioRuntime, "read_project_log_records", ReadProjectLogRecordsArguments, (reading, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(reading.project_directory, commandFromWindow).pipe(
        Effect.flatMap((projectFolder) => readProjectLogRecords(projectFolder, { stream: reading.stream, action: reading.action }, reading.after, reading.until)),
      ),
    ),
    describe_stream_graph: windowCommand(studioRuntime, "describe_stream_graph", StreamArguments, ({ stream }) => describeStreamGraph(stream)),
    list_node_types: windowCommand(studioRuntime, "list_node_types", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(Effect.flatMap(listNodeTypes)),
    ),
    describe_node_types: windowCommand(studioRuntime, "describe_node_types", DescribeNodeTypesArguments, ({ project_directory, node_types }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(Effect.flatMap((projectFolder) => describeNodeTypes(projectFolder, node_types))),
    ),
    list_project_assets: windowCommand(studioRuntime, "list_project_assets", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(Effect.flatMap(listProjectAssets)),
    ),
    cancel_stream_action: windowCommand(studioRuntime, "cancel_stream_action", StreamActionArguments, ({ action }) => thenAStatusRound(cancelStreamAction(action))),
    remove_project: windowCommand(studioRuntime, "remove_project", ProjectDirectoryArguments, ({ project_directory }) =>
      projectFolderTheRuntimeLastListed(project_directory).pipe(Effect.flatMap((projectFolder) => thenAStatusRound(removeProject(projectFolder))), Effect.as(null)),
    ),
    rename_stream: windowCommand(studioRuntime, "rename_stream", RenameStreamArguments, ({ stream, display_name }) =>
      Effect.gen(function* () {
        const location = yield* streamLocationTheRuntimeLastListedFor(stream, "rename");
        const { author } = yield* PersonEditingInStudio;
        yield* thenAStatusRound(setStreamDisplayName(location.project_directory, location.stream_asset, display_name, author));
        return null;
      }),
    ),
    delete_stream: windowCommand(studioRuntime, "delete_stream", StreamArguments, ({ stream }) =>
      Effect.gen(function* () {
        const location = yield* streamLocationTheRuntimeLastListedFor(stream, "delete");
        const { author } = yield* PersonEditingInStudio;
        yield* thenAStatusRound(deleteStream(location.project_directory, location.stream_asset, author));
        return null;
      }),
    ),
    create_stream_in_the_open_project: windowCommand(studioRuntime, "create_stream_in_the_open_project", CreateStreamArguments, ({ display_name }, commandFromWindow) =>
      Effect.gen(function* () {
        const projectFolder = yield* (yield* StudioWindows).projectFolderOfTheWindow(commandFromWindow);
        const filesUnderTheStreamsFolder = yield* listProjectFiles(projectFolder, PROJECT_STREAMS_FOLDER);
        const { author } = yield* PersonEditingInStudio;
        const created = yield* thenAStatusRound(createStream(projectFolder, newStreamDocumentPathNoFileHolds(display_name, filesUnderTheStreamsFolder), display_name, author));
        return { stream_asset: created.stream_asset };
      }),
    ),
    reload_project: windowCommand(studioRuntime, "reload_project", ProjectDirectoryArguments, ({ project_directory }) =>
      Effect.gen(function* () {
        const projectFolder = yield* projectFolderTheRuntimeLastListed(project_directory);
        const listedOpen = (yield* ListedStreams).theProjectIsListedOpen(projectFolder);
        return yield* thenAStatusRound(listedOpen ? reloadProject(projectFolder) : openProject(projectFolder));
      }),
    ),
    describe_stream_action: windowCommand(studioRuntime, "describe_stream_action", StreamActionArguments, ({ action }) => describeStreamAction(action)),
    open_stream_project_folder: streamProjectFolderCommand(studioRuntime, "open_stream_project_folder", "file_manager"),
    open_terminal_at_stream_project: streamProjectFolderCommand(studioRuntime, "open_terminal_at_stream_project", "terminal"),
    open_stream_log_folder: streamProjectFolderCommand(studioRuntime, "open_stream_log_folder", "log_folder_in_the_file_manager"),
    choose_stream_project_folder: windowCommand(studioRuntime, "choose_stream_project_folder", ChooseStreamProjectFolderArguments, ({ chosen_for }) => chooseAStreamProjectFolder(chosen_for)),
    create_stream_project: windowCommand(studioRuntime, "create_stream_project", CreateStreamProjectArguments, ({ folder }) => createAStreamProject(folder)),
    open_stream_project: windowCommand(studioRuntime, "open_stream_project", OpenStreamProjectArguments, ({ folder }) => openAStreamProject(folder)),
    follow_stream_graph_changes: windowCommand(studioRuntime, "follow_stream_graph_changes", StreamArguments, ({ stream }, commandFromWindow) =>
      windowFollowingTheRuntime(commandFromWindow, "Only a studio window or a popped-out view follows a stream's graph.").pipe(
        Effect.flatMap((windowFollowing) => StreamGraphsFollowed.use((followed) => followed.follow(stream, windowFollowing))),
        Effect.as(null),
      ),
    ),
    stop_following_stream_graph_changes: windowCommand(studioRuntime, "stop_following_stream_graph_changes", StreamArguments, ({ stream }, commandFromWindow) =>
      whenAWindowFollowsTheRuntime(commandFromWindow, (windowFollowing) => StreamGraphsFollowed.use((followed) => followed.stopFollowing(stream, windowFollowing))),
    ),
    follow_project_log_records: windowCommand(studioRuntime, "follow_project_log_records", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      projectFolderTheWindowMayAskTheRuntimeAbout(project_directory, commandFromWindow).pipe(
        Effect.andThen(windowFollowingTheRuntime(commandFromWindow, "Only a studio window or a popped-out view follows a project's log.")),
        Effect.flatMap((windowFollowing) => ProjectLogsFollowed.use((followed) => followed.follow(project_directory, windowFollowing))),
        Effect.as(null),
      ),
    ),
    stop_following_project_log_records: windowCommand(studioRuntime, "stop_following_project_log_records", ProjectDirectoryArguments, ({ project_directory }, commandFromWindow) =>
      whenAWindowFollowsTheRuntime(commandFromWindow, (windowFollowing) => ProjectLogsFollowed.use((followed) => followed.stopFollowing(project_directory, windowFollowing))),
    ),
  };
}
