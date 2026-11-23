// A project's views are served to their frames from the bytes the extension check gate read through
// the runtime and the runtime's check passed, under the window page's own scheme:
// `tatolab-app://app/project_views/<open project>/<folder version>/<view folder>/<file>`, the open
// project's folder written as base64url so the URL names which project's history the bytes come
// from, and the folder version naming the bytes checked, so a passing edit is a new URL. Only a
// view a studio window's last listing passed is served, and only the bytes that passed: nothing is
// read at the request. The app reads no project file from disk. Each file is served as `extension_file_serving.ts`
// says: a `.ts` file as JavaScript with its types removed and a page holding the supplied modules'
// import map, so a view an author writes in `.ts` opens with no build, and a library the view carries
// in its `vendor/` as it is written.

import path from "node:path";
import { withTheSuppliedModulesImportMap } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { Cause, Data, Effect, Exit, type ManagedRuntime } from "effect";
import { howAnExtensionFileIsServed, type ExtensionFileServedAs } from "./extension_file_serving.js";
import { isANodeUiFolder, type ExtensionFolderPassed } from "./extension_check_gate.js";
import { describeCaughtFailure } from "./result.js";
import { ProjectViewsListed, StudioWindows } from "./studio_runtime.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { typeScriptWithItsTypesRemoved, type TypeScriptTypesNotRemoved } from "./typescript_types_removed.js";
import { isOnTheLocationUnderThePath, TATOLAB_WINDOW_PAGE_ROOT_URL, windowPagePathUnderThePrefix, windowPageUrlUnderThePath } from "./window_page_locations.js";

/** Where the window serves project views' files. */
export const PROJECT_VIEW_FILES_PATH = "/project_views/";

/** An extension folder inside a project: a view's, its own `views/<folder>` or an import's `imports/<import>/views/<folder>`, or a module's node UI folder, its own `node_ui` or an import's `imports/<import>/node_ui`. */
const EXTENSION_FOLDER_IN_A_PROJECT = /^(?:imports\/[^/]+\/)?(?:views\/[^/]+|node_ui)(?=\/)/;

/** A folder version as the URL carries it. */
const FOLDER_VERSION = /^[0-9a-f]{16}$/;

/** The URL the view folder `viewFolderInTheProject` of the project in `openProjectFolder`, at the version `folderVersion` the gate passed, is served under, which its entry and every file it loads resolve against. */
export function projectViewFolderUrl(openProjectFolder: string, folderVersion: string, viewFolderInTheProject: string): string {
  return `${windowPageUrlUnderThePath(PROJECT_VIEW_FILES_PATH, `${Buffer.from(openProjectFolder, "utf8").toString("base64url")}/${folderVersion}/${viewFolderInTheProject}`)}/`;
}

/** Whether `url` is served from a project's view folder. */
export function isAProjectViewFileUrl(url: string): boolean {
  return isOnTheLocationUnderThePath(TATOLAB_WINDOW_PAGE_ROOT_URL, url, PROJECT_VIEW_FILES_PATH);
}

/** A file of a project view a request names: the open project's folder, the folder version, the view folder it is in, and the file's `/`-separated path in the project. */
export interface ProjectViewFileAsked {
  open_project_folder: string;
  folder_version: string;
  view_folder_in_the_project: string;
  path_in_the_project: string;
}

/** The project view file `requestUrl` asks for, or `null` when it names none: another path, a project folder that is not absolute, no folder version, or a file outside a view folder. */
export function projectViewFileOfTheRequest(requestUrl: string): ProjectViewFileAsked | null {
  const requestedPath = windowPagePathUnderThePrefix(requestUrl, PROJECT_VIEW_FILES_PATH);
  if (requestedPath === null) return null;
  const folderEnd = requestedPath.indexOf("/");
  if (folderEnd <= 0) return null;
  const openProjectFolder = Buffer.from(requestedPath.slice(0, folderEnd), "base64url").toString("utf8");
  const versionEnd = requestedPath.indexOf("/", folderEnd + 1);
  if (versionEnd < 0) return null;
  const folderVersion = requestedPath.slice(folderEnd + 1, versionEnd);
  const pathInTheProject = requestedPath.slice(versionEnd + 1);
  if (!path.isAbsolute(openProjectFolder) || path.normalize(openProjectFolder) !== openProjectFolder || !FOLDER_VERSION.test(folderVersion)) return null;
  const viewFolderInTheProject = EXTENSION_FOLDER_IN_A_PROJECT.exec(pathInTheProject)?.[0];
  if (viewFolderInTheProject === undefined) return null;
  return { open_project_folder: openProjectFolder, folder_version: folderVersion, view_folder_in_the_project: viewFolderInTheProject, path_in_the_project: pathInTheProject };
}

