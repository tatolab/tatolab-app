// The bytes of an HTTPS response's body, read a run at a time so a download's progress can be told
// as it goes, and bounded both by the size its headers announce and by the bytes actually read.

import type { BytesDownloadFollowing } from "./package_catalog.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/**
 * The size `response`'s headers announce for its body, in bytes; `null` where they announce none, announce something that is not a count,
 * or encode the body, whose decoded bytes then outnumber the count.
 */
export function bytesTotalAnnouncedBy(response: Response): number | null {
  const announced = response.headers.get("content-length")?.trim() ?? null;
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? "";
  if (announced === null || !/^\d+$/.test(announced) || (encoding !== "" && encoding !== "identity")) return null;
  return Number(announced);
}

/** `response`'s body as bytes, each run read told to `following`; refused once over `largestByteCount`, by its announced size or as it is read. */
export async function bytesOfTheResponse(response: Response, largestByteCount: number, following: BytesDownloadFollowing | null): Promise<Result<Buffer, string>> {
  if (response.status !== 200) return failedWith(`HTTP ${response.status} ${response.statusText}`.trim());
  const bytesTotal = bytesTotalAnnouncedBy(response);
  if (bytesTotal !== null && bytesTotal > largestByteCount) return failedWith(`it is ${bytesTotal} bytes, over the ${largestByteCount} a download may be`);
  if (response.body === null) return succeeded(Buffer.alloc(0));
  const runsRead: Uint8Array[] = [];
  let bytesReadSoFar = 0;
  try {
    for await (const run of response.body) {
      bytesReadSoFar += run.byteLength;
      if (bytesReadSoFar > largestByteCount) return failedWith(`it is over the ${largestByteCount} bytes a download may be`);
      runsRead.push(run);
      following?.bytesRead(bytesReadSoFar, bytesTotal);
    }
  } catch (readFailure) {
    return failedWith(describeCaughtFailure(readFailure));
  }
  return succeeded(Buffer.concat(runsRead, bytesReadSoFar));
}
