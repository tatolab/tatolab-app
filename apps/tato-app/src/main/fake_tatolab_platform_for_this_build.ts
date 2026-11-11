// Tests' stand-in for a platform: a carried runtime whose starts the test sees and ends, and the
// `tatolab` command's link, each recording what it was asked. Never imported by shipped code.

import type { CommandLineToolLink, TatolabAppOpenAtLogin } from "../shared/tatolab_backend_contract.js";
import type { CarriedRuntime, RuntimeChildProcessExit, StartTheCarriedRuntimeAsAChildProcess } from "./platform/carried_runtime.js";
import type { TatolabCommandLineToolLink } from "./platform/command_line_tool_link_in_the_home_folder.js";
import type { TatolabAppOpenedAtLogin } from "./platform/tatolab_app_opened_at_login.js";
import type { TatolabAppUpdatePackaging } from "./platform/tatolab_app_update_packaging.js";
import type { TatolabCommandLineTool } from "./platform/tatolab_command_line_tool.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { TerminalOpenedInAFolder } from "./platform/terminal_opened_in_a_folder.js";
import type { SystemMediaAccess, SystemMediaAccessAnswer, SystemMediaDevice } from "./platform/system_media_access.js";
import type { ViewerImageFrameReading } from "./platform/viewer_image_frame_reading.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The carried runtime a fake platform names. */
export const FAKE_CARRIED_RUNTIME: CarriedRuntime = {
  runtimeExecutable: "/Applications/Tato Studio.app/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd",
  runtimeEnvironment: {},
};

/** One runtime the fake started: whether it was asked to stop, and how the test ends it. */
export interface FakeRuntimeChildProcessStarted {
  askedToStop: boolean;
  /** End it as `runtimeChildProcessExit` says, as the real runtime exiting would. */
  exit(runtimeChildProcessExit: RuntimeChildProcessExit): void;
}

/** Starts runtimes the test then ends, recording each start; refuses with `startRefusal` when the test sets one. */
export class FakeCarriedRuntimeStarts {
  readonly runtimesStarted: FakeRuntimeChildProcessStarted[] = [];
  startRefusal: string | null = null;

  /** What the controller starts runtimes through. */
  readonly startTheCarriedRuntime: StartTheCarriedRuntimeAsAChildProcess = (_carriedRuntime, whenItExits) => {
    if (this.startRefusal !== null) return failedWith(this.startRefusal);
    let exited = false;
    const runtimeStarted: FakeRuntimeChildProcessStarted = {
      askedToStop: false,
      exit: (runtimeChildProcessExit) => {
        if (exited) return;
        exited = true;
        whenItExits(runtimeChildProcessExit);
      },
    };
    this.runtimesStarted.push(runtimeStarted);
    return succeeded({
      askItToStop: () => {
        runtimeStarted.askedToStop = true;
      },
    });
  };

  /** End every runtime asked to stop, as `tatolabd` exits on SIGTERM. */
  exitEveryRuntimeAskedToStop(): void {
    for (const runtimeStarted of this.runtimesStarted) {
      if (runtimeStarted.askedToStop) runtimeStarted.exit({ exitStatus: 0, endingSignal: null, lastStandardErrorLine: null });
    }
  }

  /** The last runtime started; `undefined` before any. */
  lastRuntimeStarted(): FakeRuntimeChildProcessStarted | undefined {
    return this.runtimesStarted.at(-1);
  }
}

/** The command's link as the test sets it, linking when asked unless the test sets a refusal. */
export class FakeTatolabCommandLineToolLink implements TatolabCommandLineToolLink {
  linksAsked = 0;
  linkRefusal: string | null = null;

  constructor(public commandLineToolLink: CommandLineToolLink = { kind: "not_linked", path: "/Users/someone/.local/bin/tatolab" }) {}

  async observeTheLink(): Promise<CommandLineToolLink> {
    return this.commandLineToolLink;
  }

  async linkTheCommandLineTool(): Promise<Result<void, string>> {
    this.linksAsked += 1;
    if (this.linkRefusal !== null) return failedWith(this.linkRefusal);
    if (this.commandLineToolLink.kind === "not_offered") return failedWith(this.commandLineToolLink.reason);
    this.commandLineToolLink = { kind: "linked", path: this.commandLineToolLink.path };
    return succeeded(undefined);
  }
}

