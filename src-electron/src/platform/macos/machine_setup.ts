// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// First-launch machine setup: the machine runtime lock `tatolabd` refuses to start without, and
// the PATH link to the bundled CLI. A real build creates whatever is missing behind one
// administrator prompt; a local-proof build prepares its test root with no prompt.

import { constants as fileSystemConstants, type Stats } from "node:fs";
import { chmod, lstat, mkdir, open, readlink } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { MachineSetupState } from "../../../../src/backend/tatolab_backend_contract.js";
import type {
  MachineSetupAdministratorPromptOutcome,
  MachineSetupObservation,
  MachineSetupTrigger,
  TatolabMachineSetup,
} from "../tatolab_machine_setup.js";
import { shellWordForPath, type AdministratorPrompt } from "./administrator_prompt.js";
import { machineRuntimeLockOwnerUid, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

/** The lock directory's mode: every user traverses it to open the lock file, only its owner writes it. `tatolabd` refuses a directory a group or other can write. */
const MACHINE_RUNTIME_LOCK_DIRECTORY_MODE = 0o755;

/** The lock file's mode, exactly: whichever user's runtime starts first takes it. */
const MACHINE_RUNTIME_LOCK_FILE_MODE = 0o666;

/** The bits that let a group or other replace an entry in a directory. */
const GROUP_AND_OTHER_WRITE_BITS = 0o022;

/** The words the machine setup's administrator prompt shows under "Tatolab wants to make changes." */
export const MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT =
  "Tatolab needs to create the machine runtime lock and link the tatolab command so the runtime can start.";

/**
 * One machine-wide piece first-launch setup still has to create or correct: the lock's directory,
 * absent or not a directory its owner alone can write; the lock file, absent or not a regular file
 * its owner owns at exactly 0666; or the PATH link, absent or pointing somewhere other than this
 * bundle's CLI.
 */
export type MissingMachineSetupPiece =
  | { kind: "machine_runtime_lock_directory"; path: string }
  | { kind: "machine_runtime_lock_file"; path: string }
  | { kind: "command_line_tool_link"; linkPath: string; bundledCommandLineTool: string };

function modeAsFourOctalDigits(mode: number): string {
  return mode.toString(8).padStart(4, "0");
}

async function symlinkMetadata(entryPath: string): Promise<Stats | null> {
  return lstat(entryPath).catch(() => null);
}

/** Every piece of machine setup that is missing or wrong for `machinePaths`, given the CLI this bundle carries (none outside a bundle, which links nothing). */
export async function missingMachineSetupPieces(
  machinePaths: TatolabMachinePathsOnMacos,
  bundledCommandLineTool: string | null,
): Promise<MissingMachineSetupPiece[]> {
  const expectedOwnerUid = machineRuntimeLockOwnerUid(machinePaths.machineRuntimeLockOwner);
  const missing: MissingMachineSetupPiece[] = [];
  if (!(await isATrustedLockDirectory(machinePaths.machineRuntimeLockDirectory, expectedOwnerUid))) {
    missing.push({ kind: "machine_runtime_lock_directory", path: machinePaths.machineRuntimeLockDirectory });
  }
  if (!(await isATrustedLockFile(machinePaths.machineRuntimeLockFile, expectedOwnerUid))) {
    missing.push({ kind: "machine_runtime_lock_file", path: machinePaths.machineRuntimeLockFile });
  }
  const linkPath = machinePaths.commandLineToolLink;
  if (linkPath !== null && bundledCommandLineTool !== null) {
    if ((await commandLineToolLinkTarget(linkPath)) !== bundledCommandLineTool) {
      missing.push({ kind: "command_line_tool_link", linkPath, bundledCommandLineTool });
    }
  }
  return missing;
}

/** The PATH link when it points at the CLI this bundle carries, read from the pieces `missingMachineSetupPieces` found `missing`, so it costs no second readlink. */
export function commandLineToolLinkedAt(
  machinePaths: TatolabMachinePathsOnMacos,
  bundledCommandLineTool: string | null,
  missing: readonly MissingMachineSetupPiece[],
): string | null {
  if (bundledCommandLineTool === null || machinePaths.commandLineToolLink === null) return null;
  const linkIsMissing = missing.some((missingPiece) => missingPiece.kind === "command_line_tool_link");
  return linkIsMissing ? null : machinePaths.commandLineToolLink;
}

async function commandLineToolLinkTarget(linkPath: string): Promise<string | null> {
  return readlink(linkPath).catch(() => null);
}

async function isATrustedLockDirectory(directoryPath: string, expectedOwnerUid: number): Promise<boolean> {
  const metadata = await symlinkMetadata(directoryPath);
  return metadata !== null && metadata.isDirectory() && metadata.uid === expectedOwnerUid && (metadata.mode & GROUP_AND_OTHER_WRITE_BITS) === 0;
}

async function isATrustedLockFile(filePath: string, expectedOwnerUid: number): Promise<boolean> {
  const metadata = await symlinkMetadata(filePath);
  return metadata !== null && metadata.isFile() && metadata.uid === expectedOwnerUid && (metadata.mode & 0o7777) === MACHINE_RUNTIME_LOCK_FILE_MODE;
}

/** The one root shell script that creates or corrects every piece in `missing`, each step joined so the first failure stops the rest. */
export function machineSetupAdministratorShellScript(missing: readonly MissingMachineSetupPiece[]): string {
  const steps: string[] = [];
  for (const missingPiece of missing) {
    switch (missingPiece.kind) {
      case "machine_runtime_lock_directory": {
        const directory = shellWordForPath(missingPiece.path);
        steps.push(`if [ -L ${directory} ]; then rm -f ${directory}; fi`);
        steps.push(`mkdir -p ${directory}`);
        steps.push(`chown root:wheel ${directory}`);
        steps.push(`chmod ${modeAsFourOctalDigits(MACHINE_RUNTIME_LOCK_DIRECTORY_MODE)} ${directory}`);
        break;
      }
      case "machine_runtime_lock_file": {
        const file = shellWordForPath(missingPiece.path);
        steps.push(`if [ -L ${file} ]; then rm -f ${file}; fi`);
        steps.push(`touch ${file}`);
        steps.push(`chown root:wheel ${file}`);
        steps.push(`chmod ${modeAsFourOctalDigits(MACHINE_RUNTIME_LOCK_FILE_MODE)} ${file}`);
        break;
      }
      case "command_line_tool_link":
        steps.push(`mkdir -p ${shellWordForPath(path.dirname(missingPiece.linkPath))}`);
        steps.push(`ln -sfn ${shellWordForPath(missingPiece.bundledCommandLineTool)} ${shellWordForPath(missingPiece.linkPath)}`);
        break;
    }
  }
  return steps.join(" && ");
}

/** Creates the pieces it is given behind one administrator prompt, settling once the prompt is answered; a test's fake stands in for the prompt. */
export type MachineSetupAdministratorPromptRunner = (missing: readonly MissingMachineSetupPiece[]) => Promise<Result<void, string>>;

/** Machine setup's runner behind `administratorPrompt`, which says why the setup is unfinished in its own words. */
export function machineSetupBehindOneAdministratorPrompt(administratorPrompt: AdministratorPrompt): MachineSetupAdministratorPromptRunner {
  return async (missing) => {
    if (missing.length === 0) return succeeded(undefined);
    const machineSetup = await administratorPrompt.runBehindOneAdministratorPrompt(
      machineSetupAdministratorShellScript(missing),
      MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT,
    );
    if (machineSetup.ok) return machineSetup;
    return failedWith(
      machineSetup.failure.kind === "cancelled"
        ? "the administrator prompt was cancelled"
        : `machine setup failed: ${machineSetup.failure.failureDescription}`,
    );
  };
}

/** What a local-proof machine root entry must be, not a symlink to one. */
type LocalProofMachineRootEntryKind = "directory" | "regular_file";

/** Prepare a local-proof build's test root as the runtime's test build requires it — the lock directory at 0755 and the lock file at exactly 0666, both owned by this user — with no prompt. */
export async function prepareLocalProofTestMachineRoot(machinePaths: TatolabMachinePathsOnMacos): Promise<Result<void, string>> {
  const expectedOwnerUid = machineRuntimeLockOwnerUid(machinePaths.machineRuntimeLockOwner);
  const lockDirectory = machinePaths.machineRuntimeLockDirectory;
  const lockDirectoryCreated = await mkdir(lockDirectory, { recursive: true }).then(
    () => succeeded(undefined),
    (creationFailure: unknown) => failedWith(localProofRefusal(lockDirectory, `could not be created (${describeCaughtFailure(creationFailure)})`)),
  );
  if (!lockDirectoryCreated.ok) return lockDirectoryCreated;
  const lockDirectoryVerified = await verifyTheOwnerAndSetTheMode(lockDirectory, "directory", expectedOwnerUid, MACHINE_RUNTIME_LOCK_DIRECTORY_MODE);
  if (!lockDirectoryVerified.ok) return lockDirectoryVerified;

  const lockFile = machinePaths.machineRuntimeLockFile;
  const lockFileCreated = await open(
    lockFile,
    fileSystemConstants.O_WRONLY | fileSystemConstants.O_APPEND | fileSystemConstants.O_CREAT | fileSystemConstants.O_NOFOLLOW,
    MACHINE_RUNTIME_LOCK_FILE_MODE,
  ).then(
    (lockFileHandle) =>
      lockFileHandle.close().then(
        () => succeeded(undefined),
        (closeFailure: unknown) => failedWith(localProofRefusal(lockFile, `could not be closed (${describeCaughtFailure(closeFailure)})`)),
      ),
    (creationFailure: unknown) => failedWith(localProofRefusal(lockFile, `could not be created (${describeCaughtFailure(creationFailure)})`)),
  );
  if (!lockFileCreated.ok) return lockFileCreated;
  return verifyTheOwnerAndSetTheMode(lockFile, "regular_file", expectedOwnerUid, MACHINE_RUNTIME_LOCK_FILE_MODE);
}

/** Refuse `entryPath` unless it is an `entryKind` owned by `expectedOwnerUid`, then set its mode to exactly `mode`, which the process umask stripped from any mode it was created with. */
async function verifyTheOwnerAndSetTheMode(
  entryPath: string,
  entryKind: LocalProofMachineRootEntryKind,
  expectedOwnerUid: number,
  mode: number,
): Promise<Result<void, string>> {
  const metadata = await lstat(entryPath).then(
    (entryMetadata) => succeeded(entryMetadata),
    (inspectionFailure: unknown) => failedWith(localProofRefusal(entryPath, `could not be inspected (${describeCaughtFailure(inspectionFailure)})`)),
  );
  if (!metadata.ok) return metadata;
  const entryIsTheKind = entryKind === "directory" ? metadata.value.isDirectory() : metadata.value.isFile();
  if (!entryIsTheKind) {
    return failedWith(localProofRefusal(entryPath, entryKind === "directory" ? "is not a real directory" : "is not a regular file"));
  }
  if (metadata.value.uid !== expectedOwnerUid) return failedWith(localProofRefusal(entryPath, `is owned by uid ${metadata.value.uid}`));
  return chmod(entryPath, mode).then(
    () => succeeded(undefined),
    (modeFailure: unknown) =>
      failedWith(localProofRefusal(entryPath, `could not be set to ${modeAsFourOctalDigits(mode)} (${describeCaughtFailure(modeFailure)})`)),
  );
}

function localProofRefusal(entryPath: string, whatIsWrong: string): string {
  return `the local-proof machine root cannot be prepared: ${entryPath} ${whatIsWrong}`;
}

/** The setup state from whether any setup piece is missing and whether the prompt is showing. */
export function machineSetupStateFrom(machineSetupPiecesMissing: boolean, administratorPromptShowing: boolean): MachineSetupState {
  if (!machineSetupPiecesMissing) return "complete";
  return administratorPromptShowing ? "waiting_for_administrator" : "needs_administrator";
}

/** What this launch has done with the administrator prompt: reconciling the switch never shows it, opening the app shows it at most once, and "Set Up Tatolab…" shows it again on request, never while one is showing. */
export class AdministratorPromptThisLaunch {
  private shownThisLaunch = false;
  private administratorPromptShowing = false;

  /** Whether `trigger` may show the prompt now; if so, it counts as showing. */
  beginPrompt(trigger: MachineSetupTrigger): boolean {
    const promptMayShowNow =
      trigger === "app_opened"
        ? !this.shownThisLaunch && !this.administratorPromptShowing
        : trigger === "user_asked" && !this.administratorPromptShowing;
    if (promptMayShowNow) {
      this.shownThisLaunch = true;
      this.administratorPromptShowing = true;
    }
    return promptMayShowNow;
  }

  /** The prompt was answered, cancelled, or failed to show. */
  finishPrompt(): void {
    this.administratorPromptShowing = false;
  }

  /** Whether the prompt is showing now. */
  showing(): boolean {
    return this.administratorPromptShowing;
  }
}

/** macOS's machine setup: a real build creates whatever is missing behind one administrator prompt, shown at most once per launch when the app opens and again on request; a local-proof build prepares its test root by itself before every reconciliation of the switch. */
export class MachineSetupBehindAnAdministratorPrompt implements TatolabMachineSetup {
  private readonly administratorPromptThisLaunch = new AdministratorPromptThisLaunch();

  private constructor(
    private readonly machinePaths: TatolabMachinePathsOnMacos,
    private readonly bundledCommandLineTool: string | null,
    private readonly machineSetupAdministratorPromptRunner: MachineSetupAdministratorPromptRunner,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The setup of `machinePaths` for the CLI this bundle carries, `null` outside a bundle, shown behind `administratorPrompt`. */
  static create(
    machinePaths: TatolabMachinePathsOnMacos,
    bundledCommandLineTool: string | null,
    administratorPrompt: AdministratorPrompt,
    tatolabAppLog: TatolabAppLog,
  ): MachineSetupBehindAnAdministratorPrompt {
    return MachineSetupBehindAnAdministratorPrompt.withTheAdministratorPromptRunBy(
      machinePaths,
      bundledCommandLineTool,
      machineSetupBehindOneAdministratorPrompt(administratorPrompt),
      tatolabAppLog,
    );
  }

  /** The setup of `machinePaths`, showing its administrator prompt through `machineSetupAdministratorPromptRunner`. */
  static withTheAdministratorPromptRunBy(
    machinePaths: TatolabMachinePathsOnMacos,
    bundledCommandLineTool: string | null,
    machineSetupAdministratorPromptRunner: MachineSetupAdministratorPromptRunner,
    tatolabAppLog: TatolabAppLog,
  ): MachineSetupBehindAnAdministratorPrompt {
    return new MachineSetupBehindAnAdministratorPrompt(machinePaths, bundledCommandLineTool, machineSetupAdministratorPromptRunner, tatolabAppLog);
  }

  async observeMachineSetup(): Promise<MachineSetupObservation> {
    const administratorPromptShowing = this.administratorPromptThisLaunch.showing();
    const missing = await this.missingMachineSetupPieces();
    return {
      machineSetupState: machineSetupStateFrom(missing.length > 0, administratorPromptShowing),
      commandLineToolLinkedAt: commandLineToolLinkedAt(this.machinePaths, this.bundledCommandLineTool, missing),
    };
  }

  async setUpTheMachine(trigger: MachineSetupTrigger): Promise<MachineSetupAdministratorPromptOutcome> {
    if (this.machinePaths.localProofTestMachineRoot !== null) {
      if (trigger === "reconciling_the_switch") await this.prepareTheLocalProofTestRoot();
      return "no_administrator_prompt_shown";
    }
    return this.runMachineSetupBehindTheAdministratorPrompt(trigger);
  }

  setUpTatolabRefusal(): string | null {
    return null;
  }

  private missingMachineSetupPieces(): Promise<MissingMachineSetupPiece[]> {
    return missingMachineSetupPieces(this.machinePaths, this.bundledCommandLineTool);
  }

  private async prepareTheLocalProofTestRoot(): Promise<void> {
    const prepared = await prepareLocalProofTestMachineRoot(this.machinePaths);
    if (!prepared.ok) this.tatolabAppLog.error("the local-proof machine root could not be prepared", { failure: prepared.failure });
  }

  /** Show the administrator prompt for whatever setup is missing, if `trigger` may show it now, settling once it is answered. */
  private async runMachineSetupBehindTheAdministratorPrompt(trigger: MachineSetupTrigger): Promise<MachineSetupAdministratorPromptOutcome> {
    const missing = await this.missingMachineSetupPieces();
    if (missing.length === 0 || !this.administratorPromptThisLaunch.beginPrompt(trigger)) return "no_administrator_prompt_shown";
    this.tatolabAppLog.info("showing the administrator prompt for machine setup", {
      missing: missing.map((missingPiece) => missingPiece.kind).join(","),
      trigger,
    });
    const machineSetup = await this.machineSetupAdministratorPromptRunner(missing);
    this.administratorPromptThisLaunch.finishPrompt();
    if (machineSetup.ok) this.tatolabAppLog.info("machine setup is complete");
    else this.tatolabAppLog.warn("machine setup is unfinished", { failure: machineSetup.failure });
    return "administrator_prompt_shown";
  }
}
