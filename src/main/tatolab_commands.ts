// The commands the window's frontend invokes, under the names it invokes them by. A request that
// changes the machine starts in the background, as the tray's choices do, and its outcome reaches
// the window as the next `tatolab-status-changed`. A question the window awaits is answered with
// its answer or a refusal in words, never a thrown error.

import type {
  ProjectCreationQueued,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectRunQueued,
  RelaySettingsByName,
  RelaysDescription,
  RuntimeDescription,
  StreamActionFollowed,
  StreamGraphSummary,
  StreamProjectFolderChosenFor,
  TatolabStatus,
  TatolabStreamActionName,
} from "../shared/tatolab_backend_contract.js";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import {
  checkForTatolabAppUpdatesOnRequest,
  runInTheBackgroundWithTheController,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";
import { relaySettingsByNameFrom, WHAT_A_RELAY_SETTING_VALUE_CAN_BE } from "./relays_description.js";
import { openTheRuntimesLogFolder } from "./runtime_log_folder_opening.js";
import { openStreamProjectFolder, type StreamProjectFolderOpening } from "./stream_project_folder_opening.js";

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

/** `set_run_tatolab { enabled }`: turn "Run Tatolab" on or off. */
export function setRunTatolab(sharedState: TatolabAppSharedState, enabled: boolean): void {
  runInTheBackgroundWithTheController(sharedState, "tatolab-run-tatolab-set", async (controller, statusPublisher) => {
    await controller.setRunTatolab(enabled);
    statusPublisher.requestRefresh();
  });
}

/** `open_login_items_settings`: open System Settings at Login Items, where a user approves the runtime's login item; refused where the platform has no Login Items. */
export function openLoginItemsSettings(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindow("open_login_items_settings", () => sharedState.controller.openLoginItemsSettings());
}

/** `remember_first_run_finished`: "Get Started" ended first run, answered once it is remembered, then a status round; refused when it could not be remembered, though it holds until the app quits. */
export function rememberFirstRunFinished(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindowThenRefreshTheStatus(sharedState, "remember_first_run_finished", () => sharedState.controller.rememberFirstRunFinished());
}

/** `link_command_line_tool_in_usr_local_bin`: link `tatolab` in `/usr/local/bin` behind the administrator prompt, answered once it closes, then a status round; refused in words, and where it is not offered, with why. */
export function linkCommandLineToolInUsrLocalBin(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindowThenRefreshTheStatus(sharedState, "link_command_line_tool_in_usr_local_bin", () => sharedState.controller.linkTheCommandLineToolInUsrLocalBin());
}

/** `uninstall_tatolab`: uninstall Tatolab, turning "Run Tatolab" off first and ending with the app quitting; refused in words, leaving the app usable, and at once on Linux, where the installer uninstalls. */
export function uninstallTatolab(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindow("uninstall_tatolab", () => sharedState.tatolabUninstall.uninstallTatolab(sharedState.controller));
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

/** `stop_stream` or `start_stream { stream }`: the runtime's tool of that name queued on `stream`, so the listing shows the stream `stopping` or `preparing`; refused in the runtime's own words. */
export function runStreamAction(sharedState: TatolabAppSharedState, streamAction: TatolabStreamActionName, stream: string): Promise<Result<void, string>> {
  return answerTheWindowOnceQueued(sharedState, streamAction, () => sharedState.controller.runStreamAction(streamAction, stream));
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

/** `rename_stream { stream, display_name }`: the runtime's `rename_stream` on `stream`, then a status round whether it renamed or refused; refused in the runtime's own words. */
export function renameStream(sharedState: TatolabAppSharedState, stream: string, displayName: string): Promise<Result<void, string>> {
  return answerTheWindow("rename_stream", async () => {
    const renamed = await sharedState.controller.renameStream(stream, displayName);
    sharedState.statusPublisher.requestRefresh();
    return renamed.ok ? renamed : failedWith(renamed.failure.failureDescription);
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

/** `run_stream_project { folder }`: the runtime's `run_project` queued on `folder`, then a status round; refused in the runtime's own words. */
export function runStreamProject(sharedState: TatolabAppSharedState, folder: string): Promise<Result<ProjectRunQueued, string>> {
  return answerTheWindow("run_stream_project", async () => {
    const queued = await sharedState.streamProjectAdding.runStreamProject(folder);
    sharedState.statusPublisher.requestRefresh();
    return queued;
  });
}

/** `reload_project { project_directory }`: the runtime's `run_project` queued on a project it lists, which loads every `@stream` in it again, then a status round; refused in the runtime's own words. */
export function reloadProject(sharedState: TatolabAppSharedState, projectDirectory: string): Promise<Result<ProjectRunQueued, string>> {
  return answerTheWindow("reload_project", async () => {
    const queued = await sharedState.controller.runProject(projectDirectory);
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

/** `describe_runtime`: the running runtime's version, build, uptime and own log folder; refused in the runtime's own words. */
export function describeRuntime(sharedState: TatolabAppSharedState): Promise<Result<RuntimeDescription, string>> {
  return answerTheWindow("describe_runtime", async () => {
    const runtimeDescription = await sharedState.controller.describeRuntime();
    return runtimeDescription.ok ? runtimeDescription : failedWith(runtimeDescription.failure.failureDescription);
  });
}

/** `restart_runtime`: stop the runtime and start it again through the service manager, then a status round whether it restarted or was refused; refused while Run Tatolab is off, and in the service manager's words. */
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

/** `set_open_tatolab_at_login { enabled }`: have the desktop open the app at login, or stop, then a status round; refused in the desktop's words. */
export function setOpenTatolabAtLogin(sharedState: TatolabAppSharedState, enabled: boolean): Promise<Result<void, string>> {
  return answerTheWindow("set_open_tatolab_at_login", async () => {
    const set = await sharedState.controller.setOpenTatolabAtLogin(enabled);
    sharedState.statusPublisher.requestRefresh();
    return set;
  });
}

/** `describe_relays`: every relay the runtime holds and every adapter it can join one through; refused in the runtime's own words. */
export function describeRelays(sharedState: TatolabAppSharedState): Promise<Result<RelaysDescription, string>> {
  return answerTheWindow("describe_relays", async () => {
    const relaysDescription = await sharedState.controller.describeRelays();
    return relaysDescription.ok ? relaysDescription : failedWith(relaysDescription.failure.failureDescription);
  });
}

/** `add_relay { adapter, settings }`: the runtime's `add_relay`, answering the id it gave the relay; refused in the runtime's own words. */
export function addRelay(sharedState: TatolabAppSharedState, adapter: string, settings: Readonly<RelaySettingsByName>): Promise<Result<{ relay_id: string }, string>> {
  return answerTheWindow("add_relay", async () => {
    const relayId = await sharedState.controller.addRelay(adapter, settings);
    return relayId.ok ? succeeded({ relay_id: relayId.value }) : failedWith(relayId.failure.failureDescription);
  });
}

/** `configure_relay { relay_id, settings }`: the runtime's `configure_relay`; refused in the runtime's own words. */
export function configureRelay(sharedState: TatolabAppSharedState, relayId: string, settings: Readonly<RelaySettingsByName>): Promise<Result<void, string>> {
  return answerTheWindow("configure_relay", async () => {
    const configured = await sharedState.controller.configureRelay(relayId, settings);
    return configured.ok ? configured : failedWith(configured.failure.failureDescription);
  });
}

/** `remove_relay { relay_id }`: the runtime's `remove_relay`; refused in the runtime's own words, as it refuses a built-in relay. */
export function removeRelay(sharedState: TatolabAppSharedState, relayId: string): Promise<Result<void, string>> {
  return answerTheWindow("remove_relay", async () => {
    const removed = await sharedState.controller.removeRelay(relayId);
    return removed.ok ? removed : failedWith(removed.failure.failureDescription);
  });
}

/** The `settings` of the command `commandName` as the window sends them: each value text, a finite number, true or false, a list of text, or null; anything else is refused naming the setting, never its value. */
function relaySettingsArgumentFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<RelaySettingsByName, string> {
  const settingsArgument = isAJsonObject(commandArguments) ? commandArguments["settings"] : undefined;
  if (!isAJsonObject(settingsArgument)) return failedWith(`${commandName} needs \`settings\`, each setting by name`);
  return relaySettingsByNameFrom(settingsArgument, (settingName) => `${commandName} needs the setting \`${settingName}\` as ${WHAT_A_RELAY_SETTING_VALUE_CAN_BE}`);
}

/** `add_relay`'s arguments as the window sends them, or why they are not. */
export function addRelayArgumentsFrom(commandArguments: unknown): Result<{ adapter: string; settings: RelaySettingsByName }, string> {
  const adapter = oneTextArgumentFrom("add_relay", commandArguments, "adapter", "an adapter's kind");
  if (!adapter.ok) return adapter;
  const settings = relaySettingsArgumentFrom("add_relay", commandArguments);
  return settings.ok ? succeeded({ adapter: adapter.value, settings: settings.value }) : settings;
}

/** `configure_relay`'s arguments as the window sends them, or why they are not. */
export function configureRelayArgumentsFrom(commandArguments: unknown): Result<{ relay_id: string; settings: RelaySettingsByName }, string> {
  const relayId = oneTextArgumentFrom("configure_relay", commandArguments, "relay_id", "a relay's id");
  if (!relayId.ok) return relayId;
  const settings = relaySettingsArgumentFrom("configure_relay", commandArguments);
  return settings.ok ? succeeded({ relay_id: relayId.value, settings: settings.value }) : settings;
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

/** Each command's handler, taking the arguments as the window sent them and answering in the contract's shape. */
export type TatolabWindowCommandHandlers = {
  readonly [CommandName in TatolabCommandName]: (commandArguments: unknown) => Promise<TatolabCommandAnswerTo<CommandName>>;
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
    set_run_tatolab: async (commandArguments) => {
      const setRunTatolabArguments = enabledArgumentsFrom("set_run_tatolab", commandArguments);
      if (!setRunTatolabArguments.ok) return { ok: false, refusal: setRunTatolabArguments.failure };
      setRunTatolab(sharedState, setRunTatolabArguments.value.enabled);
      return { ok: true, value: null };
    },
    open_login_items_settings: async () => commandAnswerOfNothingFrom(await openLoginItemsSettings(sharedState)),
    remember_first_run_finished: async () => commandAnswerOfNothingFrom(await rememberFirstRunFinished(sharedState)),
    link_command_line_tool_in_usr_local_bin: async () => commandAnswerOfNothingFrom(await linkCommandLineToolInUsrLocalBin(sharedState)),
    uninstall_tatolab: async () => commandAnswerOfNothingFrom(await uninstallTatolab(sharedState)),
    quit_tatolab_app: async () => {
      quitTheApp();
      return { ok: true, value: null };
    },
    read_project_log_records: async (commandArguments) => {
      const readArguments = readProjectLogRecordsArgumentsFrom(commandArguments);
      if (!readArguments.ok) return { ok: false, refusal: readArguments.failure };
      const { projectDirectory, narrowing, after } = readArguments.value;
      const listedProjectDirectory = projectDirectoryTheRuntimeLastListed(sharedState, projectDirectory);
      if (!listedProjectDirectory.ok) return { ok: false, refusal: listedProjectDirectory.failure };
      return commandAnswerFrom(await readProjectLogRecords(sharedState, listedProjectDirectory.value, narrowing, after));
    },
    check_for_tatolab_app_updates: async () => {
      checkForTatolabAppUpdatesOnRequest(sharedState, "window");
      return { ok: true, value: null };
    },
    describe_stream_graph: async (commandArguments) => {
      const describeStreamGraphArguments = streamArgumentsFrom("describe_stream_graph", commandArguments);
      if (!describeStreamGraphArguments.ok) return { ok: false, refusal: describeStreamGraphArguments.failure };
      return commandAnswerFrom(await describeStreamGraph(sharedState, describeStreamGraphArguments.value.stream));
    },
    stop_stream: async (commandArguments) => commandAnswerOfNothingFrom(await streamActionOnTheStreamNamedIn(sharedState, "stop_stream", commandArguments)),
    start_stream: async (commandArguments) => commandAnswerOfNothingFrom(await streamActionOnTheStreamNamedIn(sharedState, "start_stream", commandArguments)),
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
    describe_runtime: async () => commandAnswerFrom(await describeRuntime(sharedState)),
    restart_runtime: async () => commandAnswerOfNothingFrom(await restartRuntime(sharedState)),
    open_runtime_log_folder: async () => commandAnswerOfNothingFrom(await openRuntimeLogFolder(sharedState)),
    set_stream_failure_notifications: async (commandArguments) => {
      const enabledArguments = enabledArgumentsFrom("set_stream_failure_notifications", commandArguments);
      if (!enabledArguments.ok) return { ok: false, refusal: enabledArguments.failure };
      return commandAnswerOfNothingFrom(await setStreamFailureNotifications(sharedState, enabledArguments.value.enabled));
    },
    set_open_tatolab_at_login: async (commandArguments) => {
      const enabledArguments = enabledArgumentsFrom("set_open_tatolab_at_login", commandArguments);
      if (!enabledArguments.ok) return { ok: false, refusal: enabledArguments.failure };
      return commandAnswerOfNothingFrom(await setOpenTatolabAtLogin(sharedState, enabledArguments.value.enabled));
    },
    describe_relays: async () => commandAnswerFrom(await describeRelays(sharedState)),
    add_relay: async (commandArguments) => {
      const addRelayArguments = addRelayArgumentsFrom(commandArguments);
      if (!addRelayArguments.ok) return { ok: false, refusal: addRelayArguments.failure };
      return commandAnswerFrom(await addRelay(sharedState, addRelayArguments.value.adapter, addRelayArguments.value.settings));
    },
    configure_relay: async (commandArguments) => {
      const configureRelayArguments = configureRelayArgumentsFrom(commandArguments);
      if (!configureRelayArguments.ok) return { ok: false, refusal: configureRelayArguments.failure };
      return commandAnswerOfNothingFrom(await configureRelay(sharedState, configureRelayArguments.value.relay_id, configureRelayArguments.value.settings));
    },
    remove_relay: async (commandArguments) => {
      const relayId = oneTextArgumentFrom("remove_relay", commandArguments, "relay_id", "a relay's id");
      if (!relayId.ok) return { ok: false, refusal: relayId.failure };
      return commandAnswerOfNothingFrom(await removeRelay(sharedState, relayId.value));
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

async function streamActionOnTheStreamNamedIn(
  sharedState: TatolabAppSharedState,
  streamAction: TatolabStreamActionName,
  commandArguments: unknown,
): Promise<Result<void, string>> {
  const streamArguments = streamArgumentsFrom(streamAction, commandArguments);
  return streamArguments.ok ? runStreamAction(sharedState, streamAction, streamArguments.value.stream) : streamArguments;
}
