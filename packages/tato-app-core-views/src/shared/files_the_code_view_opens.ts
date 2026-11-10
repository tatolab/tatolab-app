// The files Code opens, by the extensions its `tatolab_view.json` accepts, so the Files view and
// Code's own file menu offer the same files and neither keeps a list of its own.

import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import codeManifestText from "../code/tatolab_view.json?raw";

/** The view type Studio opens a project's code files in. */
export const CODE_VIEW_TYPE_ID = "code";

function extensionsCodeAccepts(): readonly string[] {
  const reading = readTatolabViewManifest(JSON.parse(codeManifestText));
  return reading.kind === "read" ? reading.manifest.accepts.files : [];
}

const EXTENSIONS_CODE_ACCEPTS = extensionsCodeAccepts();

/** The extensions Code's manifest accepts, each lower case and with its dot, in the manifest's order. */
export function extensionsTheCodeViewOpens(): readonly string[] {
  return EXTENSIONS_CODE_ACCEPTS;
}

/** Whether Code opens `file`, a path or a name, by its extension in any case. */
export function isAFileTheCodeViewOpens(file: string): boolean {
  const lowerCaseName = (file.split("/").at(-1) ?? file).toLowerCase();
  return EXTENSIONS_CODE_ACCEPTS.some((extension) => lowerCaseName.endsWith(extension) && lowerCaseName.length > extension.length);
}
