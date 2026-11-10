// The commands the window's frontend invokes, under the names it invokes them by. A request that
// changes the machine starts in the background, as the tray's choices do, and its outcome reaches
// the window as the next `tatolab-status-changed`. A question the window awaits is answered with
// its answer or a refusal in words, never a thrown error.

import path from "node:path";
import type {
  ChosenProjectFolder,
  JsonValue,
  DependencySourceKind,
  ProjectDependency,
  WorkspaceDependency,
  WorkspaceDependencyUpdate,
  PoppedOutView,
  PortViewerTarget,
  ProjectCreationQueued,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectRunQueued,
  ProjectTransaction,
  ProjectTransactionAuthor,
  RuntimeDescription,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamGraphSummary,
  NodeCatalog,
  ProjectNodeTypeListing,
  StreamProjectFolderChosenFor,
  TatolabStatus,
  ProjectFolderChosenFor,
} from "../shared/tatolab_backend_contract.js";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject, isAJsonValue } from "./json_on_the_wire.js";
import { readThePackageCatalog } from "./package_catalog.js";
import { importFolderInsideTheWorkspace, workspaceDependenciesOf } from "./workspace_dependencies.js";
import { downloadTheCatalogEntrysZip } from "./marketplace_module_download.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import {
  runTatolabAppUpdateWorkInTheBackground,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";
import { openTheRuntimesLogFolder } from "./runtime_log_folder_opening.js";
import { openStreamProjectFolder, type StreamProjectFolderOpening } from "./stream_project_folder_opening.js";
import { NO_PROJECT_OPEN_IN_THE_WINDOW, type StudioWindowOfAProject } from "./tatolab_app_windows.js";
import { systemMenuBarMenusFrom } from "./system_menu_bar_of_the_focused_window.js";

/** How long `get_tatolab_status` waits for the poller's first round when the window asks first. */
const FIRST_STATUS_ROUND_WAIT_LIMIT_MS = 15_000;

/** `work`'s answer to the command `commandName`; a failure nothing expected becomes a refusal naming the command. */
export async function answerTheWindow<Answer>(commandName: string, work: () => Promise<Result<Answer, string>>): Promise<Result<Answer, string>> {
  try {
    return await work();
  } catch (unexpectedFailure) {
    return failedWith(`${commandName} ended without an answer: ${describeCaughtFailure(unexpectedFailure)}`);
  }
}

/** `work`'s answer to the command `commandName`, then a status round whether it was carried out or refused, so the window sees what it changed. */
function answerTheWindowThenRefreshTheStatus(
  sharedState: TatolabAppSharedState,
  commandName: string,
  work: () => Promise<Result<void, string>>,
): Promise<Result<void, string>> {
  return answerTheWindow(commandName, async () => {
    const answer = await work();
    sharedState.statusPublisher.requestRefresh();
    return answer;
  });
}

/** `get_tatolab_status`: the status as of the poller's last round. */
export function getTatolabStatus(sharedState: TatolabAppSharedState): Promise<Result<TatolabStatus, string>> {
  return answerTheWindow("get_tatolab_status", async () => {
    const status = await sharedState.statusPublisher.lastPublishedStatusWaitingUpTo(FIRST_STATUS_ROUND_WAIT_LIMIT_MS);
    return status === null ? failedWith("Tatolab has not observed the runtime yet") : succeeded(status);
  });
}

/** `link_command_line_tool`: link `~/.local/bin/tatolab` to the CLI the app carries, then a status round; refused in words when something else holds the name or the build offers none. */
export function linkCommandLineTool(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindowThenRefreshTheStatus(sharedState, "link_command_line_tool", () => sharedState.controller.linkTheCommandLineTool());
}

/** `read_project_log_records { project_directory, stream, action, after }`: the project's log records after the cursor `after`, narrowed to `stream` and `action` when they are given; refused in the runtime's own words. */
export function readProjectLogRecords(
  sharedState: TatolabAppSharedState,
  projectDirectory: string,
  narrowing: ProjectLogNarrowing,
  after: string | null,
): Promise<Result<ProjectLogRecordsPage, string>> {
  return answerTheWindow("read_project_log_records", async () => {
    const page = await sharedState.controller.readProjectLogRecords(projectDirectory, narrowing, after);
    return page.ok ? page : failedWith(page.failure.failureDescription);
  });
}

/** `describe_stream_graph { stream }`: the graph of the loaded stream `stream`; refused in the runtime's own words. */
export function describeStreamGraph(sharedState: TatolabAppSharedState, stream: string): Promise<Result<StreamGraphSummary, string>> {
  return answerTheWindow("describe_stream_graph", async () => {
    const summary = await sharedState.controller.describeStreamGraph(stream);
    return summary.ok ? summary : failedWith(summary.failure.failureDescription);
  });
}

/** `describe_node_catalog { stream }`: every node type the loaded stream `stream` can add; refused in the runtime's own words. */
export function describeNodeCatalog(sharedState: TatolabAppSharedState, stream: string): Promise<Result<NodeCatalog, string>> {
  return answerTheWindow("describe_node_catalog", async () => {
    const nodeCatalog = await sharedState.controller.describeNodeCatalog(stream);
    return nodeCatalog.ok ? nodeCatalog : failedWith(nodeCatalog.failure.failureDescription);
  });
}

