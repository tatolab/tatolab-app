import type { TatolabAppBuild } from "../shared/tatolab_backend_contract.js";
import builtTatolabAppBuildFeatures from "./tatolab_app_build_features.json" with { type: "json" };

/** The tatolab-app commit a build was built at, whether the release workflow made it, and whether its checkout had uncommitted changes. */
export interface TatolabAppBuildId {
  tatolabAppCommit: string;
  buildKind: "dev" | "release";
  builtWithUncommittedChanges: boolean;
}

/** What `scripts/tatolab_app_build_features.mjs write` records for a build. */
export interface TatolabAppBuildFeatures {
  machineDirectoriesUnderATestRoot: boolean;
  appUpdateFeedUrl: string;
  /** `null` only in the committed features `electron-vite dev` runs with; the bundle and package checks refuse a build without one. */
  tatolabAppBuildId: TatolabAppBuildId | null;
}

/** The features this build was built with: `out/main/tatolab_app_build_features.json`, as `scripts/tatolab_app_build_features.mjs write` wrote it. */
export const TATOLAB_APP_BUILD_FEATURES: Readonly<TatolabAppBuildFeatures> = builtTatolabAppBuildFeatures;

/** The build id as the window's status carries it, `null` for a build that recorded none. */
export function tatolabAppBuildForTheWindow(tatolabAppBuildId: TatolabAppBuildId | null): TatolabAppBuild | null {
  if (tatolabAppBuildId === null) return null;
  return {
    tatolab_app_commit: tatolabAppBuildId.tatolabAppCommit,
    build_kind: tatolabAppBuildId.buildKind,
    built_with_uncommitted_changes: tatolabAppBuildId.builtWithUncommittedChanges,
  };
}
