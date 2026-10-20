// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// A test's stand-in for Electron: it records what the app asked of the window, the tray and the
// Dock, builds a platform of fakes, and lets the test open the app again, quit it, click a tray
// item, or invoke a command as the window does.

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../../src/backend/tatolab_electron_bridge_contract.js";
import { FakeRuntimeAgentRegistration, FakeTatolabMachineSetup, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabElectronAppShell } from "./main.js";
import type { ApplicationMenu, MacosActivationPolicy, TatolabUninstall } from "./platform/mod.js";
import type { TatolabWindowCommandHandlers } from "./tatolab_commands.js";
import type { MainWindowCloseRequestAnswer, MainWindowSpecification } from "./tatolab_main_window.js";
import type { TrayMenuItemDescription, TrayMenuItemId } from "./tatolab_tray_menu.js";

/** One thing the app asked of the fake shell, in order. */
export type FakeShellRecord =
  | { asked: "create_main_window"; mainWindowSpecification: MainWindowSpecification }
  | { asked: "unminimize" | "show" | "focus" | "hide" }
  | { asked: "send_window_event"; eventChannel: string; eventPayload: unknown }
  | { asked: "set_activation_policy"; activationPolicy: MacosActivationPolicy }
  | { asked: "show_tray_menu"; trayMenuItems: readonly TrayMenuItemDescription[] }
  | { asked: "exit"; exitCode: number }
  | { asked: "set_application_menu"; applicationMenu: ApplicationMenu };

/** A fake Electron app shell for the lifecycle's tests. */
export class FakeTatolabElectronAppShell {
  readonly records: FakeShellRecord[] = [];
  readonly writtenLogLines: string[] = [];
  readonly tatolabAppLog = createTatolabAppLog("debug", (logLine) => this.writtenLogLines.push(logLine));
  holdsTheSingleInstanceLock = true;
  mainWindowCreationFailure: string | null = null;
  readonly runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  machineSetup = new FakeTatolabMachineSetup("complete", null);
  tatolabUninstall: TatolabUninstall | undefined = undefined;
  readonly appConfigDirectory = path.join(os.tmpdir(), `tl-app-config-${randomUUID()}`);
  private tatolabWindowCommandHandlers: TatolabWindowCommandHandlers | null = null;
  private readonly appOpenedAgainListeners: (() => void)[] = [];
  private readonly appQuittingListeners: (() => void)[] = [];
  private answerCloseRequest: (() => MainWindowCloseRequestAnswer) | null = null;
  private clickTrayMenuItem: ((trayMenuItemId: TrayMenuItemId) => void) | null = null;

  /** The shell `startTatolabApp` takes. */
  readonly tatolabElectronAppShell: TatolabElectronAppShell = {
    requestTheSingleInstanceLock: () => this.holdsTheSingleInstanceLock,
    whenReady: async () => {},
    onTheAppOpenedAgain: (listener) => this.appOpenedAgainListeners.push(listener),
    onTheAppQuitting: (listener) => this.appQuittingListeners.push(listener),
    exitTheApp: (exitCode) => this.records.push({ asked: "exit", exitCode }),
    setTheApplicationMenu: (applicationMenu) => this.records.push({ asked: "set_application_menu", applicationMenu }),
    buildTheTatolabPlatformForThisBuild: async () =>
      fakeTatolabPlatformForThisBuild(this.runtimeAgent, this.machineSetup, path.join(this.appConfigDirectory, "no-runtime.sock"), this.tatolabUninstall),
    answerTheWindowsCommands: (tatolabWindowCommandHandlers) => {
      this.tatolabWindowCommandHandlers = tatolabWindowCommandHandlers;
    },
    appConfigDirectory: this.appConfigDirectory,
    appVersion: "0.45.0",
    readMonotonicClockMs: () => 0,
    mainWindowHostFactory: {
      createMainWindowHost: (mainWindowSpecification, answerCloseRequest) => {
        if (this.mainWindowCreationFailure !== null) return failedWith(this.mainWindowCreationFailure);
        this.records.push({ asked: "create_main_window", mainWindowSpecification });
        this.answerCloseRequest = answerCloseRequest;
        return succeeded({
          unminimize: () => this.records.push({ asked: "unminimize" }),
          show: () => this.records.push({ asked: "show" }),
          focus: () => this.records.push({ asked: "focus" }),
          hide: () => this.records.push({ asked: "hide" }),
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

  openTheAppAgain(): void {
    for (const appOpenedAgainListener of this.appOpenedAgainListeners) appOpenedAgainListener();
  }

  beginQuitting(): void {
    for (const appQuittingListener of this.appQuittingListeners) appQuittingListener();
  }

  /** Close the window as its close button does, answering what the app chose. */
  requestTheWindowClose(): MainWindowCloseRequestAnswer | null {
    return this.answerCloseRequest?.() ?? null;
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
    return rm(this.appConfigDirectory, { recursive: true, force: true });
  }
}
