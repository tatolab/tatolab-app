// Where a URL sits against a page's location: on the same scheme and host, under one of the paths
// served there. A custom scheme's URL origin is the opaque "null", which every file:, data: and
// custom-scheme URL shares, so scheme and host are compared rather than origins.

import { TATOLAB_WINDOW_PAGE_HOST, TATOLAB_WINDOW_PAGE_SCHEME } from "../shared/tatolab_electron_bridge_contract.js";

/** The root of the window page's own scheme and host, `tatolab-app://app/`, where the app serves the window and every view. */
export const TATOLAB_WINDOW_PAGE_ROOT_URL = `${TATOLAB_WINDOW_PAGE_SCHEME}://${TATOLAB_WINDOW_PAGE_HOST}/`;

/** Whether `url` is on the scheme and host of `locationUrl` with a path that starts with `pathPrefix`; `false` when either is not a URL. */
export function isOnTheLocationUnderThePath(locationUrl: string, url: string, pathPrefix: string): boolean {
  if (!URL.canParse(locationUrl) || !URL.canParse(url)) return false;
  const location = new URL(locationUrl);
  const parsedUrl = new URL(url);
  return parsedUrl.protocol === location.protocol && parsedUrl.host === location.host && parsedUrl.pathname.startsWith(pathPrefix);
}
