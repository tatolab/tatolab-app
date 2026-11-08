import { net } from "electron";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";
import type { FetchTextOverHttps } from "../package_catalog.js";

/** Fetches through Chromium's network stack, so the system's proxy settings and certificate store apply as they do in a browser. */
export const fetchTextOverHttpsThroughElectron: FetchTextOverHttps = async (url) => {
  try {
    const response = await net.fetch(url, { cache: "no-cache" });
    if (response.status !== 200) return failedWith(`HTTP ${response.status} ${response.statusText}`.trim());
    return succeeded(await response.text());
  } catch (fetchFailure) {
    return failedWith(describeCaughtFailure(fetchFailure));
  }
};
