// Tests' stand-in for a platform: a service manager whose agent status the test sets, the
// installer of the runtime the app carries, and the `tatolab` command's links, each recording what
// it was asked. Never imported by shipped code.

import type {
  CommandLineToolUsrLocalBinLink,
  RuntimeAgentRegistration as RuntimeAgentRegistrationStatus,
  TatolabAppOpenAtLogin,
} from "../shared/tatolab_backend_contract.js";
import type { TatolabAppOpenedAtLogin } from "./platform/tatolab_app_opened_at_login.js";
import type { TatolabAppUpdatePackaging } from "./platform/tatolab_app_update_packaging.js";
import type { TatolabCommandLineTool } from "./platform/tatolab_command_line_tool.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { TatolabUninstall } from "./platform/tatolab_uninstall.js";
import type { TerminalOpenedInAFolder } from "./platform/terminal_opened_in_a_folder.js";
import type { CarriedAndInstalledRuntimeBuilds, CarriedRuntimeInstall } from "./platform/carried_runtime_install.js";
import type { RuntimeAgentGiveUp, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import type { CommandLineToolLinkRefusal, CommandLineToolLinksObservation, TatolabCommandLineToolLinks } from "./platform/tatolab_command_line_tool_links.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** What the fake service manager was asked, in order. */
export type FakeRuntimeAgentCall =
  | "register"
  | "start_if_not_running"
  | "restart_the_agents_runtime"
  | "unregister"
  | "open_login_items_settings";

/** A service manager whose registration the test sets; registering enables the agent and unregistering removes it. Its restart answers `restartingTheAgentsRuntime`. */
export class FakeRuntimeAgentRegistration implements RuntimeAgentRegistration {
  readonly calls: FakeRuntimeAgentCall[] = [];
  restartingTheAgentsRuntime: Result<void, RuntimeAgentStartFailure> = succeeded(undefined);
  /** The service manager having given up on the runtime, until registering the agent clears it; `null` while it has not. */
  whyTheServiceManagerGaveUp: RuntimeAgentGiveUp | null = null;
  /** Whether the service manager gives up again however often the agent is registered, as a code-signing refusal does. */
  givesUpWhateverTheRegistration = false;

  constructor(public status: RuntimeAgentRegistrationStatus) {}

  async registrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    return this.status;
  }

  async registerRuntimeAgent(): Promise<Result<void, string>> {
    this.calls.push("register");
    this.status = "enabled";
    if (!this.givesUpWhateverTheRegistration) this.whyTheServiceManagerGaveUp = null;
    return succeeded(undefined);
  }

  async whyTheServiceManagerGaveUpOnTheRuntime(): Promise<RuntimeAgentGiveUp | null> {
    return this.whyTheServiceManagerGaveUp;
  }

  async startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    this.calls.push("start_if_not_running");
    return succeeded(undefined);
  }

  async restartRuntimeAgent(): Promise<Result<void, RuntimeAgentStartFailure>> {
    this.calls.push("restart_the_agents_runtime");
    return this.restartingTheAgentsRuntime;
  }

  async unregisterRuntimeAgent(): Promise<Result<void, string>> {
    this.calls.push("unregister");
    this.status = "not_registered";
    return succeeded(undefined);
  }

  async openLoginItemsSettings(): Promise<Result<void, string>> {
    this.calls.push("open_login_items_settings");
    return succeeded(undefined);
  }
}

/**
 * streamlib's installer as a fake: it writes `installerLines`, then answers `installAnswer`; one that succeeds makes the
 * carried build the installed one and, as the real installer does, loads and starts the agent of `runtimeAgent`. While
 * `installerHeldUntil` is set it waits for it after its lines.
 */
export class FakeCarriedRuntimeInstall implements CarriedRuntimeInstall {
  readonly installedBuilds: string[] = [];
  installerLines: readonly string[] = ["Stopping the runtime", "Starting Tatolab"];
  installAnswer: Result<void, string> = succeeded(undefined);
  carriedBuildAnswer: Result<string, string>;
  installerHeldUntil: Promise<void> | null = null;

  constructor(
    carriedRuntimeBuild: string,
    public installedRuntimeBuild: string | null,
    private readonly runtimeAgent: FakeRuntimeAgentRegistration,
  ) {
    this.carriedBuildAnswer = succeeded(carriedRuntimeBuild);
  }

