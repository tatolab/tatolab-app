// A test's stand-in for Electron: it records what the app asked of the window, the tray and the
// Dock and the notifications it showed, builds a platform of fakes over the update feed the test sets, and lets the test open the
// app again, launch a second copy, quit it, click a tray item or a notification, or invoke a command as the window does.

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StreamProjectFolderChosenFor, WorkspaceFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import {
  type FakeCarriedRuntimeInstall,
  FakeRuntimeAgentRegistration,
  FakeTatolabCommandLineToolLinks,
  fakeTatolabPlatformForThisBuild,
} from "./fake_tatolab_platform_for_this_build.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { failedWith, succeeded } from "./result.js";
import { RUNTIME_LOOPBACK_HTTP_ORIGIN } from "./runtime_loopback_watch_page.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabElectronAppShell } from "./main.js";
import type { ApplicationMenu } from "./platform/application_menu.js";
import type { MacosActivationPolicy } from "./platform/main_window_chrome.js";
import type { TatolabUninstall } from "./platform/tatolab_uninstall.js";
import type { TatolabWindowCommandHandlers } from "./tatolab_commands.js";
import type { MainWindowCloseRequestAnswer, MainWindowSpecification } from "./tatolab_main_window.js";
import type { TrayMenuItemDescription, TrayMenuItemId } from "./tatolab_tray_menu.js";
import type { TatolabAppUpdateFeedForThisBuild } from "./tatolab_app_updater.js";
import type { TatolabAppUpdatePackaging } from "./platform/tatolab_app_update_packaging.js";
import {
  tatolabAppCopyHandedOverOnTheSingleInstanceLock,
  tatolabAppCopyOnTheSingleInstanceLock,
  type TatolabAppCopy,
} from "./tatolab_app_copy_handoff.js";

/** One thing the app asked of the fake shell, in order. */
export type FakeShellRecord =
  | { asked: "create_main_window"; mainWindowSpecification: MainWindowSpecification }
  | { asked: "unminimize" | "show" | "focus" | "hide" }
  | { asked: "send_window_event"; eventChannel: string; eventPayload: unknown }
  | { asked: "set_activation_policy"; activationPolicy: MacosActivationPolicy }
  | { asked: "show_tray_menu"; trayMenuItems: readonly TrayMenuItemDescription[] }
  | { asked: "exit"; exitCode: number }
  | { asked: "open_another_copy_once_this_one_exits"; executable: string }
  | { asked: "notify"; title: string; body: string }
  | { asked: "repeat_every"; intervalMs: number }
  | { asked: "set_application_menu"; applicationMenu: ApplicationMenu }
  | { asked: "open_folder_in_the_file_manager"; folder: string }
  | { asked: "ask_for_a_stream_project_folder"; chosenFor: StreamProjectFolderChosenFor; defaultFolder: string }
  | { asked: "ask_for_a_workspace_folder"; chosenFor: WorkspaceFolderChosenFor; defaultFolder: string };

