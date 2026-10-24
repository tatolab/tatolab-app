// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import { RememberedSwitchFile } from "../../remembered_switch_file.js";
import { RunTatolabSwitch } from "../../run_tatolab_switch.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import {
  LINUX_HAS_NO_LOGIN_ITEMS,
  RUNTIME_SYSTEMD_USER_UNIT_NAME,
  runtimeAgentRegistrationStatusFromSystemctlIsEnabled,
  SystemdUserRuntimeService,
  type SystemctlUserCommandOutput,
  type SystemctlUserCommandRunner,
} from "./systemd_user_runtime_service.js";

function systemctlAnswered(exitCode: number, stdout: string, stderr: string): SystemctlUserCommandOutput {
  return { exitCode, stdout, stderr };
}

const NO_USER_MANAGER_ON_THE_BUS = "Failed to connect to bus: No medium found\n";

const NO_SESSION_BUS_ADDRESS =
  "Failed to connect to bus: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined (consider using " +
  "--machine=<user>@.host --user to connect to bus of other user)\n";

const tatolabAppLog = createTatolabAppLog("debug", () => {});
const temporaryConfigDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("is_enabled_reads_enabled_installed_or_no_unit_as_systemctl_answers_it", () => {
  for (const [isEnabledAnswer, expected] of [
    [systemctlAnswered(0, "enabled\n", ""), "enabled"],
    [systemctlAnswered(0, "enabled-runtime\n", ""), "enabled"],
    [systemctlAnswered(1, "disabled\n", ""), "not_registered"],
    [systemctlAnswered(1, "masked\n", ""), "not_registered"],
    [systemctlAnswered(1, "linked\n", ""), "not_registered"],
    [systemctlAnswered(4, "not-found\n", ""), "not_found"],
    [systemctlAnswered(1, "", "Failed to get unit file state for tatolabd.service: No such file or directory\n"), "not_found"],
    [systemctlAnswered(1, "", NO_USER_MANAGER_ON_THE_BUS), "not_found"],
    [systemctlAnswered(1, "", NO_SESSION_BUS_ADDRESS), "not_found"],
  ] as const) {
    expect(runtimeAgentRegistrationStatusFromSystemctlIsEnabled(isEnabledAnswer), JSON.stringify(isEnabledAnswer)).toBe(expected);
  }
});

/** A user systemd that knows one unit, answering as `systemctl --user` does, recording every command it is given. */
class FakeUserSystemd implements SystemctlUserCommandRunner {
  readonly commands: string[] = [];

  private constructor(
    private readonly unitFileInstalled: boolean,
    private readonly userManagerAnswers: boolean,
    public unitEnabled: boolean,
    public unitActive: boolean,
  ) {}

  static withTheUnit(unitEnabled: boolean, unitActive: boolean): FakeUserSystemd {
    return new FakeUserSystemd(true, true, unitEnabled, unitActive);
  }

  static beforeTheInstallerRan(): FakeUserSystemd {
    return new FakeUserSystemd(false, true, false, false);
  }

  static withNoUserManager(): FakeUserSystemd {
    return new FakeUserSystemd(true, false, false, false);
  }

