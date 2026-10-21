// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Tests' stand-in for a platform: a service manager whose agent status the test sets and a machine
// setup the test completes or leaves missing, each recording what it was asked. Never imported by
// shipped code.

import type { MachineSetupState, RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../src/backend/tatolab_backend_contract.js";
import type { TatolabAppUpdatePackaging, TatolabPlatformForThisBuild, TatolabUninstall } from "./platform/mod.js";
import type { BundledRuntimeRestart, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import type {
  MachineSetupAdministratorPromptOutcome,
  MachineSetupObservation,
  MachineSetupTrigger,
  TatolabMachineSetup,
} from "./platform/tatolab_machine_setup.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** What the fake service manager was asked, in order. */
export type FakeRuntimeAgentCall = "register" | "start_if_not_running" | "restart_the_bundled_runtime" | "unregister" | "open_login_items_settings";

/** A service manager whose registration the test sets; registering enables the agent and unregistering removes it. Its restart answers `restartingTheBundledRuntime`. */
export class FakeRuntimeAgentRegistration implements RuntimeAgentRegistration, BundledRuntimeRestart {
  readonly calls: FakeRuntimeAgentCall[] = [];
  restartingTheBundledRuntime: Result<void, string> = succeeded(undefined);

  constructor(public status: RuntimeAgentRegistrationStatus) {}

  async registrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    return this.status;
  }

  async registerRuntimeAgent(): Promise<Result<void, string>> {
    this.calls.push("register");
    this.status = "enabled";
    return succeeded(undefined);
  }

  async startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    this.calls.push("start_if_not_running");
    return succeeded(undefined);
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

/** A machine setup in the state the test sets, recording each trigger it was asked to set up for. */
export class FakeTatolabMachineSetup implements TatolabMachineSetup {
  readonly setUpTriggers: MachineSetupTrigger[] = [];

  constructor(
    public machineSetupState: MachineSetupState,
    private readonly setUpTatolabRefusalOnThisPlatform: string | null,
  ) {}

  async observeMachineSetup(): Promise<MachineSetupObservation> {
    return {
      machineSetupState: this.machineSetupState,
      commandLineToolLinkedAt: this.machineSetupState === "complete" ? "/usr/local/bin/tatolab" : null,
    };
  }

  async setUpTheMachine(trigger: MachineSetupTrigger): Promise<MachineSetupAdministratorPromptOutcome> {
    this.setUpTriggers.push(trigger);
    if (trigger === "reconciling_the_switch" || this.machineSetupState === "complete") return "no_administrator_prompt_shown";
    this.machineSetupState = "complete";
    return "administrator_prompt_shown";
  }

  setUpTatolabRefusal(): string | null {
    return this.setUpTatolabRefusalOnThisPlatform;
  }
}

/** An uninstall that refuses, for a fake platform no test uninstalls. */
const FAKE_TATOLAB_UNINSTALL_REFUSING: TatolabUninstall = {
  uninstallTatolab: async () => failedWith("this fake platform uninstalls nothing"),
};

/** How the fakes' app updates unless a test says otherwise: as an unpackaged app, which offers none. */
const FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED: TatolabAppUpdatePackaging = { kind: "not_offered", reason: "this fake platform updates nothing" };

/** A platform of these fakes, serving its local API at `localApiSocket`, whose bundle carries the runtime `runtimeAgent` restarts unless `bundledRuntimeRestart` says it carries none. */
export function fakeTatolabPlatformForThisBuild(
  runtimeAgent: FakeRuntimeAgentRegistration,
  machineSetup: FakeTatolabMachineSetup,
  localApiSocket: string,
  tatolabUninstall: TatolabUninstall = FAKE_TATOLAB_UNINSTALL_REFUSING,
  appUpdatePackaging: TatolabAppUpdatePackaging = FAKE_APP_UPDATE_PACKAGING_NOT_OFFERED,
  bundledRuntimeRestart: BundledRuntimeRestart | null = runtimeAgent,
): TatolabPlatformForThisBuild {
  return { runtimeAgent, machineSetup, localApiSocket, tatolabUninstall, appUpdatePackaging, bundledRuntimeRestart };
}
