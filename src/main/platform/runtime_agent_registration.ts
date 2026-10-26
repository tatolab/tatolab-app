// The seam between the "Run Tatolab" decision and the platform's service manager that runs the
// runtime as the user's agent: Service Management's `SMAppService` launch agent on macOS, the
// installer's systemd user unit on Linux.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../shared/tatolab_backend_contract.js";
import type { Result } from "../result.js";

/**
 * Why the service manager did not start the registered agent's runtime: `no_job_for_the_registered_agent`
 * is launchd holding no job for an agent Service Management still reads as registered (after `brew
 * uninstall` or `launchctl bootout`), which registering again restores, and only macOS reports it;
 * `refused` is any other refusal, in the service manager's words.
 */
export type RuntimeAgentStartFailure = { kind: "no_job_for_the_registered_agent" } | { kind: "refused"; refusal: string };

/**
 * The service manager having given up starting the agent's runtime, in its words. `registeringAgainWaitsForTheNextSpawn`:
 * registering the agent now is refused the same way until the service manager spawns the job again; only macOS reports it.
 */
export interface RuntimeAgentGiveUp {
  readonly serviceManagerWords: string;
  readonly registeringAgainWaitsForTheNextSpawn: boolean;
}

/** Restarts the runtime the app's own bundle carries, so a runtime still running from the bundle before an update runs from the bundle as it is now. */
export interface BundledRuntimeRestart {
  /** Restart the agent's runtime, starting it if it was not running; refused in the service manager's words. */
  restartTheBundledRuntime(): Promise<Result<void, string>>;
}

/** Registers and unregisters the agent that runs the machine's `tatolabd`. */
export interface RuntimeAgentRegistration {
  /** What the service manager says about the agent now. */
  registrationStatus(): Promise<RuntimeAgentRegistrationStatus>;

  /** Register the agent so the service manager starts the runtime now and at every login, clearing any give-up the service manager holds against it. */
  registerRuntimeAgent(): Promise<Result<void, string>>;

  /**
   * The service manager having given up starting the agent's runtime — launchd refusing to spawn it (exit 78, EX_CONFIG)
   * or killing it for its code signature, systemd holding the unit failed — or `null` while it has not or could not be
   * asked. Reads only.
   */
  whyTheServiceManagerGaveUpOnTheRuntime(): Promise<RuntimeAgentGiveUp | null>;

  /**
   * Start the registered agent's runtime unless it is already running. Service Management loads a newly
   * registered agent but launchd may defer its first start, and systemd stops restarting a runtime that
   * crashed past its start limit.
   */
  startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>>;

  /** Stop the registered agent's runtime and start it again, starting it if it was not running; "Restart runtime" in Settings. */
  restartRuntimeAgent(): Promise<Result<void, RuntimeAgentStartFailure>>;

  /** Unregister the agent, which stops the runtime and keeps it from starting at login. */
  unregisterRuntimeAgent(): Promise<Result<void, string>>;

  /** Open System Settings at Login Items, where a user approves the agent; refused where the platform has no approval step. */
  openLoginItemsSettings(): Promise<Result<void, string>>;
}
