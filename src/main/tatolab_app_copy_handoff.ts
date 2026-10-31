// A copy of Tatolab opened while another runs hands the running one its build through Electron's
// single-instance lock; a different build makes the running copy quit and open the new one.

import { readFile } from "node:fs/promises";
import type { TatolabAppBuild } from "../shared/tatolab_backend_contract.js";

/** One copy of Tatolab on disk: which build it is and the executable that opens it. */
export interface TatolabAppCopy {
  readonly executableThatOpensTheCopy: string;
  readonly appVersion: string;
  readonly appBuild: TatolabAppBuild | null;
  /** The streamlib commit of the runtime the copy carries; `null` for a copy that carries none. */
  readonly carriedStreamlibCommit: string | null;
}

/** What a copy opened while another runs hands it as the single-instance lock's additional data. */
export interface TatolabAppCopyOnTheSingleInstanceLock {
  tatolab_app_copy: {
    executable_that_opens_the_copy: string;
    app_version: string;
    app_build: TatolabAppBuild | null;
    carried_streamlib_commit: string | null;
  };
}

/** `tatolabAppCopy` as the additional data the single-instance lock carries to the running copy. */
export function tatolabAppCopyOnTheSingleInstanceLock(tatolabAppCopy: TatolabAppCopy): TatolabAppCopyOnTheSingleInstanceLock {
  return {
    tatolab_app_copy: {
      executable_that_opens_the_copy: tatolabAppCopy.executableThatOpensTheCopy,
      app_version: tatolabAppCopy.appVersion,
      app_build: tatolabAppCopy.appBuild,
      carried_streamlib_commit: tatolabAppCopy.carriedStreamlibCommit,
    },
  };
}

function isAnObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null;
}

function appBuildHandedOver(appBuildOnTheLock: unknown): TatolabAppBuild | null | undefined {
  if (appBuildOnTheLock === null) return null;
  if (!isAnObject(appBuildOnTheLock)) return undefined;
  const { tatolab_app_commit, build_kind, built_with_uncommitted_changes } = appBuildOnTheLock;
  if (typeof tatolab_app_commit !== "string" || typeof built_with_uncommitted_changes !== "boolean") return undefined;
  if (build_kind !== "dev" && build_kind !== "release") return undefined;
  return { tatolab_app_commit, build_kind, built_with_uncommitted_changes };
}

/** The copy an opened Tatolab handed over on the single-instance lock; `null` when it handed none, as a copy older than the handoff does. */
export function tatolabAppCopyHandedOverOnTheSingleInstanceLock(additionalDataOnTheLock: unknown): TatolabAppCopy | null {
  if (!isAnObject(additionalDataOnTheLock)) return null;
  const copyOnTheLock = additionalDataOnTheLock["tatolab_app_copy"];
  if (!isAnObject(copyOnTheLock)) return null;
  const { executable_that_opens_the_copy, app_version, app_build, carried_streamlib_commit } = copyOnTheLock;
  if (typeof executable_that_opens_the_copy !== "string" || executable_that_opens_the_copy === "") return null;
  if (typeof app_version !== "string") return null;
  if (carried_streamlib_commit !== null && typeof carried_streamlib_commit !== "string") return null;
  const appBuild = appBuildHandedOver(app_build);
  if (appBuild === undefined) return null;
  return {
    executableThatOpensTheCopy: executable_that_opens_the_copy,
    appVersion: app_version,
    appBuild,
    carriedStreamlibCommit: carried_streamlib_commit,
  };
}

/**
 * Whether the opened copy is another build than the running one: another app version, tatolab-app commit or carried
 * streamlib commit. A build with uncommitted changes is never the same as another, since its commits do not name it.
 * A copy without a build id, as `electron-vite dev` runs, cannot be compared and counts as the same.
 */
export function isAnotherBuildOfTatolab(runningCopy: TatolabAppCopy, openedCopy: TatolabAppCopy): boolean {
  if (runningCopy.appBuild === null || openedCopy.appBuild === null) return false;
  if (runningCopy.appBuild.built_with_uncommitted_changes || openedCopy.appBuild.built_with_uncommitted_changes) return true;
  return (
    runningCopy.appVersion !== openedCopy.appVersion ||
    runningCopy.appBuild.tatolab_app_commit !== openedCopy.appBuild.tatolab_app_commit ||
    runningCopy.carriedStreamlibCommit !== openedCopy.carriedStreamlibCommit
  );
}

/** The streamlib commit `streamlibCommitFile` names; `null` when the app carries no runtime, so no such file, or it names none. */
export async function streamlibCommitTheAppCarries(streamlibCommitFile: string | null): Promise<string | null> {
  if (streamlibCommitFile === null) return null;
  try {
    const streamlibCommit = (await readFile(streamlibCommitFile, "utf8")).trim();
    return streamlibCommit === "" ? null : streamlibCommit;
  } catch {
    return null;
  }
}