/** How a request for an extension's file, a project view's or the Studio's own node UI module's, is answered: its bytes, or a status with why. */
export type ExtensionFileAnswer = { kind: "served"; content_type: string; file_bytes: Buffer } | { kind: "not_served"; status: ProjectViewFileNotServedStatus | 500; because: string };

/** The status of a request a known failure left unserved: refused (403), not found (404), or not servable as written (422). */
type ProjectViewFileNotServedStatus = 403 | 404 | 422;

/** The header that holds a page to the content type an extension's file is served with: a `<script>` runs no file served as bytes of no script's type. */
const NO_SNIFFING_OF_THE_CONTENT_TYPE = { "X-Content-Type-Options": "nosniff" } as const;

/** The response that carries `answer` to a request for an extension's file at `requestUrl`: its bytes, or its status and why, which is logged; neither is sniffed for another type. */
export function responseCarryingTheExtensionFileAnswer(requestUrl: string, answer: ExtensionFileAnswer, tatolabAppLog: TatolabAppLog): Response {
  if (answer.kind === "not_served") {
    tatolabAppLog.debug("an extension's file was not served", { request_url: requestUrl, because: answer.because });
    return new Response(answer.because, { status: answer.status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_SNIFFING_OF_THE_CONTENT_TYPE } });
  }
  return new Response(new Uint8Array(answer.file_bytes), { status: 200, headers: { "Content-Type": answer.content_type, "Cache-Control": "no-store", ...NO_SNIFFING_OF_THE_CONTENT_TYPE } });
}

/** How the running app answers a request for a project view's file. */
export type AnswerAProjectViewFileRequest = (requestUrl: string) => Promise<ExtensionFileAnswer>;

/** What a window lists of a project's extension folders: its views, or the node UI elements their controls pick from. */
export type ExtensionFoldersListed = "views" | "node_ui_elements";

/** The extension folders each studio window last listed as ones that open, by project and by listing, each with the files the gate passed: the only bytes served. */
export class ProjectViewsListedToTheWindows {
  private readonly foldersByListingOfTheProject = new Map<string, { listing_started: number; passed_folders: ReadonlyMap<string, ExtensionFolderPassed> }>();
  private listingsStarted = 0;

  /** The mark of a listing of a project about to be asked for, which `rememberTheListing` takes back with its answer. */
  startAListing(): number {
    this.listingsStarted += 1;
    return this.listingsStarted;
  }

  /** Keep `passedFolders`, the folders that open in the `listed` listing of the project in `openProjectFolder` started as `listingStarted`, by folder, in place of its last such listing, unless one started later is already kept. */
  rememberTheListing(openProjectFolder: string, listed: ExtensionFoldersListed, listingStarted: number, passedFolders: ReadonlyMap<string, ExtensionFolderPassed>): void {
    const listingKey = JSON.stringify([openProjectFolder, listed]);
    const keptListing = this.foldersByListingOfTheProject.get(listingKey);
    if (keptListing !== undefined && keptListing.listing_started > listingStarted) return;
    this.foldersByListingOfTheProject.set(listingKey, { listing_started: listingStarted, passed_folders: passedFolders });
  }

