import type { RuntimeInstall } from "../../shared/tatolab_backend_contract";

/** How many characters of a build's streamlib commit the window shows, as git abbreviates one. */
const SHOWN_STREAMLIB_COMMIT_LENGTH = 7;

/** The runtime install over the whole window: what it says, the installer's lines so far, and what it offers. */
export interface RuntimeInstallOverlayPresentation {
  stage: "installing" | "failed";
  heading: string;
  /** The line under the heading: the build being installed, and what happens to streams. */
  explanation: string;
  installerLines: readonly string[];
  /** The installer's refusal in its own words; `null` while it runs. */
  refusal: string | null;
}

/** A build as the installer names its folder, `<version>-<commit>`, as the window shows it: `0.68.0 (1a2b3c4)`; a name of another shape as it is. */
export function presentRuntimeBuild(runtimeBuild: string): string {
  const versionAndCommit = /^(.+)-([0-9a-f]{40})$/.exec(runtimeBuild);
  if (versionAndCommit === null) return runtimeBuild;
  const [, version = "", streamlibCommit = ""] = versionAndCommit;
  return `${version} (${streamlibCommit.slice(0, SHOWN_STREAMLIB_COMMIT_LENGTH)})`;
}

/** The overlay for `runtimeInstall`, or `null` when no install is under way or refused. */
export function presentRuntimeInstallOverlay(runtimeInstall: RuntimeInstall): RuntimeInstallOverlayPresentation | null {
  switch (runtimeInstall.kind) {
    case "none":
      return null;
    case "installing":
      return {
        stage: "installing",
        heading: "Updating the runtime",
        explanation: `This copy of Spudnik Studio carries runtime ${presentRuntimeBuild(runtimeInstall.carried_runtime_build)}. Your streams stop for a moment and come back on it.`,
        installerLines: runtimeInstall.installer_lines,
        refusal: null,
      };
    case "failed":
      return {
        stage: "failed",
        heading: "The runtime didn't update",
        explanation:
          runtimeInstall.carried_runtime_build === null
            ? "Spudnik Studio couldn't read the runtime this copy carries, so nothing was installed."
            : `Runtime ${presentRuntimeBuild(runtimeInstall.carried_runtime_build)} wasn't installed. The installer says why below.`,
        installerLines: runtimeInstall.installer_lines,
        refusal: runtimeInstall.refusal,
      };
  }
}
