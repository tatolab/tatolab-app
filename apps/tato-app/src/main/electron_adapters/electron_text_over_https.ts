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

/**
 * Fetches through Chromium's network stack as `fetchTextOverHttpsThroughElectron` does, reading the body a run of bytes at a time to tell
 * `following` each, and refusing a body over `largestByteCount` by its `Content-Length` and by the bytes read.
 */
export const fetchBytesOverHttpsThroughElectron: FetchBytesOverHttps = async (url, largestByteCount, following) => {
  try {
    const response = await net.fetch(url, { cache: "no-cache", ...(following === null ? {} : { signal: following.stopped }) });
    if (response.status !== 200) return failedWith(`HTTP ${response.status} ${response.statusText}`.trim());
    const announced = response.headers.get("content-length");
    // A Content-Length that is not a count of bytes says nothing of the size, so the download goes on as one of no known size.
    const announcedByteCount = announced !== null && /^\d+$/.test(announced.trim()) ? Number(announced.trim()) : null;
    if (announcedByteCount !== null && announcedByteCount > largestByteCount) return failedWith(`it is ${announcedByteCount} bytes, over the ${largestByteCount} a download may be`);
    if (response.body === null) return succeeded(Buffer.alloc(0));
    const runsRead: Uint8Array[] = [];
    let bytesReadSoFar = 0;
    for await (const run of response.body) {
      bytesReadSoFar += run.byteLength;
      if (bytesReadSoFar > largestByteCount) return failedWith(`it is over the ${largestByteCount} bytes a download may be`);
      runsRead.push(run);
      following?.bytesRead(bytesReadSoFar, announcedByteCount);
    }
    return succeeded(Buffer.concat(runsRead));
  } catch (fetchFailure) {
    return failedWith(describeCaughtFailure(fetchFailure));
  }
};
