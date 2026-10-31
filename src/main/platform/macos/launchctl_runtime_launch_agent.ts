// The runtime's launch agent as streamlib's installer writes it into the user's LaunchAgents folder,
// loaded, started and unloaded through `launchctl` in the user's `gui/<uid>` domain.

import { stat } from "node:fs/promises";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../../shared/tatolab_backend_contract.js";
import type { RuntimeAgentGiveUp, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "../runtime_agent_registration.js";
import { describeHowTheProgramEnded, programSucceeded, runProgramToCompletion, type ProgramCompletion } from "../run_program_to_completion.js";
import { OPEN_AT_ITS_SYSTEM_PATH, type OpenRunner } from "./terminal_app_opened_by_open.js";

/** launchctl's exit status when its domain holds no job for the service ("Could not find service"). */
const LAUNCHCTL_NO_SUCH_SERVICE_EXIT_STATUS = 113;

/** launchctl's exit status for `bootout` of a job that is not loaded, as older macOS answers it (ESRCH). */
const LAUNCHCTL_NO_SUCH_PROCESS_EXIT_STATUS = 3;

/** launchctl's exit status for a `bootstrap` launchd refuses (EIO), as it answers for an agent Login Items holds off. */
const LAUNCHCTL_BOOTSTRAP_REFUSED_EXIT_STATUS = 5;

const LAUNCHCTL_PATH = "/bin/launchctl";

/** The System Settings pane that lists Login Items and background items. */
const LOGIN_ITEMS_SETTINGS_URL = "x-apple.systempreferences:com.apple.LoginItems-Settings.extension";

/** Runs `launchctl` with its arguments to completion; a test's fake stands in for it. */
export type LaunchctlRunner = (launchctlArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;

/** `launchctl` at its system path. */
export const LAUNCHCTL_AT_ITS_SYSTEM_PATH: LaunchctlRunner = (launchctlArguments) => runProgramToCompletion(LAUNCHCTL_PATH, launchctlArguments);

/** `open` at its system path. */
export const OPEN_RUN_AT_ITS_SYSTEM_PATH: OpenRunner = (openArguments) => runProgramToCompletion(OPEN_AT_ITS_SYSTEM_PATH, openArguments);

/** The launch agent streamlib's installer writes: its `Label` and the plist it writes it in. */
export interface RuntimeLaunchAgentOnThisMac {
  readonly label: string;
  readonly plistPath: string;
}

/** A top-level field of `launchctl print`'s answer for one job, a line indented by one tab; `null` when it prints none. */
function launchctlPrintField(launchctlPrintOutput: string, fieldName: string): string | null {
  const fieldPrefix = `\t${fieldName} = `;
  const fieldLine = launchctlPrintOutput.split("\n").find((printedLine) => printedLine.startsWith(fieldPrefix));
  return fieldLine === undefined ? null : fieldLine.slice(fieldPrefix.length).trim();
}

/**
 * launchd having given up on the job `launchctl print` describes, or `null`: a job not running whose last spawn exited
 * 78 (EX_CONFIG, launchd refusing to spawn it) or was ended for its code signature, as a Launch Constraint Violation is.
 * A code-signing ending holds until launchd spawns the job again.
 */
export function whyLaunchdGaveUpOnTheJob(launchctlPrintOutput: string): RuntimeAgentGiveUp | null {
  if (launchctlPrintField(launchctlPrintOutput, "state") === "running") return null;
  const lastExitReason = launchctlPrintField(launchctlPrintOutput, "last exit reason");
  if (lastExitReason !== null && lastExitReason.includes("CODESIGNING")) {
    return {
      serviceManagerWords: `launchd: last exit reason = ${lastExitReason}`,
      registeringAgainWaitsForTheNextSpawn: true,
    };
  }
  const lastExitCode = launchctlPrintField(launchctlPrintOutput, "last exit code");
  if (lastExitCode !== null && /^78\b/.test(lastExitCode)) {
    return {
      serviceManagerWords: `launchd: last exit code = ${lastExitCode}`,
      registeringAgainWaitsForTheNextSpawn: false,
    };
  }
  return null;
}

/** `launchctl <arguments>` failed, in launchctl's words. */
function launchctlRefusal(launchctlArguments: readonly string[], launchctlRun: ProgramCompletion): string {
  const launchctlSaid = launchctlRun.standardError.trim();
  return `launchctl ${launchctlArguments.join(" ")} failed (${describeHowTheProgramEnded(launchctlRun)})${launchctlSaid === "" ? "" : `: ${launchctlSaid}`}`;
}

/** The installed runtime's launch agent, loaded and unloaded through `launchctl` in the domain of the user with `uid`. */
export class LaunchctlRuntimeLaunchAgent implements RuntimeAgentRegistration {
  /** launchd refused to load the agent while the app had it enabled, which Login Items holding Tatolab off does; cleared once it loads or the app unloads it. */
  private bootstrapRefusedWhileEnabled = false;

  constructor(
    private readonly uid: number,
    private readonly runtimeLaunchAgent: RuntimeLaunchAgentOnThisMac,
    private readonly launchctlRunner: LaunchctlRunner,
    private readonly runOpen: OpenRunner,
  ) {}

  async registrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    if (!(await this.theInstallerWroteTheAgentsPlist())) return "not_found";
    if (await this.launchdHoldsTheJob()) {
      this.bootstrapRefusedWhileEnabled = false;
      return "enabled";
    }
    return this.bootstrapRefusedWhileEnabled ? "requires_approval" : "not_registered";
  }

  async registerRuntimeAgent(): Promise<Result<void, string>> {
    const enableArguments = ["enable", this.launchdJob()];
    const enabled = await this.runLaunchctl(enableArguments);
    if (!enabled.ok) return enabled;
    if (!programSucceeded(enabled.value)) return failedWith(launchctlRefusal(enableArguments, enabled.value));
    if (await this.launchdHoldsTheJob()) return succeeded(undefined);
    const bootstrapArguments = ["bootstrap", this.launchdDomain(), this.runtimeLaunchAgent.plistPath];
    const bootstrapped = await this.runLaunchctl(bootstrapArguments);
    if (!bootstrapped.ok) return bootstrapped;
    // launchctl answers a bootstrap of a job something else loaded meanwhile with the same EIO it gives a refusal.
    if (programSucceeded(bootstrapped.value) || (await this.launchdHoldsTheJob())) {
      this.bootstrapRefusedWhileEnabled = false;
      return succeeded(undefined);
    }
    this.bootstrapRefusedWhileEnabled = bootstrapped.value.exitStatus === LAUNCHCTL_BOOTSTRAP_REFUSED_EXIT_STATUS;
    return failedWith(launchctlRefusal(bootstrapArguments, bootstrapped.value));
  }

  async whyTheServiceManagerGaveUpOnTheRuntime(): Promise<RuntimeAgentGiveUp | null> {
    const printed = await this.launchctlRunner(["print", this.launchdJob()]);
    if (!printed.ok || !programSucceeded(printed.value)) return null;
    return whyLaunchdGaveUpOnTheJob(printed.value.standardOutput);
  }

  startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    // Without `-k`, kickstart leaves a running job alone.
    return this.kickstartTheRuntimesJob([]);
  }

  restartRuntimeAgent(): Promise<Result<void, RuntimeAgentStartFailure>> {
    // `-k` kills a running job before starting it, and launchd answers once it has spawned it again.
    return this.kickstartTheRuntimesJob(["-k"]);
  }

  async unregisterRuntimeAgent(): Promise<Result<void, string>> {
    this.bootstrapRefusedWhileEnabled = false;
    const disableArguments = ["disable", this.launchdJob()];
    const disabled = await this.runLaunchctl(disableArguments);
    if (!disabled.ok) return disabled;
    if (!programSucceeded(disabled.value)) return failedWith(launchctlRefusal(disableArguments, disabled.value));
    const bootoutArguments = ["bootout", this.launchdJob()];
    const bootedOut = await this.runLaunchctl(bootoutArguments);
    if (!bootedOut.ok) return bootedOut;
    const bootoutExitStatus = bootedOut.value.exitStatus;
    if (
      programSucceeded(bootedOut.value) ||
      bootoutExitStatus === LAUNCHCTL_NO_SUCH_SERVICE_EXIT_STATUS ||
      bootoutExitStatus === LAUNCHCTL_NO_SUCH_PROCESS_EXIT_STATUS
    ) {
      return succeeded(undefined);
    }
    return failedWith(launchctlRefusal(bootoutArguments, bootedOut.value));
  }

  async openLoginItemsSettings(): Promise<Result<void, string>> {
    const opened = await this.runOpen([LOGIN_ITEMS_SETTINGS_URL]);
    if (!opened.ok) return failedWith(`Login Items could not be opened: ${opened.failure}`);
    if (programSucceeded(opened.value)) return succeeded(undefined);
    const openSaid = opened.value.standardError.trim();
    return failedWith(`Login Items did not open (${describeHowTheProgramEnded(opened.value)})${openSaid === "" ? "" : `: ${openSaid}`}`);
  }

  private async kickstartTheRuntimesJob(kickstartOptions: readonly string[]): Promise<Result<void, RuntimeAgentStartFailure>> {
    const kickstartArguments = ["kickstart", ...kickstartOptions, this.launchdJob()];
    const kickstartRun = await this.launchctlRunner(kickstartArguments);
    if (!kickstartRun.ok)
      return failedWith({
        kind: "refused",
        refusal: `launchctl could not be run: ${kickstartRun.failure}`,
      });
    const kickstart = kickstartRun.value;
    if (programSucceeded(kickstart)) return succeeded(undefined);
    if (kickstart.exitStatus === LAUNCHCTL_NO_SUCH_SERVICE_EXIT_STATUS) return failedWith({ kind: "no_job_for_the_registered_agent" });
    return failedWith({
      kind: "refused",
      refusal: launchctlRefusal(kickstartArguments, kickstart),
    });
  }

  private async runLaunchctl(launchctlArguments: readonly string[]): Promise<Result<ProgramCompletion, string>> {
    const launchctlRun = await this.launchctlRunner(launchctlArguments);
    return launchctlRun.ok ? launchctlRun : failedWith(`launchctl could not be run: ${launchctlRun.failure}`);
  }

  private async launchdHoldsTheJob(): Promise<boolean> {
    const printed = await this.launchctlRunner(["print", this.launchdJob()]);
    return printed.ok && programSucceeded(printed.value);
  }

  private theInstallerWroteTheAgentsPlist(): Promise<boolean> {
    return stat(this.runtimeLaunchAgent.plistPath).then(
      (plistMetadata) => plistMetadata.isFile(),
      () => false,
    );
  }

  /** This user's launchd domain, as `launchctl` names it. */
  private launchdDomain(): string {
    return `gui/${this.uid}`;
  }

  /** The runtime's job in this user's launchd domain, as `launchctl` names it. */
  private launchdJob(): string {
    return `${this.launchdDomain()}/${this.runtimeLaunchAgent.label}`;
  }
}