/** A terminal that records each folder it was opened in. */
export class FakeTerminalOpenedInAFolder implements TerminalOpenedInAFolder {
  readonly openedInFolders: string[] = [];
  answer: Result<void, string> = succeeded(undefined);

  async openTerminalIn(folder: string): Promise<Result<void, string>> {
    this.openedInFolders.push(folder);
    return this.answer;
  }
}

/** A desktop that opens the app at login once told to, recording each change it was asked for; it refuses with `refusal` when the test sets one. */
export class FakeTatolabAppOpenedAtLogin implements TatolabAppOpenedAtLogin {
  readonly setsAsked: boolean[] = [];
  openAtLogin: TatolabAppOpenAtLogin = { kind: "off" };
  refusal: string | null = null;

  async readOpenAtLogin(): Promise<TatolabAppOpenAtLogin> {
    return this.openAtLogin;
  }

  async setOpenAtLogin(openAtLogin: boolean): Promise<Result<void, string>> {
    this.setsAsked.push(openAtLogin);
    if (this.refusal !== null) return failedWith(this.refusal);
    this.openAtLogin = openAtLogin ? { kind: "on" } : { kind: "off" };
    return succeeded(undefined);
  }
}

/** The system's camera and microphone access, answering each device as the test scripts it (allowed unless told), recording each ask and each time the person is sent to allow one. */
export class FakeSystemMediaAccess implements SystemMediaAccess {
  readonly devicesAsked: SystemMediaDevice[] = [];
  readonly privacyPanesOpened: SystemMediaDevice[] = [];
  answerByDevice: Partial<Record<SystemMediaDevice, SystemMediaAccessAnswer["kind"]>> = {};

  async askAheadFor(device: SystemMediaDevice): Promise<SystemMediaAccessAnswer> {
    this.devicesAsked.push(device);
    const answerKind = this.answerByDevice[device] ?? "allowed";
    if (answerKind === "refused") return { kind: "refused", openWhereThePersonAllowsIt: () => this.privacyPanesOpened.push(device) };
    return { kind: answerKind };
  }
}

/** How the fakes' app updates unless a test says otherwise: as an unpackaged app, which offers none. */
const FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED: TatolabAppUpdatePackaging = { kind: "not_offered", reason: "this fake platform updates nothing" };

/** What a fake platform is built from, each part a fake unless the test gives its own. */
export interface FakeTatolabPlatformParts {
  localApiSocket: string;
  carriedRuntime?: CarriedRuntime | null;
  commandLineToolLink?: TatolabCommandLineToolLink;
  appUpdatePackaging?: TatolabAppUpdatePackaging;
  terminalOpenedInAFolder?: TerminalOpenedInAFolder;
  tatolabCommandLineTool?: TatolabCommandLineTool;
  tatolabAppOpenedAtLogin?: TatolabAppOpenedAtLogin;
  systemMediaAccess?: SystemMediaAccess;
  viewerImageFrameReading?: ViewerImageFrameReading;
}

/** A platform of these fakes, serving its local API at `localApiSocket` and carrying `FAKE_CARRIED_RUNTIME` unless told otherwise. */
export function fakeTatolabPlatformForThisBuild(parts: FakeTatolabPlatformParts): TatolabPlatformForThisBuild {
  return {
    carriedRuntime: parts.carriedRuntime === undefined ? FAKE_CARRIED_RUNTIME : parts.carriedRuntime,
    commandLineToolLink: parts.commandLineToolLink ?? new FakeTatolabCommandLineToolLink(),
    localApiSocket: parts.localApiSocket,
    appUpdatePackaging: parts.appUpdatePackaging ?? FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED,
    terminalOpenedInAFolder: parts.terminalOpenedInAFolder ?? new FakeTerminalOpenedInAFolder(),
    tatolabCommandLineTool: parts.tatolabCommandLineTool ?? { kind: "not_offered", reason: "this fake platform has no tatolab command" },
    tatolabAppOpenedAtLogin: parts.tatolabAppOpenedAtLogin ?? new FakeTatolabAppOpenedAtLogin(),
    systemMediaAccess: parts.systemMediaAccess ?? new FakeSystemMediaAccess(),
    viewerImageFrameReading: parts.viewerImageFrameReading ?? "display_import",
  };
}