/** A fake Electron app shell for the lifecycle's tests. */
export class FakeTatolabElectronAppShell {
  readonly records: FakeShellRecord[] = [];
  readonly writtenLogLines: string[] = [];
  readonly tatolabAppLog = createTatolabAppLog("debug", (logLine) => this.writtenLogLines.push(logLine));
  holdsTheSingleInstanceLock = true;
  /** The copy this app reads itself as. */
  thisCopyOfTatolab: TatolabAppCopy = {
    executableThatOpensTheCopy: "/Applications/Tatolab.app/Contents/MacOS/Tatolab",
    appVersion: "0.45.0",
    appBuild: { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "release", built_with_uncommitted_changes: false },
    carriedStreamlibCommit: "5e1f0c2a9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f",
  };
  /** The additional data each single-instance lock request handed over, as Electron would carry it. */
  readonly singleInstanceLockAdditionalData: unknown[] = [];
  mainWindowCreationFailure: string | null = null;
  /** Whether the fake window is on screen: shown and not hidden since. */
  mainWindowShowing = false;
  readonly runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  commandLineToolLinks = new FakeTatolabCommandLineToolLinks("/Users/someone/.local/bin/tatolab");
  tatolabUninstall: TatolabUninstall | undefined = undefined;
  /** The runtime this build carries for the installer, `null` for a build that carries none. */
  carriedRuntimeInstall: FakeCarriedRuntimeInstall | null = null;
  appUpdatePackaging: TatolabAppUpdatePackaging = { kind: "not_offered", reason: "this fake platform updates nothing" };
  appUpdateFeedForThisBuild: TatolabAppUpdateFeedForThisBuild = { kind: "not_offered", reason: "this fake platform updates nothing" };
  /** The folder the fake dialog answers with; `null` reads as the person cancelling it. */
  streamProjectFolderTheDialogAnswers: string | null = null;
  /** The folder the workspace dialog answers, or `null` for the person cancelling. */
  workspaceFolderTheDialogAnswers: string | null = null;
  readonly systemNotifications = new FakeSystemNotifications((notificationShown) => this.records.push({ asked: "notify", ...notificationShown }));
  readonly appConfigDirectory = path.join(os.tmpdir(), `tl-app-config-${randomUUID()}`);
  private tatolabWindowCommandHandlers: TatolabWindowCommandHandlers | null = null;
  private readonly appOpenedAgainListeners: ((openedCopy: TatolabAppCopy | null) => void)[] = [];
  private readonly appQuittingListeners: (() => void)[] = [];
  private answerCloseRequest: (() => MainWindowCloseRequestAnswer) | null = null;
  private clickTrayMenuItem: ((trayMenuItemId: TrayMenuItemId) => void) | null = null;

  /** The shell `startTatolabApp` takes. */
  readonly tatolabElectronAppShell: TatolabElectronAppShell = {
    readThisCopyOfTatolab: async () => this.thisCopyOfTatolab,
    requestTheSingleInstanceLock: (thisCopy) => {
      this.singleInstanceLockAdditionalData.push(structuredClone(tatolabAppCopyOnTheSingleInstanceLock(thisCopy)));
      return this.holdsTheSingleInstanceLock;
    },
    whenReady: async () => {},
    onTheAppOpenedAgain: (listener) => this.appOpenedAgainListeners.push(listener),
    onTheAppQuitting: (listener) => this.appQuittingListeners.push(listener),
    exitTheApp: (exitCode) => this.records.push({ asked: "exit", exitCode }),
    openAnotherCopyOnceThisOneExits: (executable) => this.records.push({ asked: "open_another_copy_once_this_one_exits", executable }),
    setTheApplicationMenu: (applicationMenu) => this.records.push({ asked: "set_application_menu", applicationMenu }),
    buildTheTatolabPlatformForThisBuild: async () =>
      fakeTatolabPlatformForThisBuild(
        this.runtimeAgent,
        this.commandLineToolLinks,
        path.join(this.appConfigDirectory, "no-runtime.sock"),
        this.tatolabUninstall,
        this.appUpdatePackaging,
        this.carriedRuntimeInstall,
      ),
    answerTheWindowsCommands: (tatolabWindowCommandHandlers) => {
      this.tatolabWindowCommandHandlers = tatolabWindowCommandHandlers;
    },
    openAFolderInTheFileManager: async (folder) => {
      this.records.push({ asked: "open_folder_in_the_file_manager", folder });
      return succeeded(undefined);
    },
    askThePersonForAStreamProjectFolder: async (chosenFor, defaultFolder) => {
      this.records.push({ asked: "ask_for_a_stream_project_folder", chosenFor, defaultFolder });
      return succeeded(this.streamProjectFolderTheDialogAnswers);
    },
    askThePersonForAWorkspaceFolder: async (chosenFor, defaultFolder) => {
      this.records.push({ asked: "ask_for_a_workspace_folder", chosenFor, defaultFolder });
      return succeeded(this.workspaceFolderTheDialogAnswers);
    },
    watchFolderEntries: () => null,
    homeDirectory: path.join(this.appConfigDirectory, "home"),
    createTheAppUpdateFeed: () => this.appUpdateFeedForThisBuild,
    systemNotifications: this.systemNotifications,
    repeatingTimer: (intervalMs) => this.records.push({ asked: "repeat_every", intervalMs }),
    appConfigDirectory: this.appConfigDirectory,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readMonotonicClockMs: () => 0,
    mainWindowHostFactory: {
      createMainWindowHost: (mainWindowSpecification, answerCloseRequest) => {
        if (this.mainWindowCreationFailure !== null) return failedWith(this.mainWindowCreationFailure);
        this.records.push({ asked: "create_main_window", mainWindowSpecification });
        this.answerCloseRequest = answerCloseRequest;
        return succeeded({
          unminimize: () => this.records.push({ asked: "unminimize" }),
          show: () => {
            this.mainWindowShowing = true;
            this.records.push({ asked: "show" });
          },
          focus: () => this.records.push({ asked: "focus" }),
          hide: () => {
            this.mainWindowShowing = false;
            this.records.push({ asked: "hide" });
          },
          isShowing: () => this.mainWindowShowing,
          sendTheWindowAnEvent: (eventChannel, eventPayload) => this.records.push({ asked: "send_window_event", eventChannel, eventPayload }),
        });
      },
    },
    trayIconHostFactory: {
      createTrayIcon: (_trayIconImage, _tooltip, onMenuItemClicked) => {
        this.clickTrayMenuItem = onMenuItemClicked;
        return { showMenu: (trayMenuItems) => this.records.push({ asked: "show_tray_menu", trayMenuItems }) };
      },
    },
    dockIconHost: {
      setActivationPolicy: (activationPolicy) => this.records.push({ asked: "set_activation_policy", activationPolicy }),
    },
  };

