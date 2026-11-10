import { shell } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** Open `webPageUrl` in the person's browser; refused in Electron's own words. */
export async function openAWebPageInTheBrowserThroughElectron(webPageUrl: string): Promise<Result<void, string>> {
  try {
    await shell.openExternal(webPageUrl);
  } catch (openFailure) {
    return failedWith(describeCaughtFailure(openFailure));
  }
  return succeeded(undefined);
}
