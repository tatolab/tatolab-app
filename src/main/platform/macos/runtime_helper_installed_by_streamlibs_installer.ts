// The runtime helper the app carries in `Contents/Helpers/`, installed by the `install.sh` it
// carries in `Contents/Resources/`, which keeps each build in a folder named `<version>-<commit>`
// and points `current` at the one it runs.

import { readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { CarriedAndInstalledRuntimeBuilds, CarriedRuntimeInstall } from "../carried_runtime_install.js";
import { programsOwnWordsOrHowItEnded, programSucceeded, type ProgramCompletion, type ProgramRunner } from "../run_program_to_completion.js";
import type { ProgramRunnerStreamingItsLines } from "../run_program_streaming_its_lines.js";
import {
  carriedRuntimeInstallerIn,
  carriedRuntimeUnitIn,
  currentRuntimeBuildLinkIn,
  runtimeExecutableInARuntimeUnit,
  streamlibCommitFileInARuntimeUnit,
} from "./tatolab_machine_paths.js";

/** The shell the installer runs under, at its system path. */
const SYSTEM_SHELL = "/bin/sh";

/** How `tatolabd --version` names its version: `tatolabd <version>`. */
const RUNTIME_VERSION_LINE = /^tatolabd (\S+)$/;

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

/** The carried runtime helper installed by the carried `install.sh` into `runtimeInstallDirectory`. */
export class RuntimeHelperInstalledByStreamlibsInstaller implements CarriedRuntimeInstall {
  /**
   * The helper `appBundle` carries, installed into `runtimeInstallDirectory` by an installer run with
   * `installerEnvironment` added; `programRunner` asks the carried `tatolabd` its version.
   */
  constructor(
    private readonly appBundle: string,
    private readonly runtimeInstallDirectory: string,
    private readonly installerEnvironment: Readonly<Record<string, string>>,
    private readonly programRunner: ProgramRunner,
    private readonly programRunnerStreamingItsLines: ProgramRunnerStreamingItsLines,
  ) {}

  async carriedAndInstalledRuntimeBuilds(): Promise<Result<CarriedAndInstalledRuntimeBuilds, string>> {
    const carriedRuntimeBuild = await this.carriedRuntimeBuild();
    if (!carriedRuntimeBuild.ok) return carriedRuntimeBuild;
    const installedRuntimeBuild = await readlink(currentRuntimeBuildLinkIn(this.runtimeInstallDirectory)).then(
      (currentLinkTarget) => path.basename(currentLinkTarget),
      () => null,
    );
    return succeeded({
      carriedRuntimeBuild: carriedRuntimeBuild.value,
      installedRuntimeBuild,
    });
  }

  async installTheCarriedRuntime(onInstallerLine: (installerLine: string) => void): Promise<Result<void, string>> {
    const installer = carriedRuntimeInstallerIn(this.appBundle);
    const installerRun = await this.programRunnerStreamingItsLines(
      SYSTEM_SHELL,
      [installer, "--from-unit", carriedRuntimeUnitIn(this.appBundle)],
      onInstallerLine,
      this.installerEnvironment,
    );
    if (!installerRun.ok) return installerRun;
    return programSucceeded(installerRun.value) ? succeeded(undefined) : failedWith(theInstallersOwnRefusal(installerRun.value));
  }

  /** The carried build, `<version>-<commit>`, as the installer will name it: the carried `tatolabd`'s version and the commit file beside it. */
  private async carriedRuntimeBuild(): Promise<Result<string, string>> {
    const carriedRuntimeUnit = carriedRuntimeUnitIn(this.appBundle);
    const runtimeExecutable = runtimeExecutableInARuntimeUnit(carriedRuntimeUnit);
    const versionRun = await this.programRunner(runtimeExecutable, ["--version"]);
    if (!versionRun.ok) return failedWith(`the runtime the app carries could not be asked its version: ${versionRun.failure}`);
    if (!programSucceeded(versionRun.value)) {
      return failedWith(`the runtime the app carries did not name its version: ${programsOwnWordsOrHowItEnded(runtimeExecutable, versionRun.value)}`);
    }
    const runtimeVersion = RUNTIME_VERSION_LINE.exec(versionRun.value.standardOutput.trim())?.[1];
    if (runtimeVersion === undefined) return failedWith(`the runtime the app carries named no version: ${versionRun.value.standardOutput.trim()}`);
    const streamlibCommitFile = streamlibCommitFileInARuntimeUnit(carriedRuntimeUnit);
    try {
      const streamlibCommit = (await readFile(streamlibCommitFile, "utf8")).trim();
      if (streamlibCommit === "") return failedWith(`${streamlibCommitFile} names no commit`);
      return succeeded(`${runtimeVersion}-${streamlibCommit}`);
    } catch (readFailure) {
      return failedWith(`${streamlibCommitFile} could not be read: ${describeCaughtFailure(readFailure)}`);
    }
  }
}
