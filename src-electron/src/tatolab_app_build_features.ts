// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/**
 * What this build of the app was built with: `machineDirectoriesUnderATestRoot` keeps every machine directory
 * under the local-proof test root and is never shipped; `appUpdateFeedUrl` is where the app reads
 * `latest-mac.yml` and `latest-linux.yml`, a local feed only in a local-proof build.
 */
export const TATOLAB_APP_BUILD_FEATURES = { machineDirectoriesUnderATestRoot: false, appUpdateFeedUrl: "https://get.tatolab.com/app/" } as const;
