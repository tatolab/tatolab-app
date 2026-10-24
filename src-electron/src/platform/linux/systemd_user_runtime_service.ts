// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The runtime's agent on Linux: the systemd user unit `tatolabd.service` the installer
// (`curl -fsSL https://get.tatolab.com/install.sh | sh`) writes and enables, driven over
// `systemctl --user`. "Run Tatolab" is the unit's enablement, `enable --now` and
// `disable --now`, starting a runtime the poller found down is `start`, which leaves an active
// unit alone, and "Restart runtime" is `restart`.

import { execFile } from "node:child_process";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../../../src/backend/tatolab_backend_contract.js";
import { ConditionOnsetLatch } from "../../condition_onset_latch.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { RuntimeAgentRegistration, RuntimeAgentStartFailure } from "../runtime_agent_registration.js";

/** The installer's systemd user unit that runs `tatolabd`. */
export const RUNTIME_SYSTEMD_USER_UNIT_NAME = "tatolabd.service";

/** Why Linux refuses to open Login Items. */
export const LINUX_HAS_NO_LOGIN_ITEMS =
  'Linux has no Login Items: "Run Tatolab" enables and disables the systemd user service tatolabd.service';

/** What one `systemctl --user` run answered. */
export interface SystemctlUserCommandOutput {
  /** Its exit code; `null` when a signal ended it. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `systemctl --user` with the arguments given; a test's fake answers as systemctl does. */
export interface SystemctlUserCommandRunner {
  /** What `systemctl --user <arguments>` answered; a failure when systemctl could not be run at all. */
  runSystemctlUser(systemctlArguments: readonly string[]): Promise<Result<SystemctlUserCommandOutput, string>>;
}

/** The `systemctl` on the PATH, run with no shell. */
export class SystemctlOnThePath implements SystemctlUserCommandRunner {
  runSystemctlUser(systemctlArguments: readonly string[]): Promise<Result<SystemctlUserCommandOutput, string>> {
    return new Promise((settle) => {
      execFile("systemctl", ["--user", ...systemctlArguments], { encoding: "utf8" }, (runFailure, stdout, stderr) => {
        if (runFailure === null) {
          settle(succeeded({ exitCode: 0, stdout, stderr }));
        } else if (typeof runFailure.code === "number") {
          settle(succeeded({ exitCode: runFailure.code, stdout, stderr }));
        } else if (runFailure.signal !== undefined && runFailure.signal !== null) {
          settle(succeeded({ exitCode: null, stdout, stderr }));
        } else {
          settle(failedWith(`systemctl could not be run: ${describeCaughtFailure(runFailure)}`));
        }
      });
    });
  }
}

/** The runtime's systemd user unit, driven through `systemctl --user`. */
export class SystemdUserRuntimeService implements RuntimeAgentRegistration {
  /** When `is-enabled` starts reading no unit to drive, so why is logged once per drop. */
  private readonly unitNotFoundOnset = new ConditionOnsetLatch();

  /** The unit, driven through `systemctl`, logging to `tatolabAppLog`. */
  constructor(
    private readonly systemctl: SystemctlUserCommandRunner,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Run `systemctl --user <arguments>`, refused in systemctl's own words unless it exits 0. */
  private async runSystemctlUserExpectingSuccess(systemctlArguments: readonly string[]): Promise<Result<void, string>> {
    const outputOrRunFailure = await this.systemctl.runSystemctlUser(systemctlArguments);
    if (!outputOrRunFailure.ok) return outputOrRunFailure;
    const output = outputOrRunFailure.value;
    if (output.exitCode === 0) return succeeded(undefined);
    const howItEnded = output.exitCode === null ? "ended by a signal" : `exit ${output.exitCode}`;
    return failedWith(`systemctl --user ${systemctlArguments.join(" ")} failed (${howItEnded}): ${output.stderr.trim()}`);
  }

  async registrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    const isEnabledAnswerOrRunFailure = await this.systemctl.runSystemctlUser(["is-enabled", RUNTIME_SYSTEMD_USER_UNIT_NAME]);
    const registrationStatus = isEnabledAnswerOrRunFailure.ok
      ? runtimeAgentRegistrationStatusFromSystemctlIsEnabled(isEnabledAnswerOrRunFailure.value)
      : "not_found";
    if (this.unitNotFoundOnset.conditionJustStartedHolding(registrationStatus === "not_found")) {
      if (isEnabledAnswerOrRunFailure.ok) {
        const isEnabledAnswer = isEnabledAnswerOrRunFailure.value;
        this.tatolabAppLog.warn(`systemctl --user is-enabled ${RUNTIME_SYSTEMD_USER_UNIT_NAME} names no unit to drive`, {
          exit_code: isEnabledAnswer.exitCode,
          stdout: isEnabledAnswer.stdout.trim(),
          stderr: isEnabledAnswer.stderr.trim(),
        });
      } else {
        this.tatolabAppLog.warn(`${RUNTIME_SYSTEMD_USER_UNIT_NAME} reads as no unit to drive`, {
          run_failure: isEnabledAnswerOrRunFailure.failure,
        });
      }
    }
    return registrationStatus;
  }

  registerRuntimeAgent(): Promise<Result<void, string>> {
    return this.runSystemctlUserExpectingSuccess(["enable", "--now", RUNTIME_SYSTEMD_USER_UNIT_NAME]);
  }

  async startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    const started = await this.runSystemctlUserExpectingSuccess(["start", RUNTIME_SYSTEMD_USER_UNIT_NAME]);
    return started.ok ? started : failedWith({ kind: "refused", refusal: started.failure });
  }

  async restartRuntimeAgent(): Promise<Result<void, RuntimeAgentStartFailure>> {
    const restarted = await this.runSystemctlUserExpectingSuccess(["restart", RUNTIME_SYSTEMD_USER_UNIT_NAME]);
    return restarted.ok ? restarted : failedWith({ kind: "refused", refusal: restarted.failure });
  }

  unregisterRuntimeAgent(): Promise<Result<void, string>> {
    return this.runSystemctlUserExpectingSuccess(["disable", "--now", RUNTIME_SYSTEMD_USER_UNIT_NAME]);
  }

  async openLoginItemsSettings(): Promise<Result<void, string>> {
    return failedWith(LINUX_HAS_NO_LOGIN_ITEMS);
  }
}

/**
 * The registration `systemctl --user is-enabled` answered: `enabled` (exit 0) is enabled; any other state
 * it prints, such as `disabled`, `masked` or `linked` (exit 1), is a unit installed but not enabled;
 * `not-found` (exit 4), or no state at all, is no unit to drive. Older systemd names a missing unit only on
 * stderr, and with no user manager to ask the bus refuses.
 */
export function runtimeAgentRegistrationStatusFromSystemctlIsEnabled(isEnabledAnswer: SystemctlUserCommandOutput): RuntimeAgentRegistrationStatus {
  const firstLineOfStdout = isEnabledAnswer.stdout === "" ? null : (isEnabledAnswer.stdout.split("\n")[0] ?? "").trim();
  switch (firstLineOfStdout) {
    case "enabled":
    case "enabled-runtime":
      return "enabled";
    case null:
    case "":
    case "not-found":
      return "not_found";
    default:
      return "not_registered";
  }
}
