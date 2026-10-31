// Installing the runtime the app carries when the installed build differs, in either direction:
// opening an app is the choice of its runtime. It asks nothing, keeps the installer's lines for the
// window as they come, and keeps a refusal in the installer's words until it is tried again.

import type { RuntimeInstall } from "../shared/tatolab_backend_contract.js";
import type { CarriedRuntimeInstall } from "./platform/carried_runtime_install.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** What one look at the carried and installed builds did. */
export type CarriedRuntimeInstallOutcome =
  | { kind: "nothing_carried" }
  | { kind: "carried_runtime_unreadable"; refusal: string }
  | { kind: "already_installed" }
  | { kind: "installed" }
  | { kind: "not_installed"; refusal: string };

/** The app's install of its carried runtime, and where it stands for the window. */
export class CarriedRuntimeInstallOnLaunch {
  private runtimeInstall: RuntimeInstall = { kind: "none" };
  private installedRuntimeBuild: string | null = null;

  /** Installs through `carriedRuntimeInstall`, `null` where the app carries no runtime, calling `whenTheRuntimeInstallProgresses` each time where it stands changes. */
  constructor(
    private readonly carriedRuntimeInstall: CarriedRuntimeInstall | null,
    private readonly whenTheRuntimeInstallProgresses: () => void,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Where installing the carried runtime stands. */
  runtimeInstallNow(): RuntimeInstall {
    return this.runtimeInstall;
  }

  /** The build the installer runs, as last read. */
  installedRuntimeBuildNow(): string | null {
    return this.installedRuntimeBuild;
  }

  /** Whether the installer is running now. */
  isInstalling(): boolean {
    return this.runtimeInstall.kind === "installing";
  }

  /** Install the carried runtime when the installed build is another one, or none. */
  async installTheCarriedRuntimeIfItDiffers(): Promise<CarriedRuntimeInstallOutcome> {
    if (this.carriedRuntimeInstall === null) return { kind: "nothing_carried" };
    const builds = await this.carriedRuntimeInstall.carriedAndInstalledRuntimeBuilds();
    if (!builds.ok) {
      const refusal = `The runtime this app carries could not be read: ${builds.failure}`;
      this.installRefused(null, [], refusal);
      return { kind: "carried_runtime_unreadable", refusal };
    }
    const { carriedRuntimeBuild, installedRuntimeBuild } = builds.value;
    this.installedRuntimeBuild = installedRuntimeBuild;
    if (carriedRuntimeBuild === installedRuntimeBuild) {
      this.tatolabAppLog.info("the runtime this app carries is the one installed", { runtime_build: carriedRuntimeBuild });
      this.settle({ kind: "none" });
      return { kind: "already_installed" };
    }
    return this.install(this.carriedRuntimeInstall, carriedRuntimeBuild, installedRuntimeBuild);
  }

  /** "Try again" after a refused install; refused while one runs, and where the app carries no runtime. */
  async installTheCarriedRuntimeAgain(): Promise<Result<CarriedRuntimeInstallOutcome, string>> {
    if (this.carriedRuntimeInstall === null) return failedWith("This build of Tatolab carries no runtime to install.");
    if (this.isInstalling()) return failedWith("The runtime is already being installed.");
    return succeeded(await this.installTheCarriedRuntimeIfItDiffers());
  }

  private async install(
    carriedRuntimeInstall: CarriedRuntimeInstall,
    carriedRuntimeBuild: string,
    installedRuntimeBuild: string | null,
  ): Promise<CarriedRuntimeInstallOutcome> {
    this.tatolabAppLog.info("installing the runtime this app carries", {
      carried_runtime_build: carriedRuntimeBuild,
      installed_runtime_build: installedRuntimeBuild,
    });
    const installerLines: string[] = [];
    this.settle({
      kind: "installing",
      carried_runtime_build: carriedRuntimeBuild,
      installer_lines: [],
    });
    const installed = await carriedRuntimeInstall.installTheCarriedRuntime((installerLine) => {
      installerLines.push(installerLine);
      this.tatolabAppLog.info("runtime installer", {
        installer_line: installerLine,
      });
      this.settle({
        kind: "installing",
        carried_runtime_build: carriedRuntimeBuild,
        installer_lines: [...installerLines],
      });
    });
    const buildsAfter = await carriedRuntimeInstall.carriedAndInstalledRuntimeBuilds();
    if (buildsAfter.ok) this.installedRuntimeBuild = buildsAfter.value.installedRuntimeBuild;
    if (!installed.ok) return this.installRefused(carriedRuntimeBuild, installerLines, installed.failure);
    this.tatolabAppLog.info("the runtime this app carries is installed and answers", { runtime_build: carriedRuntimeBuild });
    this.settle({ kind: "none" });
    return { kind: "installed" };
  }

  private installRefused(
    carriedRuntimeBuild: string | null,
    installerLines: readonly string[],
    refusal: string,
  ): { kind: "not_installed"; refusal: string } {
    this.tatolabAppLog.warn("the runtime this app carries was not installed", {
      carried_runtime_build: carriedRuntimeBuild,
      installed_runtime_build: this.installedRuntimeBuild,
      refusal,
    });
    this.settle({
      kind: "failed",
      carried_runtime_build: carriedRuntimeBuild,
      installer_lines: [...installerLines],
      refusal,
    });
    return { kind: "not_installed", refusal };
  }

  private settle(runtimeInstall: RuntimeInstall): void {
    this.runtimeInstall = runtimeInstall;
    this.whenTheRuntimeInstallProgresses();
  }
}
