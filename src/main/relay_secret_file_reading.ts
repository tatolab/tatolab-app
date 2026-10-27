// A relay secret read from a file the person chooses in the app's own dialog, as moq.pro hands a
// project's signing key over as a downloaded file. Its text goes to the window once, to be sent
// to the runtime as a typed secret is; it is never logged and never kept.

import { open } from "node:fs/promises";
import { isUtf8 } from "node:buffer";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The desktop's file dialog for a relay secret; `null` when the person cancels, refused in its words when it does not open. */
export type RelaySecretFileDialog = () => Promise<Result<string | null, string>>;

/** The largest file read as a relay secret: a signing key or a token is a few hundred bytes. */
export const LARGEST_RELAY_SECRET_FILE_BYTES = 64 * 1024;

/** The text of the file the person chooses through `relaySecretFileDialog`, or `null` when they cancel; a file too large or not UTF-8 text is refused by its name. */
export async function readTheRelaySecretFileThePersonChooses(relaySecretFileDialog: RelaySecretFileDialog): Promise<Result<{ text: string } | null, string>> {
  const chosenFile = await relaySecretFileDialog();
  if (!chosenFile.ok || chosenFile.value === null) return chosenFile.ok ? succeeded(null) : chosenFile;
  const filePath = chosenFile.value;
  try {
    const fileHandle = await open(filePath, "r");
    try {
      const { size } = await fileHandle.stat();
      if (size > LARGEST_RELAY_SECRET_FILE_BYTES) return failedWith(`${filePath} is ${size} bytes, larger than a relay secret, which Tatolab reads up to ${LARGEST_RELAY_SECRET_FILE_BYTES} bytes of.`);
      const fileBytes = await fileHandle.readFile();
      if (!isUtf8(fileBytes)) return failedWith(`${filePath} is not text, so it holds no secret Tatolab can send.`);
      return succeeded({ text: fileBytes.toString("utf8") });
    } finally {
      await fileHandle.close();
    }
  } catch (caughtFailure) {
    return failedWith(`${filePath} could not be read: ${describeCaughtFailure(caughtFailure)}`);
  }
}