  /** The extension folder `folderInTheProject` at `folderVersion` as the last listing of the project in `openProjectFolder` that names it passed it; `null` when none holds it at that version. */
  passedExtensionFolder(openProjectFolder: string, folderVersion: string, folderInTheProject: string): ExtensionFolderPassed | null {
    const listed: ExtensionFoldersListed = isANodeUiFolder(folderInTheProject) ? "node_ui_elements" : "views";
    const passed = this.foldersByListingOfTheProject.get(JSON.stringify([openProjectFolder, listed]))?.passed_folders.get(folderInTheProject);
    return passed !== undefined && passed.folder_version === folderVersion ? passed : null;
  }
}

/** The request names no file inside a view's folder of a project. */
class NotAProjectViewFile extends Data.TaggedError("NotAProjectViewFile")<{ readonly words: string }> {}

/** The request names a project no studio window holds open, or a view folder, or a version of one, its window's last listing did not pass. */
class ProjectViewNotOpenInAStudioWindow extends Data.TaggedError("ProjectViewNotOpenInAStudioWindow")<{ readonly words: string }> {}

/** The request names a file the view folder the gate passed does not hold. */
class ProjectViewFileNotPassed extends Data.TaggedError("ProjectViewFileNotPassed")<{ readonly words: string }> {}

/** A view's page is not UTF-8 text, so the supplied modules' import map cannot be written into it. */
class ProjectViewPageNotUtf8Text extends Data.TaggedError("ProjectViewPageNotUtf8Text")<{ readonly words: string }> {}

/** Every way a file read whole is not servable as it is written. */
export type ExtensionFileNotServableAsWritten = TypeScriptTypesNotRemoved | ProjectViewPageNotUtf8Text;

/** Every way a request for a project view's file goes unserved. */
type ProjectViewFileNotServed = NotAProjectViewFile | ProjectViewNotOpenInAStudioWindow | ProjectViewFileNotPassed | TypeScriptTypesNotRemoved | ProjectViewPageNotUtf8Text;

/** The status a request answers with when `notServed` stopped it. */
function statusOfAFileNotServed(notServed: ProjectViewFileNotServed): ProjectViewFileNotServedStatus {
  switch (notServed._tag) {
    case "ProjectViewNotOpenInAStudioWindow":
      return 403;
    case "NotAProjectViewFile":
    case "ProjectViewFileNotPassed":
      return 404;
    case "TypeScriptTypesNotRemoved":
    case "ProjectViewPageNotUtf8Text":
      return 422;
  }
}

const UTF8_DECODER_REFUSING_OTHER_BYTES = new TextDecoder("utf-8", { fatal: true });

/** The page at `pathInTheProject`, whose bytes are `pageBytes`, with the supplied modules' import map straight after its doctype. */
function pageWithTheSuppliedModulesImportMap(pathInTheProject: string, pageBytes: Buffer): Effect.Effect<Buffer, ProjectViewPageNotUtf8Text> {
  return Effect.try({
    try: () => Buffer.from(withTheSuppliedModulesImportMap(UTF8_DECODER_REFUSING_OTHER_BYTES.decode(pageBytes)), "utf8"),
    catch: () => new ProjectViewPageNotUtf8Text({ words: `${pathInTheProject} is not UTF-8 text, so the import map of the modules the Studio supplies cannot be written into it.` }),
  });
}

/** The file at `pathInTheProject`, whose bytes were read as `fileBytes`, as `servedAs` says a page is served it. */
export function projectViewFileAsServed(
  pathInTheProject: string,
  fileBytes: Buffer,
  servedAs: ExtensionFileServedAs,
): Effect.Effect<Buffer, ExtensionFileNotServableAsWritten> {
  switch (servedAs) {
    case "types_removed":
      return typeScriptWithItsTypesRemoved(pathInTheProject, fileBytes).pipe(Effect.map((javaScriptText) => Buffer.from(javaScriptText, "utf8")));
    case "with_import_map":
      return pageWithTheSuppliedModulesImportMap(pathInTheProject, fileBytes);
    case "as_read":
      return Effect.succeed(fileBytes);
  }
}