  async runSystemctlUser(systemctlArguments: readonly string[]): Promise<Result<SystemctlUserCommandOutput, string>> {
    const command = systemctlArguments.join(" ");
    this.commands.push(command);
    if (!this.userManagerAnswers) return succeeded(systemctlAnswered(1, "", NO_USER_MANAGER_ON_THE_BUS));
    switch (command) {
      case `is-enabled ${RUNTIME_SYSTEMD_USER_UNIT_NAME}`:
        if (!this.unitFileInstalled) return succeeded(systemctlAnswered(4, "not-found\n", ""));
        return succeeded(this.unitEnabled ? systemctlAnswered(0, "enabled\n", "") : systemctlAnswered(1, "disabled\n", ""));
      case `enable --now ${RUNTIME_SYSTEMD_USER_UNIT_NAME}`:
        if (!this.unitFileInstalled) {
          return succeeded(systemctlAnswered(1, "", "Failed to enable unit: Unit file tatolabd.service does not exist.\n"));
        }
        this.unitEnabled = true;
        this.unitActive = true;
        return succeeded(
          systemctlAnswered(
            0,
            "",
            "Created symlink /home/u/.config/systemd/user/default.target.wants/tatolabd.service → /home/u/.config/systemd/user/tatolabd.service.\n",
          ),
        );
      case `disable --now ${RUNTIME_SYSTEMD_USER_UNIT_NAME}`:
        this.unitEnabled = false;
        this.unitActive = false;
        return succeeded(systemctlAnswered(0, "", ""));
      case `restart ${RUNTIME_SYSTEMD_USER_UNIT_NAME}`:
        if (!this.unitFileInstalled) {
          return succeeded(systemctlAnswered(5, "", "Failed to restart tatolabd.service: Unit tatolabd.service not found.\n"));
        }
        this.unitActive = true;
        return succeeded(systemctlAnswered(0, "", ""));
      case `start ${RUNTIME_SYSTEMD_USER_UNIT_NAME}`:
        if (!this.unitFileInstalled) {
          return succeeded(systemctlAnswered(5, "", "Failed to start tatolabd.service: Unit tatolabd.service not found.\n"));
        }
        this.unitActive = true;
        return succeeded(systemctlAnswered(0, "", ""));
      default:
        throw new Error(`systemctl --user ${command} is not a command the app runs`);
    }
  }
}

async function switchOver(userSystemd: FakeUserSystemd): Promise<RunTatolabSwitch> {
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(configDirectory);
  return RunTatolabSwitch.load(
    new SystemdUserRuntimeService(userSystemd, tatolabAppLog),
    RememberedSwitchFile.runTatolabInAppConfigDirectory(configDirectory, tatolabAppLog),
    performance.now(),
    tatolabAppLog,
  );
}

test("opening_the_app_with_the_switch_on_enables_a_disabled_unit_now", async () => {
  const userSystemd = FakeUserSystemd.withTheUnit(false, false);
  const runTatolabSwitch = await switchOver(userSystemd);

  const reconciliation = await runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, performance.now());

  expect(reconciliation).toEqual({ kind: "registered" });
  expect(userSystemd.commands).toEqual([
    "is-enabled tatolabd.service",
    "enable --now tatolabd.service",
    "is-enabled tatolabd.service",
    "start tatolabd.service",
  ]);
  expect(userSystemd.unitEnabled && userSystemd.unitActive).toBe(true);
});

test("turning_the_switch_off_disables_the_unit_now_and_on_again_enables_it", async () => {
  const userSystemd = FakeUserSystemd.withTheUnit(true, true);
  const runTatolabSwitch = await switchOver(userSystemd);

  expect(await runTatolabSwitch.setRunTatolab(false, true, performance.now())).toEqual({ kind: "unregistered" });
  expect(!userSystemd.unitEnabled && !userSystemd.unitActive).toBe(true);
  expect(await runTatolabSwitch.setRunTatolab(true, true, performance.now())).toEqual({ kind: "registered" });
  expect(userSystemd.unitEnabled && userSystemd.unitActive).toBe(true);
  expect(userSystemd.commands).toEqual([
    "is-enabled tatolabd.service",
    "disable --now tatolabd.service",
    "is-enabled tatolabd.service",
    "enable --now tatolabd.service",
    "is-enabled tatolabd.service",
    "start tatolabd.service",
  ]);
});

test("the_poller_starts_an_enabled_unit_whose_runtime_is_down", async () => {
  const userSystemd = FakeUserSystemd.withTheUnit(true, false);
  const runTatolabSwitch = await switchOver(userSystemd);

  await runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown(
    await runTatolabSwitch.runtimeAgentRegistrationStatus(),
    "failing",
    performance.now(),
  );

  expect(userSystemd.commands).toEqual(["is-enabled tatolabd.service", "start tatolabd.service"]);
  expect(userSystemd.unitActive).toBe(true);
});

