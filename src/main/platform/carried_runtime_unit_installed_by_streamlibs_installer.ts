// The runtime unit the app carries, installed by the streamlib `install.sh` it carries beside it,
// which keeps each build in a folder named `<version>-<commit>` and points `current` at the one it
// runs. Each platform lays the unit out its own way: the helper bundle in `Contents/Helpers/` on
// macOS, the release tarball's `bin/`, `lib/` and `streamlib-commit` in the resources on Linux.

import { readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { CarriedAndInstalledRuntimeBuilds, CarriedRuntimeInstall } from "./carried_runtime_install.js";
import { programsOwnWordsOrHowItEnded, programSucceeded, type ProgramCompletion, type ProgramRunner } from "./run_program_to_completion.js";
import type { ProgramRunnerStreamingItsLines } from "./run_program_streaming_its_lines.js";

/** The shell the installer runs under, at its system path. */
const SYSTEM_SHELL = "/bin/sh";

/** How `tatolabd --version` names its version: `tatolabd <version>`. */
const RUNTIME_VERSION_LINE = /^tatolabd (\S+)$/;

/** The link `install.sh` points at the build it runs, inside its install directory. */
const CURRENT_RUNTIME_BUILD_LINK_NAME = "current";

/** How the installer prefixes what it says on standard error. */
const INSTALLER_SAYS_PREFIX = "tatolab install: ";

/** How the installer prefixes a warning, which does not stop it. */
const INSTALLER_WARNING_PREFIX = "tatolab install: warning: ";

/** What the installer refused with, in its own words: its `tatolab install:` lines other than warnings, else how it ended. */
export function theInstallersOwnRefusal(installerRun: ProgramCompletion): string {
  const refusalLines = installerRun.standardError
    .split("\n")
    .filter((standardErrorLine) => standardErrorLine.startsWith(INSTALLER_SAYS_PREFIX) && !standardErrorLine.startsWith(INSTALLER_WARNING_PREFIX));
  return refusalLines.length > 0 ? refusalLines.join("\n") : programsOwnWordsOrHowItEnded("install.sh", installerRun);
}

/** Where this build carries its runtime unit and streamlib's installer, and where the installer installs the unit. */
export interface CarriedRuntimeUnitLayout {
  /** Streamlib's `install.sh`, as the app carries it. */
  readonly carriedInstaller: string;
  /** The folder `install.sh --from-unit` is handed. */
  readonly carriedRuntimeUnit: string;
  /** The carried `tatolabd`, which names its version. */
  readonly carriedRuntimeExecutable: string;
  /** The file naming the streamlib commit the carried unit was built from. */
  readonly carriedStreamlibCommitFile: string;
  /** Where the installer keeps each build and its `current` link. */
  readonly runtimeInstallDirectory: string;
}

/** The runtime unit this build carries, installed by the `install.sh` it carries. */
export class CarriedRuntimeUnitInstalledByStreamlibsInstaller implements CarriedRuntimeInstall {
  /**
   * The unit laid out as `carriedRuntimeUnitLayout`, installed by an installer run with `installerEnvironment` added;
   * `programRunner` asks the carried `tatolabd` its version.
   */
  constructor(
    private readonly carriedRuntimeUnitLayout: CarriedRuntimeUnitLayout,
    private readonly installerEnvironment: Readonly<Record<string, string>>,
    private readonly programRunner: ProgramRunner,
    private readonly programRunnerStreamingItsLines: ProgramRunnerStreamingItsLines,
  ) {}

  async carriedAndInstalledRuntimeBuilds(): Promise<Result<CarriedAndInstalledRuntimeBuilds, string>> {
    const carriedRuntimeBuild = await this.carriedRuntimeBuild();
    if (!carriedRuntimeBuild.ok) return carriedRuntimeBuild;
    const installedRuntimeBuild = await readlink(path.join(this.carriedRuntimeUnitLayout.runtimeInstallDirectory, CURRENT_RUNTIME_BUILD_LINK_NAME)).then(
      (currentLinkTarget) => path.basename(currentLinkTarget),
      () => null,
    );
    return succeeded({
      carriedRuntimeBuild: carriedRuntimeBuild.value,
      installedRuntimeBuild,
    });
  }

  installedRuntimeFolderOf(installedRuntimeBuild: string): string {
    return path.join(this.carriedRuntimeUnitLayout.runtimeInstallDirectory, installedRuntimeBuild);
  }

  async installTheCarriedRuntime(onInstallerLine: (installerLine: string) => void): Promise<Result<void, string>> {
    const { carriedInstaller, carriedRuntimeUnit } = this.carriedRuntimeUnitLayout;
    const installerRun = await this.programRunnerStreamingItsLines(
      SYSTEM_SHELL,
      [carriedInstaller, "--from-unit", carriedRuntimeUnit],
      onInstallerLine,
      this.installerEnvironment,
    );
    if (!installerRun.ok) return installerRun;
    return programSucceeded(installerRun.value) ? succeeded(undefined) : failedWith(theInstallersOwnRefusal(installerRun.value));
  }

  /** The carried build, `<version>-<commit>`, as the installer will name it: the carried `tatolabd`'s version and the commit file beside it. */
  private async carriedRuntimeBuild(): Promise<Result<string, string>> {
    const { carriedRuntimeExecutable: runtimeExecutable, carriedStreamlibCommitFile: streamlibCommitFile } = this.carriedRuntimeUnitLayout;
    const versionRun = await this.programRunner(runtimeExecutable, ["--version"]);
    if (!versionRun.ok) return failedWith(`the runtime the app carries could not be asked its version: ${versionRun.failure}`);
    if (!programSucceeded(versionRun.value)) {
      return failedWith(`the runtime the app carries did not name its version: ${programsOwnWordsOrHowItEnded(runtimeExecutable, versionRun.value)}`);
    }
    const runtimeVersion = RUNTIME_VERSION_LINE.exec(versionRun.value.standardOutput.trim())?.[1];
    if (runtimeVersion === undefined) return failedWith(`the runtime the app carries named no version: ${versionRun.value.standardOutput.trim()}`);
    try {
      const streamlibCommit = (await readFile(streamlibCommitFile, "utf8")).trim();
      if (streamlibCommit === "") return failedWith(`${streamlibCommitFile} names no commit`);
      return succeeded(`${runtimeVersion}-${streamlibCommit}`);
    } catch (readFailure) {
      return failedWith(`${streamlibCommitFile} could not be read: ${describeCaughtFailure(readFailure)}`);
    }
  }
}
