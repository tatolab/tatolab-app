import { net } from "electron";
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

/** Fetches through Chromium's network stack as `fetchTextOverHttpsThroughElectron` does, refusing a body over `largestByteCount` by its `Content-Length` and by the bytes read. */
export const fetchBytesOverHttpsThroughElectron: FetchBytesOverHttps = async (url, largestByteCount) => {
  try {
    const response = await net.fetch(url, { cache: "no-cache" });
    if (response.status !== 200) return failedWith(`HTTP ${response.status} ${response.statusText}`.trim());
    const announcedByteCount = Number(response.headers.get("content-length") ?? "0");
    if (announcedByteCount > largestByteCount) return failedWith(`it is ${announcedByteCount} bytes, over the ${largestByteCount} a download may be`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > largestByteCount) return failedWith(`it is ${body.length} bytes, over the ${largestByteCount} a download may be`);
    return succeeded(body);
  } catch (fetchFailure) {
    return failedWith(describeCaughtFailure(fetchFailure));
  }
};
