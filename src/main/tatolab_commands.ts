// The commands the window's frontend invokes, under the names it invokes them by. A request that
// changes the machine starts in the background, as the tray's choices do, and its outcome reaches
// the window as the next `tatolab-status-changed`. A question the window awaits is answered with
// its answer or a refusal in words, never a thrown error.

import type {
  RuntimeDescription,
  StreamGraphSummary,
  StreamLogRecordsPage,
  StreamProjectFolderChosenFor,
  StreamProjectFolderReport,
  StreamProjectRunOutcome,
  TatolabStatus,
  TatolabStreamActionName,
} from "../shared/tatolab_backend_contract.js";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject, isAnUnsignedInteger } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import {
  checkForTatolabAppUpdatesOnRequest,
  runInTheBackgroundWithTheController,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";
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

/** `read_stream_log_records { stream, after }`: `stream`'s log records numbered after `after`; refused in the runtime's own words. */
export function readStreamLogRecords(sharedState: TatolabAppSharedState, stream: string, after: number): Promise<Result<StreamLogRecordsPage, string>> {
  return answerTheWindow("read_stream_log_records", async () => {
    const page = await sharedState.controller.readStreamLogRecords(stream, after);
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

/** `stop_stream`, `start_stream` or `remove_stream { stream }`: the runtime's tool of that name run on `stream`, then a status round whether it acted or refused; its notice or its refusal in its own words. */
export function runStreamAction(sharedState: TatolabAppSharedState, streamAction: TatolabStreamActionName, stream: string): Promise<Result<string | null, string>> {
  return answerTheWindow(streamAction, async () => {
    const notice = await sharedState.controller.runStreamAction(streamAction, stream);
    sharedState.statusPublisher.requestRefresh();
    return notice.ok ? notice : failedWith(notice.failure.failureDescription);
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

/** `open_terminal_at_stream_project { folder }`: a terminal in `folder`, a folder the app handed the window; refused naming why. */
export function openTerminalAtChosenProjectFolder(sharedState: TatolabAppSharedState, folder: string): Promise<Result<void, string>> {
  return answerTheWindow("open_terminal_at_stream_project", () => sharedState.streamProjectAdding.openTerminalInStreamProjectFolder(folder));
}

/** `choose_stream_project_folder { chosen_for }`: the app's folder dialog, then what the chosen folder holds; `null` when the person cancels. */
export function chooseStreamProjectFolder(sharedState: TatolabAppSharedState, chosenFor: StreamProjectFolderChosenFor): Promise<Result<StreamProjectFolderReport | null, string>> {
  return answerTheWindow("choose_stream_project_folder", () => sharedState.streamProjectAdding.chooseStreamProjectFolder(chosenFor));
}

/** `propose_new_stream_project_folder`: the first free `~/streams/hello[-N]` for a new project. */
export function proposeNewStreamProjectFolder(sharedState: TatolabAppSharedState): Promise<Result<StreamProjectFolderReport, string>> {
  return answerTheWindow("propose_new_stream_project_folder", async () => succeeded(await sharedState.streamProjectAdding.proposeNewStreamProjectFolder()));
}

/** `check_stream_project_folder { folder }`: what `folder` holds now. */
export function checkStreamProjectFolder(sharedState: TatolabAppSharedState, folder: string): Promise<Result<StreamProjectFolderReport, string>> {
  return answerTheWindow("check_stream_project_folder", () => sharedState.streamProjectAdding.checkStreamProjectFolder(folder));
}

/** `create_stream_project { folder }`: `tatolab new <folder>`, then what the folder holds; refused in the CLI's own words. */
export function createStreamProject(sharedState: TatolabAppSharedState, folder: string): Promise<Result<StreamProjectFolderReport, string>> {
  return answerTheWindow("create_stream_project", () => sharedState.streamProjectAdding.createStreamProject(folder));
}

/** `run_stream_project { folder, stream_function, name }`: `run_stream` on `folder`, kept, then a status round whether it loaded or was refused. */
export function runStreamProject(
  sharedState: TatolabAppSharedState,
  folder: string,
  streamFunction: string | null,
  streamName: string | null,
): Promise<Result<StreamProjectRunOutcome, string>> {
  return answerTheWindow("run_stream_project", async () => {
    const outcome = await sharedState.streamProjectAdding.runStreamProject(folder, streamFunction, streamName);
    sharedState.statusPublisher.requestRefresh();
    return outcome;
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

/** The `{ enabled }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function enabledArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ enabled: boolean }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["enabled"] !== "boolean") {
    return failedWith(`${commandName} needs \`enabled\`, true or false`);
  }
  return succeeded({ enabled: commandArguments["enabled"] });
}

/** `read_stream_log_records`'s arguments as the window sends them, or why they are not. */
export function readStreamLogRecordsArgumentsFrom(commandArguments: unknown): Result<{ stream: string; after: number }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["stream"] !== "string" || !isAnUnsignedInteger(commandArguments["after"])) {
    return failedWith("read_stream_log_records needs `stream`, a stream's name, and `after`, a sequence number from 0");
  }
  return succeeded({ stream: commandArguments["stream"], after: commandArguments["after"] });
}

/** The `{ stream }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function streamArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ stream: string }, string> {
  const stream = oneTextArgumentFrom(commandName, commandArguments, "stream", "a stream's name");
  return stream.ok ? succeeded({ stream: stream.value }) : stream;
}

/** The text argument `argumentName` of the command `commandName`, or why the window's arguments carry none, naming what it is. */
function oneTextArgumentFrom(commandName: TatolabCommandName, commandArguments: unknown, argumentName: string, whatItIs: string): Result<string, string> {
  const argument = isAJsonObject(commandArguments) ? commandArguments[argumentName] : undefined;
  return typeof argument === "string" ? succeeded(argument) : failedWith(`${commandName} needs \`${argumentName}\`, ${whatItIs}`);
}

/** `open_terminal_at_stream_project`'s arguments as the window sends them: a listed stream or a folder, or why they are neither. */
export function streamOrFolderArgumentsFrom(commandArguments: unknown): Result<{ stream: string } | { folder: string }, string> {
  const refusal = failedWith("open_terminal_at_stream_project needs `stream`, a stream's name, or `folder`, a folder chosen in the window");
  if (!isAJsonObject(commandArguments)) return refusal;
  const stream = commandArguments["stream"];
  if (typeof stream === "string") return succeeded({ stream });
  const folder = commandArguments["folder"];
  return typeof folder === "string" ? succeeded({ folder }) : refusal;
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

/** `run_stream_project`'s arguments as the window sends them, or why they are not. */
export function runStreamProjectArgumentsFrom(
  commandArguments: unknown,
): Result<{ folder: string; stream_function: string | null; name: string | null }, string> {
  const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
  if (
    !isAJsonObject(commandArguments) ||
    typeof commandArguments["folder"] !== "string" ||
    !isTextOrNull(commandArguments["stream_function"]) ||
    !isTextOrNull(commandArguments["name"])
  ) {
    return failedWith("run_stream_project needs `folder`, a folder chosen in the window, and `stream_function` and `name`, each text or null");
  }
  return succeeded({ folder: commandArguments["folder"], stream_function: commandArguments["stream_function"], name: commandArguments["name"] });
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
    read_stream_log_records: async (commandArguments) => {
      const readStreamLogRecordsArguments = readStreamLogRecordsArgumentsFrom(commandArguments);
      if (!readStreamLogRecordsArguments.ok) return { ok: false, refusal: readStreamLogRecordsArguments.failure };
      const { stream, after } = readStreamLogRecordsArguments.value;
      return commandAnswerFrom(await readStreamLogRecords(sharedState, stream, after));
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
    stop_stream: async (commandArguments) => {
      const notice = await streamActionOnTheStreamNamedIn(sharedState, "stop_stream", commandArguments);
      return commandAnswerFrom(notice.ok ? succeeded({ not_recorded_because: notice.value }) : notice);
    },
    start_stream: async (commandArguments) => commandAnswerOfNothingFrom(await streamActionOnTheStreamNamedIn(sharedState, "start_stream", commandArguments)),
    remove_stream: async (commandArguments) => commandAnswerOfNothingFrom(await streamActionOnTheStreamNamedIn(sharedState, "remove_stream", commandArguments)),
    open_stream_project_folder: async (commandArguments) =>
      commandAnswerOfNothingFrom(await streamProjectFolderOpeningOnTheStreamNamedIn(sharedState, "open_stream_project_folder", commandArguments)),
    open_terminal_at_stream_project: async (commandArguments) => {
      const streamOrFolderArguments = streamOrFolderArgumentsFrom(commandArguments);
      if (!streamOrFolderArguments.ok) return { ok: false, refusal: streamOrFolderArguments.failure };
      const streamOrFolder = streamOrFolderArguments.value;
      return commandAnswerOfNothingFrom(
        "stream" in streamOrFolder
          ? await openStreamProjectFolderOnRequest(sharedState, "open_terminal_at_stream_project", streamOrFolder.stream)
          : await openTerminalAtChosenProjectFolder(sharedState, streamOrFolder.folder),
      );
    },
    open_stream_log_folder: async (commandArguments) =>
      commandAnswerOfNothingFrom(await streamProjectFolderOpeningOnTheStreamNamedIn(sharedState, "open_stream_log_folder", commandArguments)),
    choose_stream_project_folder: async (commandArguments) => {
      const chooseArguments = chooseStreamProjectFolderArgumentsFrom(commandArguments);
      if (!chooseArguments.ok) return { ok: false, refusal: chooseArguments.failure };
      return commandAnswerFrom(await chooseStreamProjectFolder(sharedState, chooseArguments.value.chosen_for));
    },
    propose_new_stream_project_folder: async () => commandAnswerFrom(await proposeNewStreamProjectFolder(sharedState)),
    check_stream_project_folder: async (commandArguments) => {
      const folderArguments = folderArgumentsFrom("check_stream_project_folder", commandArguments);
      if (!folderArguments.ok) return { ok: false, refusal: folderArguments.failure };
      return commandAnswerFrom(await checkStreamProjectFolder(sharedState, folderArguments.value.folder));
    },
    create_stream_project: async (commandArguments) => {
      const folderArguments = folderArgumentsFrom("create_stream_project", commandArguments);
      if (!folderArguments.ok) return { ok: false, refusal: folderArguments.failure };
      return commandAnswerFrom(await createStreamProject(sharedState, folderArguments.value.folder));
    },
    run_stream_project: async (commandArguments) => {
      const runArguments = runStreamProjectArgumentsFrom(commandArguments);
      if (!runArguments.ok) return { ok: false, refusal: runArguments.failure };
      const { folder, stream_function, name } = runArguments.value;
      return commandAnswerFrom(await runStreamProject(sharedState, folder, stream_function, name));
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
): Promise<Result<string | null, string>> {
  const streamArguments = streamArgumentsFrom(streamAction, commandArguments);
  return streamArguments.ok ? runStreamAction(sharedState, streamAction, streamArguments.value.stream) : streamArguments;
}
