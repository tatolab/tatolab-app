// The runtime's loopback HTTP, which serves the preview page that plays an exposed output:
// `GET /watch/<machine>/<stream>/<node>/<port>`. A release `tatolabd` binds it at a fixed address,
// StreamLib's `LOOPBACK_HTTP_LISTENER_DEFAULT_PORT`; the local API does not serve the address. A
// test-root runtime binds `TATOLAB_TEST_LOOPBACK_HTTP_PORT` instead, and serves none without it.

import { TATOLAB_APP_BUILD_FEATURES } from "./tatolab_app_build_features.js";

/** The port a release runtime serves its loopback HTTP on. */
const RUNTIME_LOOPBACK_HTTP_PORT = 4446;

/** The port a local-proof runtime serves its loopback HTTP on: `assemble-tatolab-app-bundle.sh` gives the local-proof launch agent `TATOLAB_TEST_LOOPBACK_HTTP_PORT=14446`. */
const LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT = 14446;

/** The path every preview page sits under. */
const RUNTIME_WATCH_PAGE_PATH_PREFIX = "/watch/";

function runtimeLoopbackHttpOriginOnPort(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** Where a release runtime serves its loopback HTTP. */
export const RUNTIME_LOOPBACK_HTTP_ORIGIN = runtimeLoopbackHttpOriginOnPort(RUNTIME_LOOPBACK_HTTP_PORT);

/** The loopback HTTP origin of the runtime this build reads: the release address, or the local-proof port under the test root. */
export function runtimeLoopbackHttpOriginForThisBuild(): string {
  return runtimeLoopbackHttpOriginFor(TATOLAB_APP_BUILD_FEATURES.machineDirectoriesUnderATestRoot);
}

/** The loopback HTTP origin of a release runtime, or of a local-proof one when `machineDirectoriesUnderATestRoot`. */
export function runtimeLoopbackHttpOriginFor(machineDirectoriesUnderATestRoot: boolean): string {
  return machineDirectoriesUnderATestRoot ? runtimeLoopbackHttpOriginOnPort(LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT) : RUNTIME_LOOPBACK_HTTP_ORIGIN;
}

/** The preview page of the output `<machine>/<stream>/<node>/<port>` at `runtimeLoopbackHttpOrigin`, each part one path segment. */
export function runtimeWatchPageUrl(runtimeLoopbackHttpOrigin: string, addressParts: { machine: string; stream: string; node: string; port: string }): string {
  const { machine, stream, node, port } = addressParts;
  return `${runtimeLoopbackHttpOrigin}${RUNTIME_WATCH_PAGE_PATH_PREFIX}${[machine, stream, node, port].map((addressPart) => encodeURIComponent(addressPart)).join("/")}`;
}

/** Whether `navigationUrl` is a preview page at `runtimeLoopbackHttpOrigin`: the one place a frame the window embeds may go. */
export function isOnTheRuntimesWatchPage(runtimeLoopbackHttpOrigin: string, navigationUrl: string): boolean {
  if (!URL.canParse(runtimeLoopbackHttpOrigin) || !URL.canParse(navigationUrl)) return false;
  const navigationLocation = new URL(navigationUrl);
  return navigationLocation.origin === new URL(runtimeLoopbackHttpOrigin).origin && navigationLocation.pathname.startsWith(RUNTIME_WATCH_PAGE_PATH_PREFIX);
}
