// The Studio's own node UI module, `packages/tato-app-core-node-ui/`. Its manifest is read with the
// schema the runtime's contract generates, and its elements are listed as a project's are, brought
// by the Studio, whose control names are bare. Its files are copied as source beside the built
// window, at `core_node_ui/`, and a page is served each the way a project's extension file is: a
// `.ts` with its types removed. The files sit inside the signed app and cannot change, so they are
// served without asking the runtime.

import { ControlSchemas, type NodeUiManifest } from "@tatolab/runtime-client";
import studioNodeUiManifestJson from "@tatolab/tato-app-core-node-ui/node_ui/tatolab_node_ui.json" with { type: "json" };
import type { ListedNodeUiElement, NodeUiElementRegistration } from "@tatolab/tato-app-view-sdk/node_ui_host";
import { Data, Effect } from "effect";
import { howAProjectViewFileIsServed, projectViewFileAsServed, type ProjectViewFileAnswer } from "./extension_files_served_with_types_removed.js";
import { describeCaughtFailure } from "./result.js";
import { isOnTheLocationUnderThePath, TATOLAB_WINDOW_PAGE_ROOT_URL } from "./window_page_locations.js";

/** Where the window serves the Studio's own node UI module, beside the built window. */
export const STUDIO_NODE_UI_FILES_PATH = "/core_node_ui/";

/** The module name the Studio's own elements are listed under. */
export const STUDIO_NODE_UI_MODULE = "studio";

/** The Studio's own `tatolab_node_ui.json` does not read as the contract's node UI manifest. */
export class StudioNodeUiManifestUnreadable extends Data.TaggedError("StudioNodeUiManifestUnreadable")<{ readonly words: string }> {}

/** The URL a page imports the file at `pathInTheModule` of the Studio's own node UI module from. */
export function studioNodeUiFileUrl(pathInTheModule: string): string {
  return new URL(`${STUDIO_NODE_UI_FILES_PATH}${pathInTheModule.split("/").map(encodeURIComponent).join("/")}`, TATOLAB_WINDOW_PAGE_ROOT_URL).href;
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

/** The elements the node UI manifest `manifestJson` registers, read with the contract's generated schema, as the Studio's own. */
export function studioNodeUiElementsListed(manifestJson: unknown, folderVersion: string): Effect.Effect<readonly ListedNodeUiElement[], StudioNodeUiManifestUnreadable> {
  const manifestReading = ControlSchemas.components.NodeUiManifest.safeParse(manifestJson);
  if (!manifestReading.success) {
    return Effect.fail(new StudioNodeUiManifestUnreadable({ words: `The Studio's own node_ui/tatolab_node_ui.json is not a node UI manifest: ${manifestReading.error.message}` }));
  }
  return Effect.succeed(elementsTheStudiosManifestRegisters(manifestReading.data, folderVersion));
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
  if (!isAStudioNodeUiFileUrl(requestUrl)) return null;
  let pathInTheModule: string;
  try {
    pathInTheModule = decodeURIComponent(new URL(requestUrl).pathname.slice(STUDIO_NODE_UI_FILES_PATH.length));
  } catch {
    return null;
  }
  if (pathInTheModule.split("/").some((pathSegment) => pathSegment === "" || pathSegment === "." || pathSegment === ".." || pathSegment.includes("\\"))) return null;
  return pathInTheModule;
}

/** Reads the file at a `/`-separated path inside the Studio's own node UI module, from the built window or the dev server. */
export type ReadAStudioNodeUiFile = (pathInTheModule: string) => Promise<Uint8Array>;

/** The answer to `requestUrl`, a file of the Studio's own node UI module read with `readTheFile`, as a page is served a project's extension file; never rejected. */
export function answerAStudioNodeUiFileRequest(requestUrl: string, readTheFile: ReadAStudioNodeUiFile): Promise<ProjectViewFileAnswer> {
  const pathInTheModule = studioNodeUiFileOfTheRequest(requestUrl);
  if (pathInTheModule === null) return Promise.resolve({ kind: "not_served", status: 404, because: `${requestUrl} names no file of the Studio's own node UI module.` });
  const serving = howAProjectViewFileIsServed(pathInTheModule);
  return Effect.runPromise(
    Effect.tryPromise({ try: () => readTheFile(pathInTheModule), catch: (readFailure) => ({ status: 404 as const, words: `${pathInTheModule}: ${describeCaughtFailure(readFailure)}` }) }).pipe(
      Effect.flatMap((fileBytes) => projectViewFileAsServed(pathInTheModule, Buffer.from(fileBytes), serving.served_as).pipe(Effect.mapError((notServed) => ({ status: 422 as const, words: notServed.words })))),
      Effect.match({
        onSuccess: (servedBytes): ProjectViewFileAnswer => ({ kind: "served", content_type: serving.content_type, file_bytes: servedBytes }),
        onFailure: (notServed): ProjectViewFileAnswer => ({ kind: "not_served", status: notServed.status, because: notServed.words }),
      }),
    ),
  );
}
