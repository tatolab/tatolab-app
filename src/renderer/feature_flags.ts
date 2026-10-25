// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/** Frontend-only switches for surfaces the plan has decided on but whose data arrives later. */
export interface TatolabFrontendFeatureFlags {
  /** Search's Watch rows, each opening Graph with that exposed output's preview pinned. */
  watchExposedOutput: boolean;
}

/** The flags this build runs with: off unless the build sets them, or the browser mock asks. */
export function readTatolabFrontendFeatureFlags(isRunningInsideTatolabApp: boolean, pageQuery: URLSearchParams): TatolabFrontendFeatureFlags {
  const builtOn = import.meta.env.VITE_TATOLAB_FEATURE_WATCH_EXPOSED_OUTPUT === "1";
  const mockAsked = !isRunningInsideTatolabApp && pageQuery.getAll("feature").includes("watch-exposed-output");
  return { watchExposedOutput: builtOn || mockAsked };
}
