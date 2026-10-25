// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import builtTatolabAppBuildFeatures from "./tatolab_app_build_features.json" with { type: "json" };

/**
 * What this build of the app was built with, as `scripts/tatolab_app_build_features.mjs write` wrote it into
 * `out/main/` (the committed JSON beside this file holds the shipping features):
 * `machineDirectoriesUnderATestRoot` keeps every machine directory under the local-proof test root and is never
 * shipped; `appUpdateFeedUrl` is where the app reads `latest-mac.yml` and `latest-linux.yml`, a local feed only in
 * a local-proof build.
 */
export const TATOLAB_APP_BUILD_FEATURES: Readonly<typeof builtTatolabAppBuildFeatures> = builtTatolabAppBuildFeatures;