/** The file `requestUrl` asks for: its bytes as the gate passed them, in a view a studio window's last listing passed at the version the URL names, only for a project a studio window holds open. */
const projectViewFileServed = Effect.fn("project_view_file_served")(function* (requestUrl: string) {
  const fileAsked = projectViewFileOfTheRequest(requestUrl);
  if (fileAsked === null) return yield* new NotAProjectViewFile({ words: `${requestUrl} names no file of a project's view.` });
  const studioWindows = yield* StudioWindows;
  if (!studioWindows.aStudioWindowHoldsTheProjectIn(fileAsked.open_project_folder)) {
    return yield* new ProjectViewNotOpenInAStudioWindow({ words: `${fileAsked.open_project_folder} is not a project open in a studio window.` });
  }
  const passedExtensionFolder = (yield* ProjectViewsListed).passedExtensionFolder(fileAsked.open_project_folder, fileAsked.folder_version, fileAsked.view_folder_in_the_project);
  if (passedExtensionFolder === null) {
    return yield* new ProjectViewNotOpenInAStudioWindow({
      words: `${fileAsked.view_folder_in_the_project} at ${fileAsked.folder_version} is not a view the studio window of ${fileAsked.open_project_folder} last listed as passing its check.`,
    });
  }
  const fileBytes = passedExtensionFolder.files.get(fileAsked.path_in_the_project);
  if (fileBytes === undefined) return yield* new ProjectViewFileNotPassed({ words: `${fileAsked.path_in_the_project} is not a file of the view folder the runtime checked.` });
  const serving = howAnExtensionFileIsServed(fileAsked.path_in_the_project.slice(fileAsked.view_folder_in_the_project.length + 1));
  const servedBytes = yield* projectViewFileAsServed(fileAsked.path_in_the_project, fileBytes, serving.served_as);
  return { kind: "served", content_type: serving.content_type, file_bytes: servedBytes } satisfies ExtensionFileAnswer;
});

/** The answer to `requestUrl`: the file served, or the status and words of what stopped it; a file not servable as its author wrote it is logged with its words. */
function answerAProjectViewFileRequest(requestUrl: string): Effect.Effect<ExtensionFileAnswer, never, StudioWindows | ProjectViewsListed> {
  return projectViewFileServed(requestUrl).pipe(
    Effect.tapError((notServed) => (statusOfAFileNotServed(notServed) === 422 ? Effect.logWarning("a project view's file was not served as its author wrote it", notServed.words) : Effect.void)),
    Effect.catch((notServed) => Effect.succeed<ExtensionFileAnswer>({ kind: "not_served", status: statusOfAFileNotServed(notServed), because: notServed.words })),
  );
}

/** How a request for `requestUrl` answers when serving it ended without an answer: `cause` was a defect, or the runtime that ran it was disposed. */
function answerOfARequestThatEndedWithoutAnAnswer(requestUrl: string, cause: Cause.Cause<unknown>): ExtensionFileAnswer {
  return { kind: "not_served", status: 500, because: `serving ${requestUrl} ended without an answer: ${describeCaughtFailure(Cause.squash(cause))}` };
}

/**
 * Every request for a project view's file answered on `studioRuntime`, never rejected: a defect is logged and answers that
 * serving it ended without an answer, and so does a request the runtime was disposed under, logged to `tatolabAppLog`.
 */
export function projectViewFileRequestsAnsweredOn(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioWindows | ProjectViewsListed, never>,
  tatolabAppLog: TatolabAppLog,
): AnswerAProjectViewFileRequest {
  return (requestUrl) =>
    studioRuntime
      .runPromiseExit(
        answerAProjectViewFileRequest(requestUrl).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("serving a project view's file ended without an answer", Cause.pretty(cause)).pipe(Effect.as(answerOfARequestThatEndedWithoutAnAnswer(requestUrl, cause))),
          ),
        ),
      )
      .then((answered) => {
        if (Exit.isSuccess(answered)) return answered.value;
        tatolabAppLog.debug("a project view's file was asked for as the studio runtime was disposed", { request_url: requestUrl, cause: Cause.pretty(answered.cause) });
        return answerOfARequestThatEndedWithoutAnAnswer(requestUrl, answered.cause);
      });
}
