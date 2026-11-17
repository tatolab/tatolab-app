// The Studio's own node UI module, `packages/tato-app-core-node-ui/`. Its manifest is read by the
// runtime client's checker against the contract's node UI manifest, and its elements are listed as
// a project's are, brought by the Studio, whose control names are bare. Its files are copied as
// source beside the built window, at `core_node_ui/`, and a page is served each the way a project's
// extension file is: a `.ts` with its types removed. The files sit inside the signed app and cannot
// change, so they are served without asking the runtime.

import studioNodeUiManifestJson from "@tatolab/tato-app-core-node-ui/node_ui/tatolab_node_ui.json" with { type: "json" };
import type { ListedNodeUiElement, NodeUiElementRegistration } from "@tatolab/tato-app-view-sdk/node_ui_host";
import { Data, Effect } from "effect";
import { howAProjectViewFileIsServed, projectViewFileAsServed, type ExtensionFileAnswer, type ExtensionFileNotServableAsWritten } from "./extension_files_served_with_types_removed.js";
import { describeCaughtFailure } from "./result.js";
import { tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { describeTheContractIssues, readControlContractValue, type NodeUiManifest } from "./tatolab_runtime_control_operation_call.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { isOnTheLocationUnderThePath, TATOLAB_WINDOW_PAGE_ROOT_URL, windowPagePathUnderThePrefix, windowPageUrlUnderThePath } from "./window_page_locations.js";

/** Where the window serves the Studio's own node UI module, beside the built window. */
export const STUDIO_NODE_UI_FILES_PATH = "/core_node_ui/";

/** The module name the Studio's own elements are listed under. */
export const STUDIO_NODE_UI_MODULE = "studio";

/** The Studio's own `tatolab_node_ui.json` does not read as the contract's node UI manifest. */
export class StudioNodeUiManifestUnreadable extends Data.TaggedError("StudioNodeUiManifestUnreadable")<{ readonly words: string }> {}

/** The URL a page imports the file at `pathInTheModule` of the Studio's own node UI module from. */
export function studioNodeUiFileUrl(pathInTheModule: string): string {
  return windowPageUrlUnderThePath(STUDIO_NODE_UI_FILES_PATH, pathInTheModule);
}

/** What one entry of a node UI manifest registers. */
function registrationOfTheControl(control: NonNullable<NodeUiManifest["controls"]>[number]): NodeUiElementRegistration {
  return { kind: "control", type: control.type, control: control.control ?? null };
}

/** Every element `manifest` registers, listed as brought by the Studio, its script served at `core_node_ui/`, from the module whose contents `folderVersion` names. */
function elementsTheStudiosManifestRegisters(manifest: NodeUiManifest, folderVersion: string): readonly ListedNodeUiElement[] {
  const listed = (script: string, registration: NodeUiElementRegistration): ListedNodeUiElement => ({
    module: STUDIO_NODE_UI_MODULE,
    brought_by: "studio",
    script,
    folder_version: folderVersion,
    registration,
    script_serving: { kind: "served", script_url: studioNodeUiFileUrl(script) },
  });
  return [
    ...(manifest.controls ?? []).map((control) => listed(control.script, registrationOfTheControl(control))),
    ...(manifest.node_bodies ?? []).map((nodeBody) => listed(nodeBody.script, { kind: "node_body", node_type: nodeBody.node_type })),
  ];
}

/** The elements the node UI manifest `manifestJson` registers, read against the contract's node UI manifest, as the Studio's own. */
export function studioNodeUiElementsListed(manifestJson: unknown, folderVersion: string): Effect.Effect<readonly ListedNodeUiElement[], StudioNodeUiManifestUnreadable> {
  const manifestReading = readControlContractValue("NodeUiManifest", manifestJson);
  if (!manifestReading.read) {
    return Effect.fail(new StudioNodeUiManifestUnreadable({ words: `The Studio's own node_ui/tatolab_node_ui.json is not a node UI manifest: ${describeTheContractIssues(manifestReading.issues, "the manifest")}` }));
  }
  return Effect.succeed(elementsTheStudiosManifestRegisters(manifestReading.value, folderVersion));
}

/** Every element the Studio's own node UI module registers; `studioVersion` names its contents, which only a new Studio changes. */
export function theStudiosOwnNodeUiElements(studioVersion: string): Effect.Effect<readonly ListedNodeUiElement[], StudioNodeUiManifestUnreadable> {
  return studioNodeUiElementsListed(studioNodeUiManifestJson, studioVersion);
}

/** Whether `requestUrl` asks for a file of the Studio's own node UI module. */
export function isAStudioNodeUiFileUrl(requestUrl: string): boolean {
  return isOnTheLocationUnderThePath(TATOLAB_WINDOW_PAGE_ROOT_URL, requestUrl, STUDIO_NODE_UI_FILES_PATH);
}

/** The `/`-separated path inside the Studio's own node UI module that `requestUrl` asks for, or `null` when it names none or leaves the module. */
export function studioNodeUiFileOfTheRequest(requestUrl: string): string | null {
  return windowPagePathUnderThePrefix(requestUrl, STUDIO_NODE_UI_FILES_PATH);
}

/** Reads the file at a `/`-separated path inside the Studio's own node UI module, from the built window or the dev server: its bytes, or `null` when it is not there; it rejects when the file could not be read. */
export type ReadAStudioNodeUiFile = (pathInTheModule: string) => Promise<Uint8Array | null>;

/** The request names no file the Studio's own node UI module holds. */
class StudioNodeUiFileNotFound extends Data.TaggedError("StudioNodeUiFileNotFound")<{ readonly words: string }> {}

/** A file of the Studio's own node UI module is there, but could not be read. */
class StudioNodeUiFileUnreadable extends Data.TaggedError("StudioNodeUiFileUnreadable")<{ readonly words: string }> {}

/** Every way a request for a file of the Studio's own node UI module goes unserved. */
type StudioNodeUiFileNotServed = StudioNodeUiFileNotFound | StudioNodeUiFileUnreadable | ExtensionFileNotServableAsWritten;

/** The status a request answers with when `notServed` stopped it: not found (404), not servable as written (422), or not read (500). */
function statusOfAStudioNodeUiFileNotServed(notServed: StudioNodeUiFileNotServed): 404 | 422 | 500 {
  switch (notServed._tag) {
    case "StudioNodeUiFileNotFound":
      return 404;
    case "TypeScriptTypesNotRemoved":
    case "ProjectViewPageNotUtf8Text":
      return 422;
    case "StudioNodeUiFileUnreadable":
      return 500;
  }
}

/** The file `requestUrl` asks for, read with `readTheFile` and served as a project's extension file is. */
const studioNodeUiFileServed = Effect.fn("studio_node_ui_file_served")(function* (requestUrl: string, readTheFile: ReadAStudioNodeUiFile) {
  const pathInTheModule = studioNodeUiFileOfTheRequest(requestUrl);
  if (pathInTheModule === null) return yield* new StudioNodeUiFileNotFound({ words: `${requestUrl} names no file of the Studio's own node UI module.` });
  const fileBytes = yield* Effect.tryPromise({
    try: () => readTheFile(pathInTheModule),
    catch: (readFailure) => new StudioNodeUiFileUnreadable({ words: `the Studio's own node_ui/${pathInTheModule} could not be read: ${describeCaughtFailure(readFailure)}` }),
  });
  if (fileBytes === null) return yield* new StudioNodeUiFileNotFound({ words: `the Studio's own node UI module holds no ${pathInTheModule}.` });
  const serving = howAProjectViewFileIsServed(pathInTheModule);
  const servedBytes = yield* projectViewFileAsServed(pathInTheModule, Buffer.from(fileBytes), serving.served_as);
  return { kind: "served", content_type: serving.content_type, file_bytes: servedBytes } satisfies ExtensionFileAnswer;
});

/**
 * The answer to `requestUrl`, a file of the Studio's own node UI module read with `readTheFile`, as a page is served a
 * project's extension file; never rejected. A file not servable as written is logged to `tatolabAppLog` as a warning.
 */
export function answerAStudioNodeUiFileRequest(requestUrl: string, readTheFile: ReadAStudioNodeUiFile, tatolabAppLog: TatolabAppLog): Promise<ExtensionFileAnswer> {
  return Effect.runPromise(
    studioNodeUiFileServed(requestUrl, readTheFile).pipe(
      Effect.tapError((notServed) => (statusOfAStudioNodeUiFileNotServed(notServed) === 422 ? Effect.logWarning("a file of the Studio's own node UI module was not served as it is written", notServed.words) : Effect.void)),
      Effect.catch((notServed) => Effect.succeed<ExtensionFileAnswer>({ kind: "not_served", status: statusOfAStudioNodeUiFileNotServed(notServed), because: notServed.words })),
      Effect.provide(tatolabAppLogAsEffectsLogger(tatolabAppLog)),
    ),
  );
}
