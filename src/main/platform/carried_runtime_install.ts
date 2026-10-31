// The seam between opening the app and streamlib's installer: the runtime build the app carries,
// the one the installer runs, and installing the carried one when they differ.

import type { Result } from "../result.js";

/** The runtime build the app carries and the one installed, each as the installer names its folder, `<version>-<commit>`. */
export interface CarriedAndInstalledRuntimeBuilds {
  readonly carriedRuntimeBuild: string;
  /** `null` before the installer has installed any build. */
  readonly installedRuntimeBuild: string | null;
}

/** Installs the runtime the app carries with streamlib's installer. */
export interface CarriedRuntimeInstall {
  /** The build the app carries and the build installed now; refused when the carried runtime cannot name its build. */
  carriedAndInstalledRuntimeBuilds(): Promise<Result<CarriedAndInstalledRuntimeBuilds, string>>;

  /** The folder the installer installs `installedRuntimeBuild` in. */
  installedRuntimeFolderOf(installedRuntimeBuild: string): string;

  /** Run the installer on the carried runtime to its end, handing each line it writes to `onInstallerLine`; refused in the installer's own words. */
  installTheCarriedRuntime(onInstallerLine: (installerLine: string) => void): Promise<Result<void, string>>;
}