  async carriedAndInstalledRuntimeBuilds(): Promise<Result<CarriedAndInstalledRuntimeBuilds, string>> {
    if (!this.carriedBuildAnswer.ok) return this.carriedBuildAnswer;
    return succeeded({ carriedRuntimeBuild: this.carriedBuildAnswer.value, installedRuntimeBuild: this.installedRuntimeBuild });
  }

  installedRuntimeFolderOf(installedRuntimeBuild: string): string {
    return `/Users/someone/Library/Application Support/com.tatolab.runtime/${installedRuntimeBuild}`;
  }

  async installTheCarriedRuntime(onInstallerLine: (installerLine: string) => void): Promise<Result<void, string>> {
    for (const installerLine of this.installerLines) onInstallerLine(installerLine);
    if (this.installerHeldUntil !== null) await this.installerHeldUntil;
    this.runtimeAgent.status = "enabled";
    if (!this.installAnswer.ok || !this.carriedBuildAnswer.ok) return this.installAnswer;
    this.installedBuilds.push(this.carriedBuildAnswer.value);
    this.installedRuntimeBuild = this.carriedBuildAnswer.value;
    return this.installAnswer;
  }
}

/** The command's links as the test sets them, the installer's home-folder link at `homeFolderLinkedAt`, answering the `/usr/local/bin` link as the test says and recording each request. */
export class FakeTatolabCommandLineToolLinks implements TatolabCommandLineToolLinks {
  readonly linksAsked: "usr_local_bin"[] = [];
  usrLocalBinLink: CommandLineToolUsrLocalBinLink = { kind: "not_linked" };
  linkingInUsrLocalBin: Result<void, CommandLineToolLinkRefusal> = succeeded(undefined);

  constructor(public homeFolderLinkedAt: string | null) {}

  async observeCommandLineToolLinks(): Promise<CommandLineToolLinksObservation> {
    return { homeFolderLinkedAt: this.homeFolderLinkedAt, usrLocalBinLink: this.usrLocalBinLink };
  }

  async linkTheCommandLineToolInUsrLocalBin(): Promise<Result<void, CommandLineToolLinkRefusal>> {
    this.linksAsked.push("usr_local_bin");
    if (this.linkingInUsrLocalBin.ok) this.usrLocalBinLink = { kind: "linked", path: "/usr/local/bin/tatolab" };
    return this.linkingInUsrLocalBin;
  }
}

/** An uninstall that refuses, for a fake platform no test uninstalls. */
const FAKE_TATOLAB_UNINSTALL_REFUSING: TatolabUninstall = {
  uninstallTatolab: async () => failedWith("this fake platform uninstalls nothing"),
};

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

/** How the fakes' app updates unless a test says otherwise: as an unpackaged app, which offers none. */
const FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED: TatolabAppUpdatePackaging = { kind: "not_offered", reason: "this fake platform updates nothing" };

/** A platform of these fakes, serving its local API at `localApiSocket`, carrying a runtime to install only when `carriedRuntimeInstall` is given. */
export function fakeTatolabPlatformForThisBuild(
  runtimeAgent: FakeRuntimeAgentRegistration,
  commandLineToolLinks: FakeTatolabCommandLineToolLinks,
  localApiSocket: string,
  tatolabUninstall: TatolabUninstall = FAKE_TATOLAB_UNINSTALL_REFUSING,
  appUpdatePackaging: TatolabAppUpdatePackaging = FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED,
  carriedRuntimeInstall: CarriedRuntimeInstall | null = null,
  terminalOpenedInAFolder: TerminalOpenedInAFolder = new FakeTerminalOpenedInAFolder(),
  tatolabCommandLineTool: TatolabCommandLineTool = { kind: "not_offered", reason: "this fake platform has no tatolab command" },
  tatolabAppOpenedAtLogin: TatolabAppOpenedAtLogin = new FakeTatolabAppOpenedAtLogin(),
): TatolabPlatformForThisBuild {
  return {
    runtimeAgent,
    commandLineToolLinks,
    localApiSocket,
    tatolabUninstall,
    appUpdatePackaging,
    carriedRuntimeInstall,
    terminalOpenedInAFolder,
    tatolabCommandLineTool,
    tatolabAppOpenedAtLogin,
  };
}
