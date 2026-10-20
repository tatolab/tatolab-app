// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// "Uninstall Tatolab…" on macOS, as the installer's `--uninstall` does on Linux: the service and
// the files go, and the runtime's state directory, `~/Library/Application Support/Tatolab`, stays.
// One administrator prompt removes the machine-wide files first, so a cancelled prompt changes
// nothing; then "Run Tatolab" is turned off, which unregisters the runtime's agent and stops the
// runtime, the app's own config directory is removed, the bundle goes to the Trash, and the app
// quits. A local-proof build removes its test root instead of prompting.

import { rm } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { RunTatolabReconciliation } from "../../run_tatolab_switch.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { currentProcessUid, type RunTatolabSwitchToTurnOff, type TatolabUninstall } from "../mod.js";
import { shellWordForPath, type AdministratorPrompt, type AdministratorPromptFailure } from "./administrator_prompt.js";
import { appBundleOfTheExecutable, tatolabMachinePathsOnMacosForThisBuild, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

/** The words the uninstall's administrator prompt shows under "Tatolab wants to make changes." */
export const UNINSTALL_ADMINISTRATOR_PROMPT_TEXT = "Tatolab needs to remove the machine runtime lock and the tatolab command to uninstall.";

/** What uninstalling removes machine-wide before anything else: a real build's CLI link and machine runtime lock directory, by a root script behind one administrator prompt; or a local-proof build's test root, with no prompt. */
export type MachineFilesToRemove =
  | { kind: "behind_the_administrator_prompt"; removalScript: string }
  | { kind: "local_proof_test_root"; testMachineRoot: string };

/** The steps uninstalling takes, in the order `uninstallTatolabInOrder` takes them; a fake records them in tests. */
export interface TatolabUninstallSteps {
  /** Run `removalScript` as root behind one administrator prompt. */
  runBehindTheAdministratorPrompt(removalScript: string): Promise<Result<void, AdministratorPromptFailure>>;
  /** Remove a local-proof build's test root and everything under it, with no prompt. */
  removeTheLocalProofTestRoot(testMachineRoot: string): Promise<Result<void, string>>;
  /** Turn "Run Tatolab" off, which unregisters the runtime's agent and so stops the runtime. */
  turnRunTatolabOff(): Promise<Result<void, string>>;
  /** Remove the app's own config directory, where the switch is remembered. */
  removeTheAppConfigDirectory(): Promise<Result<void, string>>;
  /** Move this app's bundle to the Trash. */
  moveThisAppBundleToTheTrash(): Promise<Result<void, string>>;
  /** Quit the app. */
  quitTheApp(): void;
}

/** Uninstall Tatolab in order — `machineFiles` first, so a cancelled prompt changes nothing, then the runtime's agent, the app's config directory and its bundle — and quit. The first step that fails stops the rest and is the answer. */
export async function uninstallTatolabInOrder(steps: TatolabUninstallSteps, machineFiles: MachineFilesToRemove): Promise<Result<void, string>> {
  const machineFilesRemoved = await removeTheMachineFiles(steps, machineFiles);
  if (!machineFilesRemoved.ok) return machineFilesRemoved;
  for (const uninstallStep of [
    () => steps.turnRunTatolabOff(),
    () => steps.removeTheAppConfigDirectory(),
    () => steps.moveThisAppBundleToTheTrash(),
  ]) {
    const stepTaken = await uninstallStep();
    if (!stepTaken.ok) return stepTaken;
  }
  steps.quitTheApp();
  return succeeded(undefined);
}

async function removeTheMachineFiles(steps: TatolabUninstallSteps, machineFiles: MachineFilesToRemove): Promise<Result<void, string>> {
  if (machineFiles.kind === "local_proof_test_root") return steps.removeTheLocalProofTestRoot(machineFiles.testMachineRoot);
  const removed = await steps.runBehindTheAdministratorPrompt(machineFiles.removalScript);
  if (removed.ok) return removed;
  return failedWith(
    removed.failure.kind === "cancelled"
      ? "the administrator prompt was cancelled, so nothing was uninstalled"
      : `the machine's Tatolab files could not be removed: ${removed.failure.failureDescription}`,
  );
}

/** What uninstalling removes machine-wide for `machinePaths`, the bundle at `appBundle` being the one whose CLI link goes. */
export function machineFilesToRemove(machinePaths: TatolabMachinePathsOnMacos, appBundle: string): MachineFilesToRemove {
  if (machinePaths.localProofTestMachineRoot !== null) {
    return { kind: "local_proof_test_root", testMachineRoot: machinePaths.localProofTestMachineRoot };
  }
  return {
    kind: "behind_the_administrator_prompt",
    removalScript: tatolabUninstallAdministratorShellScript(machinePaths.commandLineToolLink, appBundle, machinePaths.machineRuntimeLockDirectory),
  };
}

/** The one root shell script uninstalling runs: it removes `commandLineToolLink` only while it points into `appBundle`, then `machineRuntimeLockDirectory` and everything in it. */
export function tatolabUninstallAdministratorShellScript(
  commandLineToolLink: string | null,
  appBundle: string,
  machineRuntimeLockDirectory: string,
): string {
  const steps: string[] = [];
  if (commandLineToolLink !== null) {
    const link = shellWordForPath(commandLineToolLink);
    steps.push(`case "$(readlink ${link})" in ${shellWordForPath(appBundle)}/*) rm -f ${link} ;; esac`);
  }
  steps.push(`rm -rf ${shellWordForPath(machineRuntimeLockDirectory)}`);
  return steps.join(" && ");
}

/** Whether turning "Run Tatolab" off left the runtime's launch agent unregistered: only `unregistered` lets the uninstall go on, and any other reconciliation stops it, named. */
export function runTatolabTurnedOff(reconciliation: RunTatolabReconciliation): Result<void, string> {
  switch (reconciliation.kind) {
    case "unregistered":
      return succeeded(undefined);
    case "unregistration_failed":
      return failedWith(`the runtime's launch agent could not be unregistered: ${reconciliation.failureDescription}`);
    default:
      return failedWith(
        `turning Run Tatolab off answered ${JSON.stringify(reconciliation)} rather than unregistering the runtime's launch agent, so nothing more was uninstalled`,
      );
  }
}

/** Remove `appConfigDirectory`, refusing one not named for `appIdentifier`, as the app's own is. */
export async function removeTheAppConfigDirectoryNamedFor(appConfigDirectory: string, appIdentifier: string): Promise<Result<void, string>> {
  if (path.basename(appConfigDirectory) !== appIdentifier) {
    return failedWith(`${appConfigDirectory} is not named for the app's identifier ${appIdentifier}, so it was not removed`);
  }
  return removeTheDirectoryUnlessAbsent(appConfigDirectory);
}

/** Remove `directory` and everything in it; one that is not there is already removed. */
async function removeTheDirectoryUnlessAbsent(directory: string): Promise<Result<void, string>> {
  return rm(directory, { recursive: true, force: true }).then(
    () => succeeded(undefined),
    (removalFailure: unknown) => failedWith(`${directory} could not be removed: ${describeCaughtFailure(removalFailure)}`),
  );
}

/** What uninstalling needs from the app around it: the Trash and quitting. */
export interface TatolabUninstallAppSurface {
  /** Move `itemPath` to the Trash; refused in the system's words. */
  moveToTheTrash(itemPath: string): Promise<Result<void, string>>;
  /** Quit the app. */
  quitTheApp(): void;
}

/** Uninstalling Tatolab from this Mac, at most one at a time. */
export class TatolabUninstallOnThisMac implements TatolabUninstall {
  private uninstallInProgress = false;

  /**
   * The uninstall of the app binary at `packagedAppExecutable` — `null` for an unpackaged app, whose
   * bundle is Electron's own and never uninstalled — and of `appConfigDirectory`, named for
   * `appIdentifier`, its machine files removed behind `administratorPrompt`.
   */
  constructor(
    private readonly packagedAppExecutable: string | null,
    private readonly appConfigDirectory: string,
    private readonly appIdentifier: string,
    private readonly administratorPrompt: AdministratorPrompt,
    private readonly tatolabUninstallAppSurface: TatolabUninstallAppSurface,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Uninstall Tatolab from this Mac, ending with the app quitting; refused with the reason when the administrator prompt is cancelled, a step fails, or an uninstall is already under way. */
  async uninstallTatolab(runTatolabSwitch: RunTatolabSwitchToTurnOff): Promise<Result<void, string>> {
    if (this.uninstallInProgress) return failedWith("Tatolab is already being uninstalled");
    this.uninstallInProgress = true;
    const uninstalled = await this.uninstallTatolabFromThisMac(runTatolabSwitch);
    if (!uninstalled.ok) {
      this.tatolabAppLog.warn("Tatolab was not uninstalled", { failure: uninstalled.failure });
      this.uninstallInProgress = false;
    }
    return uninstalled;
  }

  private async uninstallTatolabFromThisMac(runTatolabSwitch: RunTatolabSwitchToTurnOff): Promise<Result<void, string>> {
    const appBundle = this.packagedAppExecutable === null ? null : await appBundleOfTheExecutable(this.packagedAppExecutable);
    if (appBundle === null) return failedWith("this Tatolab is not running from Tatolab.app, so there is no app to uninstall");
    const machineFiles = machineFilesToRemove(tatolabMachinePathsOnMacosForThisBuild(currentProcessUid()), appBundle);
    this.tatolabAppLog.info("uninstalling Tatolab", { app_bundle: appBundle, machine_files: machineFiles.kind });
    const { administratorPrompt, tatolabUninstallAppSurface, appConfigDirectory, appIdentifier, tatolabAppLog } = this;
    return uninstallTatolabInOrder(
      {
        runBehindTheAdministratorPrompt: (removalScript) =>
          administratorPrompt.runBehindOneAdministratorPrompt(removalScript, UNINSTALL_ADMINISTRATOR_PROMPT_TEXT),
        removeTheLocalProofTestRoot: (testMachineRoot) => removeTheDirectoryUnlessAbsent(testMachineRoot),
        turnRunTatolabOff: async () => runTatolabTurnedOff(await runTatolabSwitch.setRunTatolab(false)),
        removeTheAppConfigDirectory: () => removeTheAppConfigDirectoryNamedFor(appConfigDirectory, appIdentifier),
        moveThisAppBundleToTheTrash: async () => {
          const trashed = await tatolabUninstallAppSurface.moveToTheTrash(appBundle);
          return trashed.ok ? trashed : failedWith(`${appBundle} could not be moved to the Trash: ${trashed.failure}`);
        },
        quitTheApp: () => {
          tatolabAppLog.info("Tatolab is uninstalled; quitting the app");
          tatolabUninstallAppSurface.quitTheApp();
        },
      },
      machineFiles,
    );
  }
}
