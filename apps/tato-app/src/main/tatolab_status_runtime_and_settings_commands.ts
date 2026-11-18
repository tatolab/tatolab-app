import { Effect, Schema, type ManagedRuntime } from "effect";
import type { TatolabAppUpdateAnnouncementAnswer, TatolabAppUpdateAnnouncementKind } from "../shared/tatolab_backend_contract.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { openTheRuntimesLogFolder } from "./runtime_log_folder_opening.js";
import { describeRuntime } from "./runtime_operations.js";
import { CarriedTools, StatusRounds, StudioSettings, thenAStatusRound, type StudioServices } from "./studio_runtime.js";
import { runTatolabAppUpdateWorkInTheBackground, type TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { systemMenuBarMenusFrom } from "./system_menu_bar_of_the_focused_window.js";
import { oneTextArgumentFrom, type TatolabWindowCommandHandlers } from "./tatolab_command_answers.js";
import { CommandRefused, windowCommand } from "./window_command.js";

/** How long `get_tatolab_status` waits for the poller's first round when the window asks first. */
const FIRST_STATUS_ROUND_WAIT_LIMIT_MS = 15_000;

/** The arguments of the commands that turn a setting on or off. */
const EnabledArguments = Schema.Struct({ enabled: Schema.Boolean });

/** The arguments of `dismiss_the_studio_warning_dialog`: the warning whose dialog was shown. */
const DismissTheStudioWarningDialogArguments = Schema.Struct({ kind: Schema.Literal("viewer_frames_copied_on_x11") });

/** `get_tatolab_status`: the status as of the poller's last round, waiting for the first when the window asks before it. */
const tatolabStatusAsOfTheLastRound = StatusRounds.use((statusRounds) => statusRounds.lastStatusWaitingUpTo(FIRST_STATUS_ROUND_WAIT_LIMIT_MS)).pipe(
  Effect.flatMap((status) => (status === null ? Effect.fail(new CommandRefused({ words: "Tatolab has not observed the runtime yet" })) : Effect.succeed(status))),
);

/** `answer_the_app_update_announcement`'s arguments as the window sends them, or why they are not. */
function appUpdateAnnouncementAnswerArgumentsFrom(
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
export function statusRuntimeAndSettingsCommandHandlersOf(
  sharedState: TatolabAppSharedState,
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
  quitTheApp: () => void,
): Pick<TatolabWindowCommandHandlers, StatusRuntimeAndSettingsCommandName> {
  return {
    get_tatolab_status: windowCommand(studioRuntime, "get_tatolab_status", Schema.Undefined, () => tatolabStatusAsOfTheLastRound),
    link_command_line_tool: windowCommand(studioRuntime, "link_command_line_tool", Schema.Undefined, () =>
      thenAStatusRound(CarriedTools.use((carriedTools) => carriedTools.linkTheCommandLineTool)).pipe(Effect.as(null)),
    ),
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
    describe_runtime: windowCommand(studioRuntime, "describe_runtime", Schema.Undefined, () => describeRuntime()),
    restart_runtime: windowCommand(studioRuntime, "restart_runtime", Schema.Undefined, () =>
      thenAStatusRound(CarriedTools.use((carriedTools) => carriedTools.restartTheRuntime)).pipe(Effect.as(null)),
    ),
    open_runtime_log_folder: windowCommand(studioRuntime, "open_runtime_log_folder", Schema.Undefined, () => openTheRuntimesLogFolder.pipe(Effect.as(null))),
    set_stream_failure_notifications: windowCommand(studioRuntime, "set_stream_failure_notifications", EnabledArguments, ({ enabled }) =>
      thenAStatusRound(StudioSettings.use((studioSettings) => studioSettings.setStreamFailureNotifications(enabled))).pipe(Effect.as(null)),
    ),
    set_developer_mode: windowCommand(studioRuntime, "set_developer_mode", EnabledArguments, ({ enabled }) =>
      thenAStatusRound(StudioSettings.use((studioSettings) => studioSettings.setDeveloperMode(enabled))).pipe(Effect.as(null)),
    ),
    dismiss_the_studio_warning_dialog: windowCommand(studioRuntime, "dismiss_the_studio_warning_dialog", DismissTheStudioWarningDialogArguments, ({ kind }) =>
      thenAStatusRound(StudioSettings.use((studioSettings) => studioSettings.rememberTheWarningDialogWasShown(kind))).pipe(Effect.as(null)),
    ),
    set_open_tatolab_at_login: windowCommand(studioRuntime, "set_open_tatolab_at_login", EnabledArguments, ({ enabled }) =>
      thenAStatusRound(StudioSettings.use((studioSettings) => studioSettings.setOpenTatolabAtLogin(enabled))).pipe(Effect.as(null)),
    ),
    show_menus_in_the_system_menu_bar: async (commandArguments, commandFromWindow) => {
      const menus = systemMenuBarMenusFrom(commandArguments);
      if (!menus.ok) return { ok: false, refusal: menus.failure };
      sharedState.systemMenuBar.keepTheMenusOfTheWindow(commandFromWindow.windowContentsId, menus.value);
      return { ok: true, value: null };
    },
  };
}
