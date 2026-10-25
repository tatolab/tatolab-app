// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Tests' stand-in for a platform: a service manager whose agent status the test sets and the
// `tatolab` command's links, each recording what it was asked. Never imported by shipped code.

import type {
  CommandLineToolUsrLocalBinLink,
  RuntimeAgentRegistration as RuntimeAgentRegistrationStatus,
  TatolabAppOpenAtLogin,
} from "../../src/backend/tatolab_backend_contract.js";
import type { TatolabAppOpenedAtLogin } from "./platform/tatolab_app_opened_at_login.js";
import type { TatolabAppUpdatePackaging, TatolabCommandLineTool, TatolabPlatformForThisBuild, TatolabUninstall, TerminalOpenedInAFolder } from "./platform/mod.js";
import type { BundledRuntimeRestart, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import type { CommandLineToolLinkRefusal, CommandLineToolLinksObservation, TatolabCommandLineToolLinks } from "./platform/tatolab_command_line_tool_links.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** What the fake service manager was asked, in order. */
export type FakeRuntimeAgentCall =
  | "register"
  | "start_if_not_running"
  | "restart_the_agents_runtime"
  | "restart_the_bundled_runtime"
  | "unregister"
  | "open_login_items_settings";

/** A service manager whose registration the test sets; registering enables the agent and unregistering removes it. Its restarts answer `restartingTheAgentsRuntime` and `restartingTheBundledRuntime`. */
export class FakeRuntimeAgentRegistration implements RuntimeAgentRegistration, BundledRuntimeRestart {
  readonly calls: FakeRuntimeAgentCall[] = [];
  restartingTheBundledRuntime: Result<void, string> = succeeded(undefined);
  restartingTheAgentsRuntime: Result<void, RuntimeAgentStartFailure> = succeeded(undefined);
  /** The service manager's words for having given up on the runtime, until registering the agent clears them; `null` while it has not. */
  whyTheServiceManagerGaveUp: string | null = null;
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

  async whyTheServiceManagerGaveUpOnTheRuntime(): Promise<string | null> {
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

  async restartTheBundledRuntime(): Promise<Result<void, string>> {
    this.calls.push("restart_the_bundled_runtime");
    return this.restartingTheBundledRuntime;
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

/** The command's links as the test sets them, linking in the home folder when asked and answering the `/usr/local/bin` link as the test says, recording each request. */
export class FakeTatolabCommandLineToolLinks implements TatolabCommandLineToolLinks {
  readonly linksAsked: ("home_folder" | "usr_local_bin")[] = [];
  homeFolderLinkedAt: string | null = null;
  usrLocalBinLink: CommandLineToolUsrLocalBinLink = { kind: "not_linked" };
  linkingInUsrLocalBin: Result<void, CommandLineToolLinkRefusal> = succeeded(undefined);

  constructor(private readonly homeFolderLink: string | null) {}

  async observeCommandLineToolLinks(): Promise<CommandLineToolLinksObservation> {
    return { homeFolderLinkedAt: this.homeFolderLinkedAt, usrLocalBinLink: this.usrLocalBinLink };
  }

  async linkTheCommandLineToolInTheHomeFolder(): Promise<Result<void, CommandLineToolLinkRefusal>> {
    this.linksAsked.push("home_folder");
    if (this.homeFolderLink === null) return failedWith({ kind: "not_offered", reason: "this fake platform links nothing" });
    this.homeFolderLinkedAt = this.homeFolderLink;
    return succeeded(undefined);
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

/** A platform of these fakes, serving its local API at `localApiSocket`, whose bundle carries the runtime `runtimeAgent` restarts unless `bundledRuntimeRestart` says it carries none. */
export function fakeTatolabPlatformForThisBuild(
  runtimeAgent: FakeRuntimeAgentRegistration,
  commandLineToolLinks: FakeTatolabCommandLineToolLinks,
  localApiSocket: string,
  tatolabUninstall: TatolabUninstall = FAKE_TATOLAB_UNINSTALL_REFUSING,
  appUpdatePackaging: TatolabAppUpdatePackaging = FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED,
  bundledRuntimeRestart: BundledRuntimeRestart | null = runtimeAgent,
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
    bundledRuntimeRestart,
    terminalOpenedInAFolder,
    tatolabCommandLineTool,
    tatolabAppOpenedAtLogin,
  };
}
