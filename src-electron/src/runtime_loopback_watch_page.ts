// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The runtime's loopback HTTP, which serves the preview page that plays an exposed output:
// `GET /watch/<machine>/<stream>/<node>/<port>`. A release `tatolabd` binds it at a fixed address,
// StreamLib's `LOOPBACK_HTTP_LISTENER_DEFAULT_PORT`; the local API does not serve the address. A
// test-root runtime binds `TATOLAB_TEST_LOOPBACK_HTTP_PORT` instead, and serves none without it.

import { TATOLAB_APP_BUILD_FEATURES } from "./tatolab_app_build_features.js";

/** Where a release runtime serves its loopback HTTP. */
export const RUNTIME_LOOPBACK_HTTP_ORIGIN = "http://127.0.0.1:4446";

/** The port a local-proof runtime serves its loopback HTTP on: `assemble-tatolab-app-bundle.sh` gives the local-proof launch agent `TATOLAB_TEST_LOOPBACK_HTTP_PORT=14446`. */
export const LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT = 14446;

/** The loopback HTTP origin of the runtime this build reads: the release address, or the local-proof port under the test root. */
export function runtimeLoopbackHttpOriginForThisBuild(): string {
  return runtimeLoopbackHttpOriginFor(TATOLAB_APP_BUILD_FEATURES.machineDirectoriesUnderATestRoot);
}

/** The loopback HTTP origin of a release runtime, or of a local-proof one when `machineDirectoriesUnderATestRoot`. */
export function runtimeLoopbackHttpOriginFor(machineDirectoriesUnderATestRoot: boolean): string {
  return machineDirectoriesUnderATestRoot ? `http://127.0.0.1:${LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT}` : RUNTIME_LOOPBACK_HTTP_ORIGIN;
}

/** The preview page of the output `<machine>/<stream>/<node>/<port>` at `runtimeLoopbackHttpOrigin`, each part one path segment. */
export function runtimeWatchPageUrl(runtimeLoopbackHttpOrigin: string, addressParts: { machine: string; stream: string; node: string; port: string }): string {
  const { machine, stream, node, port } = addressParts;
  return `${runtimeLoopbackHttpOrigin}/watch/${[machine, stream, node, port].map((addressPart) => encodeURIComponent(addressPart)).join("/")}`;
}
