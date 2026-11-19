import { net } from "electron";
import { bytesOfTheResponse } from "../https_response_bytes.js";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";
import type { FetchBytesOverHttps, FetchTextOverHttps } from "../package_catalog.js";

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

/**
 * Fetches through Chromium's network stack as `fetchTextOverHttpsThroughElectron` does, reading the body a run of bytes at a time to tell
 * `following` each, and refusing a body over `largestByteCount` by its `Content-Length` and by the bytes read.
 */
export const fetchBytesOverHttpsThroughElectron: FetchBytesOverHttps = async (url, largestByteCount, following) => {
  try {
    const response = await net.fetch(url, { cache: "no-cache", ...(following === null ? {} : { signal: following.stopped }) });
    return await bytesOfTheResponse(response, largestByteCount, following);
  } catch (fetchFailure) {
    return failedWith(describeCaughtFailure(fetchFailure));
  }
};
