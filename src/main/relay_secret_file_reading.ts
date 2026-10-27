// A relay secret read from a file the person chooses in the app's own dialog, as moq.pro hands a
// project's signing key over as a downloaded file. Its text goes to the window once, to be sent
// to the runtime as a typed secret is; it is never logged and never kept.

import { constants } from "node:fs";
import { open, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
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

/** `fileText` as the CLI's `--from-file` reads a secret: one trailing line ending dropped, so a file an editor saved sends what was written. */
export function relaySecretFromTheFilesText(fileText: string): string {
  if (fileText.endsWith("\r\n")) return fileText.slice(0, -2);
  return fileText.endsWith("\n") ? fileText.slice(0, -1) : fileText;
}

/**
 * The secret in the file the person chooses through `relaySecretFileDialog`, and the file's name, or `null` when they
 * cancel. Only a regular file is opened, without waiting on a writer, and never more than one byte past the limit is
 * read, so a FIFO, a device or a growing file cannot hold the answer up; one too large, not UTF-8 text, or empty is
 * refused by its name.
 */
export async function readTheRelaySecretFileThePersonChooses(
  relaySecretFileDialog: RelaySecretFileDialog,
): Promise<Result<{ text: string; file_name: string } | null, string>> {
  const chosenFile = await relaySecretFileDialog();
  if (!chosenFile.ok) return chosenFile;
  if (chosenFile.value === null) return succeeded(null);
  const filePath = chosenFile.value;
  const notAFile = failedWith(`${filePath} is not a file, so it holds no secret Tatolab can send.`);
  let fileHandle: FileHandle;
  try {
    if (!(await stat(filePath)).isFile()) return notAFile;
    fileHandle = await open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (caughtFailure) {
    return failedWith(whyTheFileCouldNotBeRead(filePath, caughtFailure));
  }
  try {
    if (!(await fileHandle.stat()).isFile()) return notAFile;
    const fileBytes = Buffer.alloc(LARGEST_RELAY_SECRET_FILE_BYTES + 1);
    const { bytesRead } = await fileHandle.read(fileBytes, 0, fileBytes.length, 0);
    if (bytesRead > LARGEST_RELAY_SECRET_FILE_BYTES) return failedWith(`${filePath} is larger than a relay secret, which Tatolab reads up to ${LARGEST_RELAY_SECRET_FILE_BYTES} bytes of.`);
    const secretBytes = fileBytes.subarray(0, bytesRead);
    if (!isUtf8(secretBytes)) return failedWith(`${filePath} is not text, so it holds no secret Tatolab can send.`);
    const secret = relaySecretFromTheFilesText(secretBytes.toString("utf8"));
    if (secret === "") return failedWith(`${filePath} is empty, so it holds no secret Tatolab can send.`);
    return succeeded({ text: secret, file_name: path.basename(filePath) });
  } catch (caughtFailure) {
    return failedWith(whyTheFileCouldNotBeRead(filePath, caughtFailure));
  } finally {
    // Nothing was written, so a close that fails changes nothing the person was answered.
    await fileHandle.close().catch(() => undefined);
  }
}