/** `list_project_node_types { project_directory }`: what the project and each source it draws node code from declares, read from source without running it; refused in the runtime's own words. */
export function listProjectNodeTypes(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<ProjectNodeTypeListing, string>> {
  return answerTheWindow("list_project_node_types", async () => {
    const listing = await sharedState.controller.listProjectNodeTypes(projectDirectory);
    return listing.ok ? listing : failedWith(listing.failure.failureDescription);
  });
}

/** The window's `commandName` answered once the runtime queued its action or refused it, then a status round either way, so the listing shows the action under way; the action's id is read only to check the answer. */
function answerTheWindowOnceQueued(
  sharedState: TatolabAppSharedState,
  commandName: TatolabCommandName,
  queueTheAction: () => Promise<Result<string, LocalApiRequestFailure>>,
): Promise<Result<void, string>> {
  return answerTheWindow(commandName, async () => {
    const queued = await queueTheAction();
    sharedState.statusPublisher.requestRefresh();
    return queued.ok ? succeeded(undefined) : failedWith(queued.failure.failureDescription);
  });
}

/** `remove_project { project_directory }`: the runtime's `remove_project` queued on the project, so the listing shows its streams `stopping`; refused in the runtime's own words. */
export function removeProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<void, string>> {
  return answerTheWindowOnceQueued(sharedState, "remove_project", () => sharedState.controller.removeProject(projectDirectory));
}

/** `projectDirectory` when a stream the runtime last listed is from it, so a command naming a folder acts only on a project the runtime holds; refused naming it otherwise. */
export function projectDirectoryTheRuntimeLastListed(sharedState: TatolabAppSharedState, projectDirectory: string): Result<string, string> {
  const listedStreams = sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [];
  const isListed = listedStreams.some((listedStream) => listedStream.location?.project_directory === projectDirectory);
  return isListed ? succeeded(projectDirectory) : failedWith(`The runtime lists no stream from ${projectDirectory}.`);
}

/** `projectDirectory` when the runtime last listed a stream from it or it is the folder of the asking window's project or of one of its imports, which the studio reads the log and node types of before its first run; refused otherwise. */
export function projectDirectoryTheWindowMayAskTheRuntimeAbout(
  sharedState: TatolabAppSharedState,
  projectDirectory: string,
  commandFromWindow: TatolabCommandFromWindow,
): Result<string, string> {
  const studioWindow = sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId);
  const openProjectFolder = studioWindow?.openProjectFiles.projectFolderOfTheOpenProject(projectDirectory) ?? null;
  return openProjectFolder?.ok === true ? openProjectFolder : projectDirectoryTheRuntimeLastListed(sharedState, projectDirectory);
}

/** The window a command came from, by its page's contents id. */
export interface TatolabCommandFromWindow {
  windowContentsId: number;
}

/** Why a command about a window's own project is refused in the Projects window. */
export const NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL = "No project is open in this window.";

/** The studio window whose project `commandFromWindow` acts on, its own page or a view popped out of it, or why there is none. */
function studioWindowTheCommandCameFrom(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Result<StudioWindowOfAProject, string> {
  const studioWindow = sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId);
  return studioWindow === null ? failedWith(NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL) : succeeded(studioWindow);
}

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

