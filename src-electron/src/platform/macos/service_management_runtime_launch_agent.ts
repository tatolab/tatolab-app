// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The runtime's launch agent registered through Service Management's `SMAppService`, from the
// plist the bundle carries in `Contents/Library/LaunchAgents/`.

import { failedWith, succeeded, type Result } from "../../result.js";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../../../src/backend/tatolab_backend_contract.js";
import type { BundledRuntimeRestart, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "../runtime_agent_registration.js";
import { describeHowTheProgramEnded, programSucceeded, runProgramToCompletion, type ProgramCompletion } from "../run_program_to_completion.js";
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

/** The runtime's launch agent as `SMAppService` sees it, whose runtime runs from the app's bundle. */
export class ServiceManagementRuntimeLaunchAgent implements RuntimeAgentRegistration, BundledRuntimeRestart {
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
    return runtimeAgentRegistrationStatusFrom(await this.serviceManagementAgentServices.agentServiceStatus(this.agentPlistName));
  }

  async registerRuntimeAgent(): Promise<Result<void, string>> {
    return this.serviceManagementAgentServices.registerAgentService(this.agentPlistName);
  }

  startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    // Without `-k`, kickstart leaves a running job alone.
    return this.kickstartTheRuntimesJob([]);
  }

  restartRuntimeAgent(): Promise<Result<void, RuntimeAgentStartFailure>> {
    // `-k` kills a running job before starting it, and launchd answers once it has spawned it again.
    return this.kickstartTheRuntimesJob(["-k"]);
  }

  private async kickstartTheRuntimesJob(kickstartOptions: readonly string[]): Promise<Result<void, RuntimeAgentStartFailure>> {
    const launchdJob = `gui/${this.uid}/${RUNTIME_LAUNCH_AGENT_LABEL}`;
    const kickstartArguments = ["kickstart", ...kickstartOptions, launchdJob];
    const kickstartRun = await this.launchctlRunner(kickstartArguments);
    if (!kickstartRun.ok) return failedWith({ kind: "refused", refusal: `launchctl could not be run: ${kickstartRun.failure}` });
    const kickstart = kickstartRun.value;
    if (programSucceeded(kickstart)) return succeeded(undefined);
    if (kickstart.exitStatus === LAUNCHCTL_NO_SUCH_SERVICE_EXIT_STATUS) return failedWith({ kind: "no_job_for_the_registered_agent" });
    return failedWith({
      kind: "refused",
      refusal: `launchctl ${kickstartArguments.join(" ")} failed (${describeHowTheProgramEnded(kickstart)}): ${kickstart.standardError.trim()}`,
    });
  }

  async restartTheBundledRuntime(): Promise<Result<void, string>> {
    // launchd keeps the job as Service Management recorded it at registration, the bundle's version
    // included, until the agent is registered again; registering stops the old runtime and loads the
    // plist the bundle carries now.
    const unregistered = await this.serviceManagementAgentServices.unregisterAgentService(this.agentPlistName);
    if (!unregistered.ok) return failedWith(`Service Management could not unregister the runtime's agent: ${unregistered.failure}`);
    const registered = await this.serviceManagementAgentServices.registerAgentService(this.agentPlistName);
    if (!registered.ok) return failedWith(`Service Management could not register the runtime's agent again: ${registered.failure}`);
    const started = await this.startRuntimeAgentIfNotRunning();
    if (started.ok) return succeeded(undefined);
    switch (started.failure.kind) {
      case "no_job_for_the_registered_agent":
        return failedWith(`launchd holds no job for ${RUNTIME_LAUNCH_AGENT_LABEL} after registering it again`);
      case "refused":
        return failedWith(started.failure.refusal);
    }
  }

  async unregisterRuntimeAgent(): Promise<Result<void, string>> {
    return this.serviceManagementAgentServices.unregisterAgentService(this.agentPlistName);
  }

  async openLoginItemsSettings(): Promise<Result<void, string>> {
    return this.serviceManagementAgentServices.openSystemSettingsLoginItems();
  }
}
