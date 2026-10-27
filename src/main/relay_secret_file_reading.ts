// A relay secret read from a file the person chooses in the app's own dialog, as moq.pro hands a
// project's signing key over as a downloaded file. Its text goes to the window once, to be sent
// to the runtime as a typed secret is; it is never logged and never kept.

import { open, type FileHandle } from "node:fs/promises";
import { isUtf8 } from "node:buffer";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The desktop's file dialog for a relay secret; `null` when the person cancels, refused in its words when it does not open. */
export type RelaySecretFileDialog = () => Promise<Result<string | null, string>>;

/** The largest file read as a relay secret: a signing key or a token is a few hundred bytes. */
export const LARGEST_RELAY_SECRET_FILE_BYTES = 64 * 1024;

/** Why `filePath` could not be read: the system's error code where it gives one, which names the cause without naming the path twice. */
function whyTheFileCouldNotBeRead(filePath: string, caughtFailure: unknown): string {
  const errorCode = typeof caughtFailure === "object" && caughtFailure !== null && "code" in caughtFailure ? caughtFailure.code : undefined;
  return `${filePath} could not be read: ${typeof errorCode === "string" ? errorCode : describeCaughtFailure(caughtFailure)}`;
}

/**
 * The text of the file the person chooses through `relaySecretFileDialog`, or `null` when they cancel. Only a regular file
 * is read, and never more than one byte past the limit, so a file that grows, a FIFO or a device cannot hold the answer up;
 * one too large or not UTF-8 text is refused by its name.
 */
export async function readTheRelaySecretFileThePersonChooses(relaySecretFileDialog: RelaySecretFileDialog): Promise<Result<{ text: string } | null, string>> {
  const chosenFile = await relaySecretFileDialog();
  if (!chosenFile.ok) return chosenFile;
  if (chosenFile.value === null) return succeeded(null);
  const filePath = chosenFile.value;
  let fileHandle: FileHandle;
  try {
    fileHandle = await open(filePath, "r");
  } catch (caughtFailure) {
    return failedWith(whyTheFileCouldNotBeRead(filePath, caughtFailure));
  }
  try {
    if (!(await fileHandle.stat()).isFile()) return failedWith(`${filePath} is not a file, so it holds no secret Tatolab can send.`);
    const fileBytes = Buffer.alloc(LARGEST_RELAY_SECRET_FILE_BYTES + 1);
    const { bytesRead } = await fileHandle.read(fileBytes, 0, fileBytes.length, 0);
    if (bytesRead > LARGEST_RELAY_SECRET_FILE_BYTES) return failedWith(`${filePath} is larger than a relay secret, which Tatolab reads up to ${LARGEST_RELAY_SECRET_FILE_BYTES} bytes of.`);
    const secretBytes = fileBytes.subarray(0, bytesRead);
    if (!isUtf8(secretBytes)) return failedWith(`${filePath} is not text, so it holds no secret Tatolab can send.`);
    return succeeded({ text: secretBytes.toString("utf8") });
  } catch (caughtFailure) {
    return failedWith(whyTheFileCouldNotBeRead(filePath, caughtFailure));
  } finally {
    // Nothing was written, so a close that fails changes nothing the person was answered.
    await fileHandle.close().catch(() => undefined);
  }
}
