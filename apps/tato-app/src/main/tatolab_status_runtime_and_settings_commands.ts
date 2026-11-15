import type { RuntimeDescription, StudioWarningKind, TatolabAppUpdateAnnouncementAnswer, TatolabAppUpdateAnnouncementKind, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import type { TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { runTatolabAppUpdateWorkInTheBackground, type TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { openTheRuntimesLogFolder } from "./runtime_log_folder_opening.js";
import { systemMenuBarMenusFrom } from "./system_menu_bar_of_the_focused_window.js";
import { answerTheWindow, answerTheWindowThenRefreshTheStatus, oneTextArgumentFrom, type TatolabWindowCommandHandlers, commandAnswerFrom, commandAnswerOfNothingFrom } from "./tatolab_command_answers.js";

/** How long `get_tatolab_status` waits for the poller's first round when the window asks first. */
const FIRST_STATUS_ROUND_WAIT_LIMIT_MS = 15_000;

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

/** `dismiss_the_studio_warning_dialog { kind }`: remember that the warning's dialog was shown, then a status round, so no window shows it again; refused when that could not be remembered. */
export function dismissTheStudioWarningDialog(sharedState: TatolabAppSharedState, kind: StudioWarningKind): Promise<Result<void, string>> {
  return answerTheWindow("dismiss_the_studio_warning_dialog", async () => {
    const remembered = await sharedState.studioWarnings.rememberTheDialogWasShown(kind);
    sharedState.statusPublisher.requestRefresh();
    return remembered;
  });
}

/** `dismiss_the_studio_warning_dialog`'s arguments as the window sends them, or why they are not. */
export function dismissTheStudioWarningDialogArgumentsFrom(commandArguments: unknown): Result<{ kind: StudioWarningKind }, string> {
  const kind = oneTextArgumentFrom("dismiss_the_studio_warning_dialog", commandArguments, "kind", "the warning's kind");
  if (!kind.ok) return kind;
  if (kind.value !== "viewer_frames_copied_on_x11") return failedWith(`dismiss_the_studio_warning_dialog takes \`kind\` viewer_frames_copied_on_x11, not ${kind.value}`);
  return succeeded({ kind: kind.value });
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

/** `answer_the_app_update_announcement`'s arguments as the window sends them, or why they are not. */
export function appUpdateAnnouncementAnswerArgumentsFrom(
  commandArguments: unknown,
): Result<{ kind: TatolabAppUpdateAnnouncementKind; version: string; answer: TatolabAppUpdateAnnouncementAnswer }, string> {
  const kind = oneTextArgumentFrom("answer_the_app_update_announcement", commandArguments, "kind", "the announcement's kind");
  if (!kind.ok) return kind;
  if (kind.value !== "update_ready" && kind.value !== "update_landed") return failedWith(`answer_the_app_update_announcement takes \`kind\` update_ready or update_landed, not ${kind.value}`);
  const version = oneTextArgumentFrom("answer_the_app_update_announcement", commandArguments, "version", "the announcement's version");
  if (!version.ok) return version;
  const answer = oneTextArgumentFrom("answer_the_app_update_announcement", commandArguments, "answer", "how the person answered");
  if (!answer.ok) return answer;
  if (answer.value !== "take_its_action" && answer.value !== "dismiss") return failedWith(`answer_the_app_update_announcement takes \`answer\` take_its_action or dismiss, not ${answer.value}`);
  return succeeded({ kind: kind.value, version: version.value, answer: answer.value });
}

type StatusRuntimeAndSettingsCommandName =
  | "get_tatolab_status"
  | "link_command_line_tool"
  | "quit_tatolab_app"
  | "check_for_tatolab_app_updates"
  | "take_the_newer_tatolab_app_version"
  | "answer_the_app_update_announcement"
  | "describe_runtime"
  | "restart_runtime"
  | "open_runtime_log_folder"
  | "set_stream_failure_notifications"
  | "set_developer_mode"
  | "dismiss_the_studio_warning_dialog"
  | "set_open_tatolab_at_login"
  | "show_menus_in_the_system_menu_bar";

/** The handlers of the window's commands on the app's status, the runtime, app updates and the settings, over `sharedState`; `quit_tatolab_app` quits through `quitTheApp`. */
export function statusRuntimeAndSettingsCommandHandlersOf(sharedState: TatolabAppSharedState, quitTheApp: () => void): Pick<TatolabWindowCommandHandlers, StatusRuntimeAndSettingsCommandName> {
  return {
    get_tatolab_status: async () => commandAnswerFrom(await getTatolabStatus(sharedState)),
    link_command_line_tool: async () => commandAnswerOfNothingFrom(await linkCommandLineTool(sharedState)),
    quit_tatolab_app: async () => {
      quitTheApp();
      return { ok: true, value: null };
    },
    check_for_tatolab_app_updates: async () => {
      runTatolabAppUpdateWorkInTheBackground(sharedState, "check_for_tatolab_app_updates", (tatolabAppUpdater) => tatolabAppUpdater.checkForUpdatesOnRequest("window"));
      return { ok: true, value: null };
    },
    take_the_newer_tatolab_app_version: async () => {
      runTatolabAppUpdateWorkInTheBackground(sharedState, "take_the_newer_tatolab_app_version", (tatolabAppUpdater) => tatolabAppUpdater.takeTheNewerVersion("window"));
      return { ok: true, value: null };
    },
    answer_the_app_update_announcement: async (commandArguments) => {
      const answerArguments = appUpdateAnnouncementAnswerArgumentsFrom(commandArguments);
      if (!answerArguments.ok) return { ok: false, refusal: answerArguments.failure };
      const { kind, version, answer } = answerArguments.value;
      const answered = sharedState.tatolabAppUpdateAnnouncements.takeAwayTheAnswered(kind, version);
      if (answered === null || answer === "dismiss") return { ok: true, value: null };
      if (answered.kind === "update_ready") {
        runTatolabAppUpdateWorkInTheBackground(sharedState, "answer_the_app_update_announcement", (tatolabAppUpdater) => tatolabAppUpdater.installTheVersionTheUpdateDialogNamed(answered.version));
        return { ok: true, value: null };
      }
      const opened = await sharedState.openAWebPageInTheBrowser(answered.release_notes_url);
      return opened.ok ? { ok: true, value: null } : { ok: false, refusal: opened.failure };
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
    dismiss_the_studio_warning_dialog: async (commandArguments) => {
      const dismissed = dismissTheStudioWarningDialogArgumentsFrom(commandArguments);
      if (!dismissed.ok) return { ok: false, refusal: dismissed.failure };
      return commandAnswerOfNothingFrom(await dismissTheStudioWarningDialog(sharedState, dismissed.value.kind));
    },
    set_open_tatolab_at_login: async (commandArguments) => {
      const enabledArguments = enabledArgumentsFrom("set_open_tatolab_at_login", commandArguments);
      if (!enabledArguments.ok) return { ok: false, refusal: enabledArguments.failure };
      return commandAnswerOfNothingFrom(await setOpenTatolabAtLogin(sharedState, enabledArguments.value.enabled));
    },
    show_menus_in_the_system_menu_bar: async (commandArguments, commandFromWindow) => {
      const menus = systemMenuBarMenusFrom(commandArguments);
      if (!menus.ok) return { ok: false, refusal: menus.failure };
      sharedState.systemMenuBar.keepTheMenusOfTheWindow(commandFromWindow.windowContentsId, menus.value);
      return { ok: true, value: null };
    },
  };
}
