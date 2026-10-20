// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The runtime's launch agent registered through Service Management's `SMAppService`, from the
// plist the bundle carries in `Contents/Library/LaunchAgents/`.

import { failedWith, succeeded, type Result } from "../../result.js";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../../../src/backend/tatolab_backend_contract.js";
import type { RuntimeAgentRegistration, RuntimeAgentStartFailure } from "../runtime_agent_registration.js";
import { describeHowTheProgramEnded, programSucceeded, runProgramToCompletion, type ProgramCompletion } from "./run_program_to_completion.js";
import type { ServiceManagementAgentServices, ServiceManagementAgentServiceStatus } from "./service_management_agent_services.js";

/** The agent plist's file name inside the bundle's `Contents/Library/LaunchAgents/`. */
export const RUNTIME_LAUNCH_AGENT_PLIST_NAME = "com.tatolab.tatolabd.plist";

/** The agent plist's `Label`, which names the job in the user's launchd domain. */
export const RUNTIME_LAUNCH_AGENT_LABEL = "com.tatolab.tatolabd";

/** launchctl's exit status when its domain holds no job for the service ("Could not find service"). */
const LAUNCHCTL_NO_SUCH_SERVICE_EXIT_STATUS = 113;

const LAUNCHCTL_PATH = "/bin/launchctl";

/** Runs `launchctl` with its arguments to completion; a test's fake stands in for it. */
export type LaunchctlRunner = (launchctlArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;

/** `launchctl` at its system path. */
export const LAUNCHCTL_AT_ITS_SYSTEM_PATH: LaunchctlRunner = (launchctlArguments) =>
  runProgramToCompletion(LAUNCHCTL_PATH, launchctlArguments);

/** The contract's spelling of an `SMAppService` status; a status Service Management does not answer reads as not found. */
export function runtimeAgentRegistrationStatusFrom(
  serviceManagementStatus: ServiceManagementAgentServiceStatus | null,
): RuntimeAgentRegistrationStatus {
  switch (serviceManagementStatus) {
    case "enabled":
      return "enabled";
    case "requires-approval":
      return "requires_approval";
    case "not-registered":
      return "not_registered";
    case "not-found":
    case null:
      return "not_found";
  }
}

/** The runtime's launch agent as `SMAppService` sees it. */
export class ServiceManagementRuntimeLaunchAgent implements RuntimeAgentRegistration {
  private constructor(
    private readonly agentPlistName: string,
    private readonly uid: number,
    private readonly serviceManagementAgentServices: ServiceManagementAgentServices,
    private readonly launchctlRunner: LaunchctlRunner,
  ) {}

  /** The agent the bundle's `RUNTIME_LAUNCH_AGENT_PLIST_NAME` describes, in the launchd domain of the user with `uid`. */
  static forTheBundledRuntime(
    uid: number,
    serviceManagementAgentServices: ServiceManagementAgentServices,
    launchctlRunner: LaunchctlRunner,
  ): ServiceManagementRuntimeLaunchAgent {
    return new ServiceManagementRuntimeLaunchAgent(RUNTIME_LAUNCH_AGENT_PLIST_NAME, uid, serviceManagementAgentServices, launchctlRunner);
  }

  async registrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    return runtimeAgentRegistrationStatusFrom(this.serviceManagementAgentServices.agentServiceStatus(this.agentPlistName));
  }

  async registerRuntimeAgent(): Promise<Result<void, string>> {
    return this.requestRegisteredAndConfirm(true, ["enabled"]);
  }

  async startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    // Without `-k`, kickstart leaves a running job alone.
    const launchdJob = `gui/${this.uid}/${RUNTIME_LAUNCH_AGENT_LABEL}`;
    const kickstartRun = await this.launchctlRunner(["kickstart", launchdJob]);
    if (!kickstartRun.ok) return failedWith({ kind: "refused", refusal: `launchctl could not be run: ${kickstartRun.failure}` });
    const kickstart = kickstartRun.value;
    if (programSucceeded(kickstart)) return succeeded(undefined);
    if (kickstart.exitStatus === LAUNCHCTL_NO_SUCH_SERVICE_EXIT_STATUS) return failedWith({ kind: "no_job_for_the_registered_agent" });
    return failedWith({
      kind: "refused",
      refusal: `launchctl kickstart ${launchdJob} failed (${describeHowTheProgramEnded(kickstart)}): ${kickstart.standardError.trim()}`,
    });
  }

  async unregisterRuntimeAgent(): Promise<Result<void, string>> {
    return this.requestRegisteredAndConfirm(false, ["not_registered", "not_found"]);
  }

  async openLoginItemsSettings(): Promise<Result<void, string>> {
    return this.serviceManagementAgentServices.openSystemSettingsLoginItems();
  }

  /** Ask Service Management to register or unregister the agent, then read its status back, since Electron keeps Service Management's own refusal to its log: a status other than `expectedStatuses` is the refusal. */
  private async requestRegisteredAndConfirm(
    agentServiceRegistered: boolean,
    expectedStatuses: readonly RuntimeAgentRegistrationStatus[],
  ): Promise<Result<void, string>> {
    const request = this.serviceManagementAgentServices.requestAgentServiceRegistered(this.agentPlistName, agentServiceRegistered);
    if (!request.ok) return request;
    const statusAfterTheRequest = await this.registrationStatus();
    if (expectedStatuses.includes(statusAfterTheRequest)) return succeeded(undefined);
    return failedWith(
      `Service Management did not ${agentServiceRegistered ? "register" : "unregister"} ${this.agentPlistName}: it reads ${statusAfterTheRequest}`,
    );
  }
}
