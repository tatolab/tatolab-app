// "Uninstall Tato Studio…" on macOS: the runtime, its launch agent and its links go, and the runtime's
// state directory, `~/Library/Application Support/Tatolab`, stays. A `/usr/local/bin/tatolab`
// linking into this bundle or the installed runtime, which only root may remove, goes first, behind
// one administrator prompt shown only when that link is there, so a cancelled prompt changes
// nothing. Then "Run Tatolab" is turned off, which unloads the runtime's agent and stops the
// runtime, the installer's `--uninstall` removes the installed runtime, its agent and its link, the
// app's own config directory is removed, the bundle goes to the Trash, and the app quits. A
// local-proof build removes its test root instead of running the installer.

import type { RmOptions } from "node:fs";
import { readlink, rm } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import { programSucceeded, type ProgramRunner } from "../run_program_to_completion.js";
import type { RunTatolabReconciliation } from "../../run_tatolab_switch.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { RunTatolabSwitchToTurnOff, TatolabUninstall } from "../tatolab_uninstall.js";
import { shellWordForPath, type AdministratorPrompt, type AdministratorPromptFailure } from "./administrator_prompt.js";
import { theInstallersOwnRefusal } from "../carried_runtime_unit_installed_by_streamlibs_installer.js";
import { appBundleOfTheExecutable, carriedRuntimeInstallerIn, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

/** The shell the installer runs under, at its system path. */
const SYSTEM_SHELL = "/bin/sh";

/** The words the uninstall's administrator prompt shows under "osascript wants to make changes." */
export const UNINSTALL_ADMINISTRATOR_PROMPT_TEXT = "Tato Studio needs to remove the tatolab command from /usr/local/bin to uninstall.";

/**
 * What uninstalling removes outside the app's own folders: for a real build, what the carried installer at
 * `runtimeInstaller` installed, with no prompt, after a root script behind one administrator prompt when
 * `/usr/local/bin/tatolab` links into Tatolab (`null` when it does not); or a local-proof build's test root, with no prompt.
 */
export type MachineFilesToRemove =
  | {
      kind: "this_users_and_the_machines";
      runtimeInstaller: string;
      removalScriptBehindTheAdministratorPrompt: string | null;
    }
  | { kind: "local_proof_test_root"; testMachineRoot: string };

/** The steps uninstalling takes, in the order `uninstallTatolabInOrder` takes them; a fake records them in tests. */
export interface TatolabUninstallSteps {
  /** Run `removalScript` as root behind one administrator prompt. */
  runBehindTheAdministratorPrompt(removalScript: string): Promise<Result<void, AdministratorPromptFailure>>;
  /** Run the installer at `runtimeInstaller` with `--uninstall`, which removes the installed runtime, its agent and its link, with no prompt. */
  uninstallTheInstalledRuntime(runtimeInstaller: string): Promise<Result<void, string>>;
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

/**
 * Uninstall Tatolab in order — root's files first so a cancelled prompt changes nothing, then the runtime's agent, the
 * rest of `machineFiles`, the app's config directory and its bundle — and quit. The first step that fails stops the
 * rest and is the answer.
 */
export async function uninstallTatolabInOrder(steps: TatolabUninstallSteps, machineFiles: MachineFilesToRemove): Promise<Result<void, string>> {
  if (machineFiles.kind === "this_users_and_the_machines") {
    const rootsFilesRemoved = await removeWhatOnlyRootMayRemove(steps, machineFiles.removalScriptBehindTheAdministratorPrompt);
    if (!rootsFilesRemoved.ok) return rootsFilesRemoved;
  }
  for (const uninstallStep of [
    () => steps.turnRunTatolabOff(),
    () =>
      machineFiles.kind === "this_users_and_the_machines"
        ? steps.uninstallTheInstalledRuntime(machineFiles.runtimeInstaller)
        : steps.removeTheLocalProofTestRoot(machineFiles.testMachineRoot),
    () => steps.removeTheAppConfigDirectory(),
    () => steps.moveThisAppBundleToTheTrash(),
  ]) {
    const stepTaken = await uninstallStep();
    if (!stepTaken.ok) return stepTaken;
  }
  steps.quitTheApp();
  return succeeded(undefined);
}

/** Run `removalScript` behind the administrator prompt; nothing, with no prompt, when there is no script. */
async function removeWhatOnlyRootMayRemove(steps: TatolabUninstallSteps, removalScript: string | null): Promise<Result<void, string>> {
  if (removalScript === null) return succeeded(undefined);
  const removed = await steps.runBehindTheAdministratorPrompt(removalScript);
  if (removed.ok) return removed;
  return failedWith(
    removed.failure.kind === "cancelled"
      ? "the administrator prompt was cancelled, so nothing was uninstalled"
      : `the machine's Tatolab files could not be removed: ${removed.failure.failureDescription}`,
  );
}

/** Whether the link at `linkPath` points into one of `tatolabFolders`. */
async function linksIntoTatolab(linkPath: string, tatolabFolders: readonly string[]): Promise<boolean> {
  const linkTarget = await readlink(linkPath).catch(() => null);
  return linkTarget !== null && tatolabFolders.some((tatolabFolder) => linkTarget.startsWith(`${tatolabFolder}/`));
}

/** What uninstalling removes outside the app's own folders for `machinePaths`, the app being the bundle at `appBundle`. */
export async function machineFilesToRemove(machinePaths: TatolabMachinePathsOnMacos, appBundle: string): Promise<MachineFilesToRemove> {
  if (machinePaths.localProofTestMachineRoot !== null) {
    return { kind: "local_proof_test_root", testMachineRoot: machinePaths.localProofTestMachineRoot };
  }
  const tatolabFolders = [appBundle, machinePaths.runtimeInstallDirectory];
  const usrLocalBinLink = machinePaths.commandLineToolUsrLocalBinLink;
  const usrLocalBinLinkToRemove = usrLocalBinLink !== null && (await linksIntoTatolab(usrLocalBinLink, tatolabFolders)) ? usrLocalBinLink : null;
  return {
    kind: "this_users_and_the_machines",
    runtimeInstaller: carriedRuntimeInstallerIn(appBundle),
    removalScriptBehindTheAdministratorPrompt: tatolabUninstallAdministratorShellScript(usrLocalBinLinkToRemove, tatolabFolders),
  };
}

/** The root shell script uninstalling runs, or `null` with no `/usr/local/bin` link to remove: it removes `usrLocalBinLink` only while it points into one of `tatolabFolders`. */
export function tatolabUninstallAdministratorShellScript(usrLocalBinLink: string | null, tatolabFolders: readonly string[]): string | null {
  if (usrLocalBinLink === null) return null;
  const link = shellWordForPath(usrLocalBinLink);
  const intoTatolab = tatolabFolders.map((tatolabFolder) => `${shellWordForPath(tatolabFolder)}/*`).join(" | ");
  return `case "$(readlink ${link})" in ${intoTatolab}) rm -f ${link} ;; esac`;
}

/** Run the installer at `runtimeInstaller` with `--uninstall` and `installerEnvironment` through `programRunner`; refused in its own words. */
async function uninstallTheRuntimeWithItsInstaller(
  programRunner: ProgramRunner,
  runtimeInstaller: string,
  installerEnvironment: Readonly<Record<string, string>>,
): Promise<Result<void, string>> {
  const uninstalled = await programRunner(SYSTEM_SHELL, [runtimeInstaller, "--uninstall"], {
    environmentVariablesLeftOut: [],
    environmentVariablesAdded: installerEnvironment,
  });
  if (!uninstalled.ok) return failedWith(`the runtime's installer could not be run: ${uninstalled.failure}`);
  return programSucceeded(uninstalled.value)
    ? succeeded(undefined)
    : failedWith(`the runtime could not be uninstalled: ${theInstallersOwnRefusal(uninstalled.value)}`);
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

/** Remove `removalPath` as `rmOptions` say, refused naming it. */
function removedOrRefused(removalPath: string, rmOptions: RmOptions): Promise<Result<void, string>> {
  return rm(removalPath, rmOptions).then(
    () => succeeded(undefined),
    (removalFailure: unknown) => failedWith(`${removalPath} could not be removed: ${describeCaughtFailure(removalFailure)}`),
  );
}

/** Remove `directory` and everything in it; one that is not there is already removed. */
function removeTheDirectoryUnlessAbsent(directory: string): Promise<Result<void, string>> {
  return removedOrRefused(directory, { recursive: true, force: true });
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
   * The uninstall of `machinePaths`, of the app binary at `packagedAppExecutable` — `null` for an
   * unpackaged app, whose bundle is Electron's own and never uninstalled — and of
   * `appConfigDirectory`, named for `appIdentifier`, its machine files removed behind
   * `administratorPrompt` and by the installer `programRunner` runs.
   */
  constructor(
    private readonly machinePaths: TatolabMachinePathsOnMacos,
    private readonly packagedAppExecutable: string | null,
    private readonly appConfigDirectory: string,
    private readonly appIdentifier: string,
    private readonly administratorPrompt: AdministratorPrompt,
    private readonly programRunner: ProgramRunner,
    private readonly tatolabUninstallAppSurface: TatolabUninstallAppSurface,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Uninstall Tatolab from this Mac, ending with the app quitting; refused with the reason when the administrator prompt is cancelled, a step fails, or an uninstall is already under way. */
  async uninstallTatolab(runTatolabSwitch: RunTatolabSwitchToTurnOff): Promise<Result<void, string>> {
    if (this.uninstallInProgress) return failedWith("Tato Studio is already being uninstalled");
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
    if (appBundle === null) return failedWith("this copy of Tato Studio is not running from its app bundle, so there is no app to uninstall");
    const machineFiles = await machineFilesToRemove(this.machinePaths, appBundle);
    this.tatolabAppLog.info("uninstalling Tatolab", { app_bundle: appBundle, machine_files: machineFiles.kind });
    const { administratorPrompt, programRunner, machinePaths, tatolabUninstallAppSurface, appConfigDirectory, appIdentifier, tatolabAppLog } = this;
    return uninstallTatolabInOrder(
      {
        runBehindTheAdministratorPrompt: (removalScript) =>
          administratorPrompt.runBehindOneAdministratorPrompt(removalScript, UNINSTALL_ADMINISTRATOR_PROMPT_TEXT),
        uninstallTheInstalledRuntime: (runtimeInstaller) =>
          uninstallTheRuntimeWithItsInstaller(programRunner, runtimeInstaller, machinePaths.runtimeInstallerEnvironment),
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
