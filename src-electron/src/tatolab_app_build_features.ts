// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/** What this build of the app was built with: `machineDirectoriesUnderATestRoot` keeps every machine directory under the local-proof test root and is never shipped. */
export const TATOLAB_APP_BUILD_FEATURES = { machineDirectoriesUnderATestRoot: false } as const;