  /** What the app asked for, as just the `asked` names. */
  askedFor(): string[] {
    return this.records.map((fakeShellRecord) => fakeShellRecord.asked);
  }

  forgetTheRecords(): void {
    this.records.length = 0;
  }

  /** Open the app again from the Dock or Finder, which hands over no copy. */
  openTheAppAgain(): void {
    for (const appOpenedAgainListener of this.appOpenedAgainListeners) appOpenedAgainListener(null);
  }

  /** Launch a second copy, which hands the running app `additionalDataOnTheLock` as Electron's `second-instance` does. */
  launchASecondCopy(additionalDataOnTheLock: unknown): void {
    const openedCopy = tatolabAppCopyHandedOverOnTheSingleInstanceLock(structuredClone(additionalDataOnTheLock));
    for (const appOpenedAgainListener of this.appOpenedAgainListeners) appOpenedAgainListener(openedCopy);
  }

  beginQuitting(): void {
    for (const appQuittingListener of this.appQuittingListeners) appQuittingListener();
  }

  /** Close the window as its close button does, answering what the app chose. */
  requestTheWindowClose(): MainWindowCloseRequestAnswer | null {
    return this.answerCloseRequest?.() ?? null;
  }

  clickTheNotification(): void {
    this.systemNotifications.clickTheLastNotification();
  }

  clickTheTrayMenuItem(trayMenuItemId: TrayMenuItemId): void {
    this.clickTrayMenuItem?.(trayMenuItemId);
  }

  /** Invoke `commandName` as the window does; refused when the app answers no commands. */
  invokeTheCommand<CommandName extends TatolabCommandName>(commandName: CommandName, commandArguments?: unknown): Promise<TatolabCommandAnswerTo<CommandName>> {
    if (this.tatolabWindowCommandHandlers === null) return Promise.resolve({ ok: false, refusal: "the app answers no commands" });
    return this.tatolabWindowCommandHandlers[commandName](commandArguments);
  }

  removeTheAppConfigDirectory(): Promise<void> {
    // The launch's background work may still be writing into it, which `maxRetries` waits out.
    return rm(this.appConfigDirectory, { recursive: true, force: true, maxRetries: 5 });
  }
}