test("before_the_installer_ran_there_is_no_unit_and_enabling_it_fails_in_systemctls_words", async () => {
  const runTatolabSwitch = await switchOver(FakeUserSystemd.beforeTheInstallerRan());

  expect(await runTatolabSwitch.runtimeAgentRegistrationStatus()).toBe("not_found");
  expect(await runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, performance.now())).toEqual({
    kind: "registration_failed",
    failureDescription:
      "systemctl --user enable --now tatolabd.service failed (exit 1): Failed to enable unit: Unit file tatolabd.service does not exist.",
  });
});

test("with_no_user_manager_there_is_no_unit_to_drive", async () => {
  const runtimeService = new SystemdUserRuntimeService(FakeUserSystemd.withNoUserManager(), tatolabAppLog);

  expect(await runtimeService.registrationStatus()).toBe("not_found");
  expect(await runtimeService.startRuntimeAgentIfNotRunning()).toEqual(
    failedWith({
      kind: "refused",
      refusal: "systemctl --user start tatolabd.service failed (exit 1): Failed to connect to bus: No medium found",
    }),
  );
});

test("systemctl_that_cannot_be_run_reads_as_no_unit_and_refuses_every_change", async () => {
  const systemctlMissing: SystemctlUserCommandRunner = {
    runSystemctlUser: async () => failedWith("systemctl could not be run: spawn systemctl ENOENT"),
  };
  const runtimeService = new SystemdUserRuntimeService(systemctlMissing, tatolabAppLog);

  expect(await runtimeService.registrationStatus()).toBe("not_found");
  expect(await runtimeService.registerRuntimeAgent()).toEqual(failedWith("systemctl could not be run: spawn systemctl ENOENT"));
});

test("a_runtime_crash_looping_past_its_start_limit_is_refused_in_systemctls_words", async () => {
  const startLimitHit: SystemctlUserCommandRunner = {
    runSystemctlUser: async () =>
      succeeded(
        systemctlAnswered(
          1,
          "",
          "Job for tatolabd.service failed because start of the service was attempted too often.\n" +
            'See "systemctl --user status tatolabd.service" and "journalctl --user -xeu tatolabd.service" for details.\n',
        ),
      ),
  };
  const runtimeService = new SystemdUserRuntimeService(startLimitHit, tatolabAppLog);

  const started = await runtimeService.startRuntimeAgentIfNotRunning();

  expect(started.ok).toBe(false);
  if (started.ok || started.failure.kind !== "refused") throw new Error("a start past systemd's start limit is a refusal");
  expect(started.failure.refusal).toMatch(
    /^systemctl --user start tatolabd\.service failed \(exit 1\): Job for tatolabd\.service failed because start of the service was attempted too often\./,
  );
});

test("linux_refuses_to_open_login_items", async () => {
  const runtimeService = new SystemdUserRuntimeService(FakeUserSystemd.withTheUnit(true, true), tatolabAppLog);

  expect(await runtimeService.openLoginItemsSettings()).toEqual(failedWith(LINUX_HAS_NO_LOGIN_ITEMS));
});

test("restarting_the_runtime_restarts_the_unit_and_a_missing_unit_is_refused_in_systemctls_words", async () => {
  const userSystemd = FakeUserSystemd.withTheUnit(true, true);
  expect(await new SystemdUserRuntimeService(userSystemd, tatolabAppLog).restartRuntimeAgent()).toEqual(succeeded(undefined));
  expect(userSystemd.commands).toEqual(["restart tatolabd.service"]);

  const withoutTheUnit = FakeUserSystemd.beforeTheInstallerRan();
  expect(await new SystemdUserRuntimeService(withoutTheUnit, tatolabAppLog).restartRuntimeAgent()).toEqual(
    failedWith({
      kind: "refused",
      refusal: "systemctl --user restart tatolabd.service failed (exit 5): Failed to restart tatolabd.service: Unit tatolabd.service not found.",
    }),
  );
});