/** `rename_stream { stream, display_name }`: the runtime's `set_stream_display_name` on the stream asset the runtime last listed for `stream`, then a status round whether it renamed or refused; refused in the runtime's own words, or for a stream it lists no project for. */
export function renameStream(sharedState: TatolabAppSharedState, stream: string, displayName: string): Promise<Result<void, string>> {
  return answerTheWindow("rename_stream", async () => {
    const listedStream = sharedState.statusPublisher.lastPublishedStatusNow()?.streams?.find((candidateListedStream) => candidateListedStream.stream === stream) ?? null;
    if (listedStream === null) return failedWith(`The runtime does not list ${stream}, so Tato Studio has no stream to rename.`);
    if (listedStream.location === null) return failedWith(`The runtime lists no project for ${listedStream.display_name}, so it cannot be renamed.`);
    const renamed = await sharedState.controller.setStreamDisplayName(listedStream.location.project_directory, listedStream.location.stream_asset, displayName);
    sharedState.statusPublisher.requestRefresh();
    return renamed.ok ? succeeded(undefined) : failedWith(renamed.failure.failureDescription);
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
export function openStreamProjectFolderOnRequest(
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
export function chooseStreamProjectFolder(sharedState: TatolabAppSharedState, chosenFor: StreamProjectFolderChosenFor): Promise<Result<string | null, string>> {
  return answerTheWindow("choose_stream_project_folder", () => sharedState.streamProjectAdding.chooseStreamProjectFolder(chosenFor));
}

/** `create_stream_project { folder }`: the runtime's `create_project` queued in `folder`, or with `null` in a folder it draws, then a status round; refused in the runtime's own words. */
export function createStreamProject(sharedState: TatolabAppSharedState, folder: string | null): Promise<Result<ProjectCreationQueued, string>> {
  return answerTheWindow("create_stream_project", async () => {
    const queued = await sharedState.streamProjectAdding.createStreamProject(folder);
    sharedState.statusPublisher.requestRefresh();
    return queued;
  });
}

/** `run_stream_project { folder }`: the runtime's `start_project` queued on `folder`, then a status round; refused in the runtime's own words. */
export function runStreamProject(sharedState: TatolabAppSharedState, folder: string): Promise<Result<ProjectRunQueued, string>> {
  return answerTheWindow("run_stream_project", async () => {
    const queued = await sharedState.streamProjectAdding.runStreamProject(folder);
    sharedState.statusPublisher.requestRefresh();
    return queued;
  });
}

/** `reload_project { project_directory }`: the runtime's `reload_project` queued on a project it lists, which reads every stream asset in it again from disk, then a status round; refused in the runtime's own words, as for a stopped project. */
export function reloadProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<ProjectRunQueued, string>> {
  return answerTheWindow("reload_project", async () => {
    const queued = await sharedState.controller.reloadProject(projectDirectory);
    sharedState.statusPublisher.requestRefresh();
    return queued.ok ? queued : failedWith(queued.failure.failureDescription);
  });
}

/** `describe_stream_action { action }`: where the action is, or the runtime's words that it no longer holds it; refused when the runtime could not be asked. */
export function describeStreamAction(sharedState: TatolabAppSharedState, action: string): Promise<Result<StreamActionFollowed, string>> {
  return answerTheWindow("describe_stream_action", async (): Promise<Result<StreamActionFollowed, string>> => {
    const followed = await sharedState.controller.describeStreamAction(action);
    return followed.ok ? followed : failedWith(followed.failure.failureDescription);
  });
}

/** `cancel_stream_action { action }`: the runtime's `cancel_stream_action`, then a status round; refused in the runtime's own words. */
export function cancelStreamAction(sharedState: TatolabAppSharedState, action: string): Promise<Result<StreamActionCancelAnswer, string>> {
  return answerTheWindow("cancel_stream_action", async () => {
    const answer = await sharedState.controller.cancelStreamAction(action);
    sharedState.statusPublisher.requestRefresh();
    return answer.ok ? answer : failedWith(answer.failure.failureDescription);
  });
}

/** `describe_runtime`: the running runtime's version, build, uptime and own log folder; refused in the runtime's own words. */
export function describeRuntime(sharedState: TatolabAppSharedState): Promise<Result<RuntimeDescription, string>> {
  return answerTheWindow("describe_runtime", async () => {
    const runtimeDescription = await sharedState.controller.describeRuntime();
    return runtimeDescription.ok ? runtimeDescription : failedWith(runtimeDescription.failure.failureDescription);
  });
}

/** `restart_runtime`: stop the app's runtime and start it again, then a status round whether it restarted or was refused; refused for a runtime the app did not start. */
export function restartRuntime(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindow("restart_runtime", async () => {
    const restarted = await sharedState.controller.restartTheRuntimeOnRequest();
    sharedState.statusPublisher.requestRefresh();
    return restarted;
  });
}

/** `open_runtime_log_folder`: the folder the runtime names for its own log when asked now, in the file manager; refused naming why. */
export function openRuntimeLogFolder(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindow("open_runtime_log_folder", async () =>
    openTheRuntimesLogFolder(await sharedState.controller.describeRuntime(), sharedState.streamProjectFolderOpeners),
  );
}

/** `set_stream_failure_notifications { enabled }`: turn the stream-failure notifications on or off, then a status round; refused when the choice could not be remembered. */
export function setStreamFailureNotifications(sharedState: TatolabAppSharedState, enabled: boolean): Promise<Result<void, string>> {
  return answerTheWindow("set_stream_failure_notifications", async () => {
    const set = await sharedState.streamFailureNotifications.setNotifyWhenAStreamFails(enabled);
    sharedState.statusPublisher.requestRefresh();
    return set;
  });
}

/** `set_developer_mode { enabled }`: turn Developer mode on or off, then a status round; refused when the choice could not be remembered. */
export function setDeveloperMode(sharedState: TatolabAppSharedState, enabled: boolean): Promise<Result<void, string>> {
  return answerTheWindow("set_developer_mode", async () => {
    const set = await sharedState.developerModeSwitch.setAndRemember(enabled);
    sharedState.statusPublisher.requestRefresh();
    return set;
  });
}

/** `set_open_tatolab_at_login { enabled }`: have the desktop open the app at login, or stop, then a status round; refused in the desktop's words. */
export function setOpenTatolabAtLogin(sharedState: TatolabAppSharedState, enabled: boolean): Promise<Result<void, string>> {
  return answerTheWindow("set_open_tatolab_at_login", async () => {
    const set = await sharedState.controller.setOpenTatolabAtLogin(enabled);
    sharedState.statusPublisher.requestRefresh();
    return set;
  });
}

/** The `{ enabled }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function enabledArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ enabled: boolean }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["enabled"] !== "boolean") {
    return failedWith(`${commandName} needs \`enabled\`, true or false`);
  }
  return succeeded({ enabled: commandArguments["enabled"] });
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** `read_project_log_records`'s arguments as the window sends them, or why they are not. */
export function readProjectLogRecordsArgumentsFrom(
  commandArguments: unknown,
): Result<{ projectDirectory: string; narrowing: ProjectLogNarrowing; after: string | null }, string> {
  if (
    !isAJsonObject(commandArguments) ||
    typeof commandArguments["project_directory"] !== "string" ||
    !isTextOrNull(commandArguments["stream"]) ||
    !isTextOrNull(commandArguments["action"]) ||
    !isTextOrNull(commandArguments["after"])
  ) {
    return failedWith(
      "read_project_log_records needs `project_directory`, a project's folder, and `stream`, `action` and `after`, each text or null: a stream's id, a stream action's id, and the cursor of the page before",
    );
  }
  return succeeded({
    projectDirectory: commandArguments["project_directory"],
    narrowing: { stream: commandArguments["stream"], action: commandArguments["action"] },
    after: commandArguments["after"],
  });
}

/** The `{ stream }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function streamArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ stream: string }, string> {
  const stream = oneTextArgumentFrom(commandName, commandArguments, "stream", "a stream's id");
  return stream.ok ? succeeded({ stream: stream.value }) : stream;
}

/** `rename_stream`'s arguments as the window sends them, or why they are not. */
export function renameStreamArgumentsFrom(commandArguments: unknown): Result<{ stream: string; display_name: string }, string> {
  const stream = oneTextArgumentFrom("rename_stream", commandArguments, "stream", "a stream's id");
  if (!stream.ok) return stream;
  const displayName = oneTextArgumentFrom("rename_stream", commandArguments, "display_name", "the display name to show it under");
  return displayName.ok ? succeeded({ stream: stream.value, display_name: displayName.value }) : displayName;
}

/** The text argument `argumentName` of the command `commandName`, or why the window's arguments carry none, naming what it is. */
function oneTextArgumentFrom(commandName: TatolabCommandName, commandArguments: unknown, argumentName: string, whatItIs: string): Result<string, string> {
  const argument = isAJsonObject(commandArguments) ? commandArguments[argumentName] : undefined;
  return typeof argument === "string" ? succeeded(argument) : failedWith(`${commandName} needs \`${argumentName}\`, ${whatItIs}`);
}

/** The `{ folder }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function folderArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ folder: string }, string> {
  const folder = oneTextArgumentFrom(commandName, commandArguments, "folder", "a folder chosen in the window");
  return folder.ok ? succeeded({ folder: folder.value }) : folder;
}

/** `choose_stream_project_folder`'s arguments as the window sends them, or why they are not. */
export function chooseStreamProjectFolderArgumentsFrom(commandArguments: unknown): Result<{ chosen_for: StreamProjectFolderChosenFor }, string> {
  const chosenFor = isAJsonObject(commandArguments) ? commandArguments["chosen_for"] : undefined;
  if (chosenFor !== "project_to_run" && chosenFor !== "new_project_directory") {
    return failedWith("choose_stream_project_folder needs `chosen_for`, project_to_run or new_project_directory");
  }
  return succeeded({ chosen_for: chosenFor });
}

/** `create_stream_project`'s arguments as the window sends them, or why they are not. */
export function createStreamProjectArgumentsFrom(commandArguments: unknown): Result<{ folder: string | null }, string> {
  if (!isAJsonObject(commandArguments) || !isTextOrNull(commandArguments["folder"])) {
    return failedWith("create_stream_project needs `folder`, a folder chosen in the window, or null for one the runtime draws under ~/streams");
  }
  return succeeded({ folder: commandArguments["folder"] });
}

/** `choose_project_folder { chosen_for }`: the app's folder dialog, opened beside the asking window's project, the chosen folder opened in its own studio window; `null` when the person cancels. */
export async function chooseProjectFolder(
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
export function chooseProjectFolderArgumentsFrom(commandArguments: unknown): Result<{ chosen_for: ProjectFolderChosenFor }, string> {
  const chosenFor = isAJsonObject(commandArguments) ? commandArguments["chosen_for"] : undefined;
  if (chosenFor !== "project_to_open") return failedWith("choose_project_folder needs `chosen_for`, project_to_open");
  return succeeded({ chosen_for: chosenFor });
}

/** `create_new_project { name, location }`: the runtime's `create_project` at `<location>/<name>`, opened in its own studio window, then a status round; refused in the app's words or the runtime's own. */
export async function createNewProject(
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
export async function openRecentProject(sharedState: TatolabAppSharedState, folder: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  const opened = await answerTheWindow("open_recent_project", () => sharedState.projectOpening.openRecentProject(folder));
  stepTheProjectsWindowAsideOnceItOpenedAProject(sharedState, commandFromWindow, opened.ok ? succeeded(folder) : opened);
  return opened;
}

/** `create_new_project`'s arguments as the window sends them, or why they are not. */
export function createNewProjectArgumentsFrom(commandArguments: unknown): Result<{ name: string; location: string }, string> {
  const name = oneTextArgumentFrom("create_new_project", commandArguments, "name", "the new project's name");
  if (!name.ok) return name;
  const location = oneTextArgumentFrom("create_new_project", commandArguments, "location", "the full path of the folder it goes in");
  return location.ok ? succeeded({ name: name.value, location: location.value }) : location;
}

/** `run_open_project`: the runtime's `start_project` queued on the asking window's project's folder, then a status round; refused in the Projects window, or in the runtime's own words, as for a project already running. */
export function runOpenProject(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectRunQueued, string>> {
  return answerTheWindow("run_open_project", async () => {
    const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!studioWindow.ok) return studioWindow;
    const reading = studioWindow.value.openProject.readOpenProject();
    if (reading.kind !== "read") return failedWith(reading.kind === "none_open" ? "No project is open to run." : `The project in ${reading.folder} could not be read: ${reading.refusal}`);
    const queued = await sharedState.controller.startProject(reading.open_project.project.folder);
    sharedState.statusPublisher.requestRefresh();
    return queued.ok ? queued : failedWith(queued.failure.failureDescription);
  });
}

/** `stop_open_project`: the runtime's `stop_project` queued on the asking window's project's folder, so the listing shows its streams `stopping`; refused in the Projects window, or in the runtime's own words. */
export async function stopOpenProject(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
  if (!studioWindow.ok) return studioWindow;
  return answerTheWindowOnceQueued(sharedState, "stop_open_project", () => sharedState.controller.stopProject(studioWindow.value.openProject.projectFolder));
}

/** `undo_in_the_open_project`'s and `redo_in_the_open_project`'s `{ author }` as the window sends it, or why it is not. */
export function undoOrRedoArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<ProjectTransactionAuthor, string> {
  const author = isAJsonObject(commandArguments) ? commandArguments["author"] : undefined;
  if (!isAJsonObject(author) || (author["kind"] !== "person" && author["kind"] !== "agent") || typeof author["name"] !== "string") {
    return failedWith(`${commandName} needs \`author\`, a person or an agent by the name history shows`);
  }
  return succeeded({ kind: author["kind"], name: author["name"] });
}

/** The runtime's `undo` or `redo` by `author` on the asking window's project, as the feed names its folder; refused in the Projects window, or in the runtime's own words. */
export function undoOrRedoInTheOpenProject(
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

/** `pop_out_view`'s arguments as the window sends them, or why they are not. */
export function popOutViewArgumentsFrom(commandArguments: unknown): Result<PoppedOutView, string> {
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
export function popOutView(sharedState: TatolabAppSharedState, target: PoppedOutView, commandFromWindow: TatolabCommandFromWindow): Result<void, string> {
  const studioWindow = sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId);
  if (studioWindow === null) return failedWith("Only a project's studio window can pop out one of its views.");
  sharedState.appWindows.popOutTheViewOf(studioWindow, target);
  return succeeded(undefined);
}

/** The studio window whose Module manager window sent `commandFromWindow`, or the refusal any other window is given. */
function studioWindowOfTheModuleManagerWindowTheCommandCameFrom(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Result<StudioWindowOfAProject, string> {
  const studioWindow = sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId);
  return studioWindow === null ? failedWith("Only a Module manager window imports into a project.") : succeeded(studioWindow);
}

/** The folder of the project the Module manager window that sent `commandFromWindow` imports into, or the refusal any other window is given. */
function workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Result<string, string> {
  const studioWindow = studioWindowOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
  return studioWindow.ok ? succeeded(studioWindow.value.openProject.projectFolder) : studioWindow;
}

/** `list_workspace_dependencies`: the asking Module manager window's workspace's imports, each source read for a newer version with `checkForNewer`; refused in the runtime's own words. */
export function listWorkspaceDependencies(sharedState: TatolabAppSharedState, checkForNewer: boolean, commandFromWindow: TatolabCommandFromWindow): Promise<Result<WorkspaceDependency[], string>> {
  return answerTheWindow("list_workspace_dependencies", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const listed = await sharedState.controller.listDependencies(workspaceFolder.value, checkForNewer);
    if (!listed.ok) return failedWith(listed.failure.failureDescription);
    return succeeded(await workspaceDependenciesOf(workspaceFolder.value, listed.value, (projectFolder) => sharedState.controller.nameTheProject(projectFolder)));
  });
}

/** `choose_dependency_source`: the desktop's open dialog for a project's folder or `.zip`, opened beside the workspace; `null` when the person cancels. */
export function chooseDependencySource(sharedState: TatolabAppSharedState, sourceKind: DependencySourceKind, commandFromWindow: TatolabCommandFromWindow): Promise<Result<string | null, string>> {
  return answerTheWindow("choose_dependency_source", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    return sharedState.dependencySourceDialog(sourceKind, path.dirname(workspaceFolder.value));
  });
}

/** `add_dependency_to_the_workspace`: the runtime's `add_dependency` copies `source` into the asking Module manager window's workspace; refused in the runtime's own words. */
export function addDependencyToTheWorkspace(sharedState: TatolabAppSharedState, source: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectDependency, string>> {
  return answerTheWindow("add_dependency_to_the_workspace", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    if (!path.isAbsolute(source)) return failedWith(`${source} is not a full path to a project's folder or .zip.`);
    const added = await sharedState.controller.addDependency(workspaceFolder.value, source);
    if (!added.ok) return failedWith(added.failure.failureDescription);
    sharedState.tatolabAppLog.info("imported a project into the workspace", { source, folder: added.value.folder, project_folder: workspaceFolder.value });
    return added;
  });
}

/** `update_workspace_dependency`: the runtime's `update_dependency` copies the import `project` again, overwriting files edited since its copy only with `overwriteEditedFiles`; refused in the runtime's own words. */
export function updateWorkspaceDependency(
  sharedState: TatolabAppSharedState,
  project: string,
  overwriteEditedFiles: boolean,
  commandFromWindow: TatolabCommandFromWindow,
): Promise<Result<WorkspaceDependencyUpdate, string>> {
  return answerTheWindow("update_workspace_dependency", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const update = await sharedState.controller.updateDependency(workspaceFolder.value, project, overwriteEditedFiles);
    if (!update.ok) return failedWith(update.failure.failureDescription);
    if (update.value.kind === "updated") sharedState.tatolabAppLog.info("updated an import of the workspace", { project, project_folder: workspaceFolder.value });
    return update;
  });
}

/** `import_from_the_marketplace`: the catalog entry `name`, read afresh, downloaded as its `.zip` into the app's downloads folder and checked, then copied into the asking Module manager window's workspace by the runtime's `add_dependency`; refused in words. */
export function importFromTheMarketplace(sharedState: TatolabAppSharedState, name: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectDependency, string>> {
  return answerTheWindow("import_from_the_marketplace", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const catalog = await readThePackageCatalog(sharedState.fetchTextOverHttps);
    if (catalog.kind === "not_read") return failedWith(catalog.because);
    const entry = catalog.entries.find((listed) => listed.name === name);
    if (entry === undefined) return failedWith(`The catalog lists nothing named ${name}.`);
    const zipPath = await downloadTheCatalogEntrysZip(entry, sharedState.fetchBytesOverHttps, sharedState.moduleDownloadsFolder);
    if (!zipPath.ok) return zipPath;
    const added = await sharedState.controller.addDependency(workspaceFolder.value, zipPath.value);
    if (!added.ok) return failedWith(added.failure.failureDescription);
    sharedState.tatolabAppLog.info("imported a Marketplace module into the workspace", { name, version: entry.version, folder: added.value.folder, project_folder: workspaceFolder.value });
    return added;
  });
}

/** `open_import_to_edit`: the workspace's `imports/<folder>/` opened in its own studio window; refused for a folder the runtime does not list among the workspace's imports. */
export function openImportToEdit(sharedState: TatolabAppSharedState, folder: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<void, string>> {
  return answerTheWindow("open_import_to_edit", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const importFolder = importFolderInsideTheWorkspace(workspaceFolder.value, folder);
    const listed = await sharedState.controller.listDependencies(workspaceFolder.value, false);
    if (!listed.ok) return failedWith(listed.failure.failureDescription);
    if (importFolder === null || !listed.value.some((imported) => imported.dependency.folder === folder)) return failedWith(`The project imports nothing in imports/${folder}.`);
    await sharedState.appWindows.openTheProjectInItsStudioWindow(importFolder);
    return succeeded(undefined);
  });
}

/** `save_project_file`'s arguments as the window sends them, or why they are not. */
export function saveProjectFileArgumentsFrom(commandArguments: unknown): Result<{ file: string; text: string; based_on_version: string | null }, string> {
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
export function sendToPythonLanguageServerArgumentsFrom(commandArguments: unknown): Result<{ session: string; message: JsonValue }, string> {
  const message = isAJsonObject(commandArguments) ? commandArguments["message"] : undefined;
  const session = isAJsonObject(commandArguments) ? commandArguments["session"] : undefined;
  if (typeof session !== "string" || !isAJsonObject(message) || !isAJsonValue(message)) {
    return failedWith("send_to_python_language_server needs `session`, a language server's session, and `message`, one JSON-RPC message");
  }
  return succeeded({ session, message });
}

/** `open_port_viewer`'s arguments as the window sends them, or why they are not. */
export function openPortViewerArgumentsFrom(commandArguments: unknown): Result<PortViewerTarget, string> {
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

/** Each command's handler, taking the arguments as the window sent them and the window that sent them, and answering in the contract's shape. */
export type TatolabWindowCommandHandlers = {
  readonly [CommandName in TatolabCommandName]: (commandArguments: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<CommandName>>;
};

function commandAnswerFrom<Answer>(outcome: Result<Answer, string>): { ok: true; value: Answer } | { ok: false; refusal: string } {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, refusal: outcome.failure };
}

function commandAnswerOfNothingFrom(outcome: Result<unknown, string>): { ok: true; value: null } | { ok: false; refusal: string } {
  return outcome.ok ? { ok: true, value: null } : { ok: false, refusal: outcome.failure };
}

/** The handler of every command the window invokes, over `sharedState`; `quit_tatolab_app` quits through `quitTheApp`. */
export function tatolabWindowCommandHandlers(sharedState: TatolabAppSharedState, quitTheApp: () => void): TatolabWindowCommandHandlers {
  return {
    get_tatolab_status: async () => commandAnswerFrom(await getTatolabStatus(sharedState)),
    link_command_line_tool: async () => commandAnswerOfNothingFrom(await linkCommandLineTool(sharedState)),
    quit_tatolab_app: async () => {
      quitTheApp();
      return { ok: true, value: null };
    },
    read_project_log_records: async (commandArguments, commandFromWindow) => {
      const readArguments = readProjectLogRecordsArgumentsFrom(commandArguments);
      if (!readArguments.ok) return { ok: false, refusal: readArguments.failure };
      const { projectDirectory, narrowing, after } = readArguments.value;
      const readableProjectDirectory = projectDirectoryTheWindowMayAskTheRuntimeAbout(sharedState, projectDirectory, commandFromWindow);
      if (!readableProjectDirectory.ok) return { ok: false, refusal: readableProjectDirectory.failure };
      return commandAnswerFrom(await readProjectLogRecords(sharedState, readableProjectDirectory.value, narrowing, after));
    },
    check_for_tatolab_app_updates: async () => {
      runTatolabAppUpdateWorkInTheBackground(sharedState, "check_for_tatolab_app_updates", (tatolabAppUpdater) => tatolabAppUpdater.checkForUpdatesOnRequest("window"));
      return { ok: true, value: null };
    },
    take_the_newer_tatolab_app_version: async () => {
      runTatolabAppUpdateWorkInTheBackground(sharedState, "take_the_newer_tatolab_app_version", (tatolabAppUpdater) => tatolabAppUpdater.takeTheNewerVersion("window"));
      return { ok: true, value: null };
    },
    describe_stream_graph: async (commandArguments) => {
      const describeStreamGraphArguments = streamArgumentsFrom("describe_stream_graph", commandArguments);
      if (!describeStreamGraphArguments.ok) return { ok: false, refusal: describeStreamGraphArguments.failure };
      return commandAnswerFrom(await describeStreamGraph(sharedState, describeStreamGraphArguments.value.stream));
    },
    describe_node_catalog: async (commandArguments) => {
      const describeNodeCatalogArguments = streamArgumentsFrom("describe_node_catalog", commandArguments);
      if (!describeNodeCatalogArguments.ok) return { ok: false, refusal: describeNodeCatalogArguments.failure };
      return commandAnswerFrom(await describeNodeCatalog(sharedState, describeNodeCatalogArguments.value.stream));
    },
    list_project_node_types: async (commandArguments, commandFromWindow) => {
      const projectDirectory = oneTextArgumentFrom("list_project_node_types", commandArguments, "project_directory", "a project's folder");
      if (!projectDirectory.ok) return { ok: false, refusal: projectDirectory.failure };
      const askableProjectDirectory = projectDirectoryTheWindowMayAskTheRuntimeAbout(sharedState, projectDirectory.value, commandFromWindow);
      if (!askableProjectDirectory.ok) return { ok: false, refusal: askableProjectDirectory.failure };
      return commandAnswerFrom(await listProjectNodeTypes(sharedState, askableProjectDirectory.value));
    },
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
    run_stream_project: async (commandArguments) => {
      const folderArguments = folderArgumentsFrom("run_stream_project", commandArguments);
      if (!folderArguments.ok) return { ok: false, refusal: folderArguments.failure };
      return commandAnswerFrom(await runStreamProject(sharedState, folderArguments.value.folder));
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
    cancel_stream_action: async (commandArguments) => {
      const action = oneTextArgumentFrom("cancel_stream_action", commandArguments, "action", "a stream action's id");
      if (!action.ok) return { ok: false, refusal: action.failure };
      return commandAnswerFrom(await cancelStreamAction(sharedState, action.value));
    },
    describe_runtime: async () => commandAnswerFrom(await describeRuntime(sharedState)),
    restart_runtime: async () => commandAnswerOfNothingFrom(await restartRuntime(sharedState)),
    open_runtime_log_folder: async () => commandAnswerOfNothingFrom(await openRuntimeLogFolder(sharedState)),
    set_stream_failure_notifications: async (commandArguments) => {
      const enabledArguments = enabledArgumentsFrom("set_stream_failure_notifications", commandArguments);
      if (!enabledArguments.ok) return { ok: false, refusal: enabledArguments.failure };
      return commandAnswerOfNothingFrom(await setStreamFailureNotifications(sharedState, enabledArguments.value.enabled));
    },
    set_developer_mode: async (commandArguments) => {
      const enabledArguments = enabledArgumentsFrom("set_developer_mode", commandArguments);
      if (!enabledArguments.ok) return { ok: false, refusal: enabledArguments.failure };
      return commandAnswerOfNothingFrom(await setDeveloperMode(sharedState, enabledArguments.value.enabled));
    },
    set_open_tatolab_at_login: async (commandArguments) => {
      const enabledArguments = enabledArgumentsFrom("set_open_tatolab_at_login", commandArguments);
      if (!enabledArguments.ok) return { ok: false, refusal: enabledArguments.failure };
      return commandAnswerOfNothingFrom(await setOpenTatolabAtLogin(sharedState, enabledArguments.value.enabled));
    },
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
    show_projects_window: async () => {
      sharedState.appWindows.showTheProjectsWindow();
      return { ok: true, value: null };
    },
    pop_out_view: async (commandArguments, commandFromWindow) => {
      const target = popOutViewArgumentsFrom(commandArguments);
      if (!target.ok) return { ok: false, refusal: target.failure };
      return commandAnswerOfNothingFrom(popOutView(sharedState, target.value, commandFromWindow));
    },
    read_popped_out_view: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.poppedOutViewOfTheWindowWithContents(commandFromWindow.windowContentsId),
    }),
    open_module_manager_window: async (_commandArguments, commandFromWindow) => {
      const studioWindow = sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId);
      if (studioWindow === null) return { ok: false, refusal: "Only a project's studio window opens Module manager." };
      sharedState.appWindows.openTheModuleManagerWindowOf(studioWindow);
      return { ok: true, value: null };
    },
    read_module_manager_workspace: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId)?.openProject.readOpenProject() ?? null,
    }),
    read_package_catalog: async () => ({ ok: true, value: await readThePackageCatalog(sharedState.fetchTextOverHttps) }),
    list_workspace_dependencies: async (commandArguments, commandFromWindow) => {
      const checkForNewer = isAJsonObject(commandArguments) ? commandArguments["check_for_newer"] : undefined;
      if (typeof checkForNewer !== "boolean") return { ok: false, refusal: "list_workspace_dependencies needs `check_for_newer`, true to read each import's source for a newer version" };
      return commandAnswerFrom(await listWorkspaceDependencies(sharedState, checkForNewer, commandFromWindow));
    },
    choose_dependency_source: async (commandArguments, commandFromWindow) => {
      const sourceKind = isAJsonObject(commandArguments) ? commandArguments["source_kind"] : undefined;
      if (sourceKind !== "folder" && sourceKind !== "zip") return { ok: false, refusal: "choose_dependency_source needs `source_kind`, `folder` or `zip`" };
      return commandAnswerFrom(await chooseDependencySource(sharedState, sourceKind, commandFromWindow));
    },
    add_dependency_to_the_workspace: async (commandArguments, commandFromWindow) => {
      const source = oneTextArgumentFrom("add_dependency_to_the_workspace", commandArguments, "source", "a project's folder or .zip, as a full path");
      if (!source.ok) return { ok: false, refusal: source.failure };
      return commandAnswerFrom(await addDependencyToTheWorkspace(sharedState, source.value, commandFromWindow));
    },
    update_workspace_dependency: async (commandArguments, commandFromWindow) => {
      const project = oneTextArgumentFrom("update_workspace_dependency", commandArguments, "project", "the UUID of one of the workspace's imports");
      if (!project.ok) return { ok: false, refusal: project.failure };
      const overwriteEditedFiles = isAJsonObject(commandArguments) ? commandArguments["overwrite_edited_files"] : undefined;
      if (typeof overwriteEditedFiles !== "boolean") return { ok: false, refusal: "update_workspace_dependency needs `overwrite_edited_files`, true to overwrite the files edited since the import's copy" };
      return commandAnswerFrom(await updateWorkspaceDependency(sharedState, project.value, overwriteEditedFiles, commandFromWindow));
    },
    import_from_the_marketplace: async (commandArguments, commandFromWindow) => {
      const name = oneTextArgumentFrom("import_from_the_marketplace", commandArguments, "name", "the name of an entry the catalog lists");
      if (!name.ok) return { ok: false, refusal: name.failure };
      return commandAnswerFrom(await importFromTheMarketplace(sharedState, name.value, commandFromWindow));
    },
    open_import_to_edit: async (commandArguments, commandFromWindow) => {
      const folder = oneTextArgumentFrom("open_import_to_edit", commandArguments, "folder", "the folder under imports/ of one of the workspace's imports");
      if (!folder.ok) return { ok: false, refusal: folder.failure };
      return commandAnswerOfNothingFrom(await openImportToEdit(sharedState, folder.value, commandFromWindow));
    },
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
      return commandAnswerFrom(await answerTheWindow("save_project_file", () => studioWindow.value.openProjectFiles.saveProjectFile(file, text, based_on_version)));
    },
    list_project_files: async (commandArguments, commandFromWindow) => {
      const projectFolder = oneTextArgumentFrom("list_project_files", commandArguments, "project_folder", "the folder of the open project or of one of its imports");
      if (!projectFolder.ok) return { ok: false, refusal: projectFolder.failure };
      const studioWindow = studioWindowTheCommandCameFrom(sharedState, commandFromWindow);
      if (!studioWindow.ok) return { ok: false, refusal: studioWindow.failure };
      return commandAnswerFrom(await answerTheWindow("list_project_files", () => studioWindow.value.openProjectFiles.listProjectFiles(projectFolder.value)));
    },
    run_open_project: async (_commandArguments, commandFromWindow) => commandAnswerFrom(await runOpenProject(sharedState, commandFromWindow)),
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
    show_menus_in_the_system_menu_bar: async (commandArguments, commandFromWindow) => {
      const menus = systemMenuBarMenusFrom(commandArguments);
      if (!menus.ok) return { ok: false, refusal: menus.failure };
      sharedState.systemMenuBar.keepTheMenusOfTheWindow(commandFromWindow.windowContentsId, menus.value);
      return { ok: true, value: null };
    },
  };
}

async function streamProjectFolderOpeningOnTheStreamNamedIn(
  sharedState: TatolabAppSharedState,
  commandName: StreamProjectFolderCommandName,
  commandArguments: unknown,
): Promise<Result<void, string>> {
  const streamArguments = streamArgumentsFrom(commandName, commandArguments);
  return streamArguments.ok ? openStreamProjectFolderOnRequest(sharedState, commandName, streamArguments.value.stream) : streamArguments;
}
