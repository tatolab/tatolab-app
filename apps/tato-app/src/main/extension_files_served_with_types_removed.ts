// A project's views are served to their frames from the bytes the runtime's `read_project_file`
// answers, under the window page's own scheme: `tatolab-app://app/project_views/<open project>/
// <view folder>/<file>`, the open project's folder written as base64url so the URL names which
// project's history the bytes come from, and only for a view a studio window listed as one that
// opens. The app reads no project file from disk. A `.ts` file is served as JavaScript with its
// types removed, and a page holds the supplied modules' import map, so a view an author writes in
// `.ts` opens with no build; any other file is served as the runtime read it.

import path from "node:path";
import { withTheSuppliedModulesImportMap } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { Cause, Data, Effect, Exit, type ManagedRuntime } from "effect";
import { bytesOfTheBase64ContentOfTheContract } from "./project_files_on_the_wire.js";
import { describeCaughtFailure } from "./result.js";
import { fromResult } from "./result_as_effect.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { ProjectViewsListed, StudioWindows } from "./studio_runtime.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { typeScriptWithItsTypesRemoved, type TypeScriptTypesNotRemoved } from "./typescript_types_removed.js";
import { isOnTheLocationUnderThePath, TATOLAB_WINDOW_PAGE_ROOT_URL } from "./window_page_locations.js";

/** Where the window serves project views' files. */
export const PROJECT_VIEW_FILES_PATH = "/project_views/";

/** A view's folder inside a project: its own `views/<folder>`, or an import's `imports/<import>/views/<folder>`. */
const VIEW_FOLDER_IN_A_PROJECT = /^(?:views\/[^/]+|imports\/[^/]+\/views\/[^/]+)(?=\/)/;

/** What is done to a file of a view's folder on its way to the page: nothing, its types removed, or the supplied modules' import map written into it. */
export type ProjectViewFileServedAs = "as_read" | "types_removed" | "with_import_map";

/** How one kind of file of a view's folder is served: its content type and what is done to it on the way. */
export interface ProjectViewFileServing {
  readonly content_type: string;
  readonly served_as: ProjectViewFileServedAs;
}

/** A file served with `contentType` as the runtime read it. */
function servedAsRead(contentType: string): ProjectViewFileServing {
  return { content_type: contentType, served_as: "as_read" };
}

/** How each file a view's folder may hold is served, by its extension; any other is served as bytes, as read. */
const HOW_EACH_FILE_IS_SERVED_BY_EXTENSION: ReadonlyMap<string, ProjectViewFileServing> = new Map([
  [".html", { content_type: "text/html; charset=utf-8", served_as: "with_import_map" }],
  [".ts", { content_type: "text/javascript; charset=utf-8", served_as: "types_removed" }],
  [".js", servedAsRead("text/javascript; charset=utf-8")],
  [".mjs", servedAsRead("text/javascript; charset=utf-8")],
  [".css", servedAsRead("text/css; charset=utf-8")],
  [".json", servedAsRead("application/json")],
  [".map", servedAsRead("application/json")],
  [".svg", servedAsRead("image/svg+xml")],
  [".png", servedAsRead("image/png")],
  [".jpg", servedAsRead("image/jpeg")],
  [".jpeg", servedAsRead("image/jpeg")],
  [".gif", servedAsRead("image/gif")],
  [".webp", servedAsRead("image/webp")],
  [".ico", servedAsRead("image/x-icon")],
  [".woff", servedAsRead("font/woff")],
  [".woff2", servedAsRead("font/woff2")],
  [".ttf", servedAsRead("font/ttf")],
  [".otf", servedAsRead("font/otf")],
  [".wasm", servedAsRead("application/wasm")],
  [".mp3", servedAsRead("audio/mpeg")],
  [".wav", servedAsRead("audio/wav")],
  [".mp4", servedAsRead("video/mp4")],
  [".webm", servedAsRead("video/webm")],
  [".txt", servedAsRead("text/plain; charset=utf-8")],
]);

/** The URL the view folder `viewFolderInTheProject` of the project in `openProjectFolder` is served under, which its entry and every file it loads resolve against. */
export function projectViewFolderUrl(openProjectFolder: string, viewFolderInTheProject: string): string {
  const encodedPath = viewFolderInTheProject.split("/").map(encodeURIComponent).join("/");
  return new URL(`${PROJECT_VIEW_FILES_PATH}${Buffer.from(openProjectFolder, "utf8").toString("base64url")}/${encodedPath}/`, TATOLAB_WINDOW_PAGE_ROOT_URL).href;
}

/** Whether `url` is served from a project's view folder. */
export function isAProjectViewFileUrl(url: string): boolean {
  return isOnTheLocationUnderThePath(TATOLAB_WINDOW_PAGE_ROOT_URL, url, PROJECT_VIEW_FILES_PATH);
}

/** A file of a project view a request names: the open project's folder, the view folder it is in, and the file's `/`-separated path in the project. */
export interface ProjectViewFileAsked {
  open_project_folder: string;
  view_folder_in_the_project: string;
  path_in_the_project: string;
}

/** The project view file `requestUrl` asks for, or `null` when it names none: another path, a project folder that is not absolute, or a file outside a view folder. */
export function projectViewFileOfTheRequest(requestUrl: string): ProjectViewFileAsked | null {
  if (!isAProjectViewFileUrl(requestUrl)) return null;
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(new URL(requestUrl).pathname.slice(PROJECT_VIEW_FILES_PATH.length));
  } catch {
    return null;
  }
  const folderEnd = requestedPath.indexOf("/");
  if (folderEnd <= 0) return null;
  const openProjectFolder = Buffer.from(requestedPath.slice(0, folderEnd), "base64url").toString("utf8");
  const pathInTheProject = requestedPath.slice(folderEnd + 1);
  if (!path.isAbsolute(openProjectFolder) || path.normalize(openProjectFolder) !== openProjectFolder) return null;
  if (pathInTheProject.split("/").some((pathSegment) => pathSegment === ".." || pathSegment === "." || pathSegment === "")) return null;
  const viewFolderInTheProject = VIEW_FOLDER_IN_A_PROJECT.exec(pathInTheProject)?.[0];
  if (viewFolderInTheProject === undefined) return null;
  return { open_project_folder: openProjectFolder, view_folder_in_the_project: viewFolderInTheProject, path_in_the_project: pathInTheProject };
}

/** How the file at `pathInTheProject` is served, by its extension. */
export function howAProjectViewFileIsServed(pathInTheProject: string): ProjectViewFileServing {
  return HOW_EACH_FILE_IS_SERVED_BY_EXTENSION.get(path.posix.extname(pathInTheProject).toLowerCase()) ?? servedAsRead("application/octet-stream");
}

/** How a request for a project view's file is answered: its bytes, or a status with why. */
export type ProjectViewFileAnswer = { kind: "served"; content_type: string; file_bytes: Buffer } | { kind: "not_served"; status: ProjectViewFileNotServedStatus | 500; because: string };

/** The status of a request a known failure left unserved: refused (403), not found (404), not servable as written (422), a runtime answer that breaks its contract (502), or no runtime answer (503). */
type ProjectViewFileNotServedStatus = 403 | 404 | 422 | 502 | 503;

/** How the running app answers a request for a project view's file. */
export type AnswerAProjectViewFileRequest = (requestUrl: string) => Promise<ProjectViewFileAnswer>;

/** The views each studio window's view-type menu last listed as ones that open, by project: the only view folders served. */
export class ProjectViewsListedToTheWindows {
  private readonly viewFoldersByOpenProjectFolder = new Map<string, { listing_started: number; view_folders: ReadonlySet<string> }>();
  private listingsStarted = 0;

  /** The mark of a listing of a project about to be asked for, which `rememberTheListing` takes back with its answer. */
  startAListing(): number {
    this.listingsStarted += 1;
    return this.listingsStarted;
  }

  /** Keep the views that open in `listedViews`, the listing of the project in `openProjectFolder` started as `listingStarted`, in place of its last listing, unless a listing started later is already kept. */
  rememberTheListing(openProjectFolder: string, listingStarted: number, listedViews: readonly { view_folder_in_the_project: string; opens: boolean }[]): void {
    const keptListing = this.viewFoldersByOpenProjectFolder.get(openProjectFolder);
    if (keptListing !== undefined && keptListing.listing_started > listingStarted) return;
    const viewFolders = new Set(listedViews.filter((listedView) => listedView.opens).map((listedView) => listedView.view_folder_in_the_project));
    this.viewFoldersByOpenProjectFolder.set(openProjectFolder, { listing_started: listingStarted, view_folders: viewFolders });
  }

  /** Whether the last listing of the project in `openProjectFolder` holds `viewFolderInTheProject` as a view that opens. */
  isListedAsOpening(openProjectFolder: string, viewFolderInTheProject: string): boolean {
    return this.viewFoldersByOpenProjectFolder.get(openProjectFolder)?.view_folders.has(viewFolderInTheProject) ?? false;
  }
}

/** The request names no file inside a view's folder of a project. */
class NotAProjectViewFile extends Data.TaggedError("NotAProjectViewFile")<{ readonly words: string }> {}

/** The request names a project no studio window holds open, or a view folder its window did not list as one that opens. */
class ProjectViewNotOpenInAStudioWindow extends Data.TaggedError("ProjectViewNotOpenInAStudioWindow")<{ readonly words: string }> {}

/** The runtime's `read_project_file` answered bytes that do not read as its contract says. */
class ProjectFileBytesUnreadable extends Data.TaggedError("ProjectFileBytesUnreadable")<{ readonly words: string }> {}

/** A view's page is not UTF-8 text, so the supplied modules' import map cannot be written into it. */
class ProjectViewPageNotUtf8Text extends Data.TaggedError("ProjectViewPageNotUtf8Text")<{ readonly words: string }> {}

/** Every way a request for a project view's file goes unserved. */
type ProjectViewFileNotServed = NotAProjectViewFile | ProjectViewNotOpenInAStudioWindow | ProjectFileBytesUnreadable | TypeScriptTypesNotRemoved | ProjectViewPageNotUtf8Text | RuntimeControlFailure;

/** The status a request answers with when `notServed` stopped it. */
function statusOfAFileNotServed(notServed: ProjectViewFileNotServed): ProjectViewFileNotServedStatus {
  switch (notServed._tag) {
    case "ProjectViewNotOpenInAStudioWindow":
      return 403;
    case "NotAProjectViewFile":
    case "RuntimeRefused":
      return 404;
    case "TypeScriptTypesNotRemoved":
    case "ProjectViewPageNotUtf8Text":
      return 422;
    case "ProjectFileBytesUnreadable":
    case "ContractMismatch":
      return 502;
    case "RuntimeUnreachable":
    case "RuntimeTimedOut":
      return 503;
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

/** The file at `pathInTheProject`, whose bytes the runtime read as `fileBytes`, as `servedAs` says a page is served it. */
function projectViewFileAsServed(
  pathInTheProject: string,
  fileBytes: Buffer,
  servedAs: ProjectViewFileServedAs,
): Effect.Effect<Buffer, TypeScriptTypesNotRemoved | ProjectViewPageNotUtf8Text> {
  switch (servedAs) {
    case "types_removed":
      return typeScriptWithItsTypesRemoved(pathInTheProject, fileBytes).pipe(Effect.map((javaScriptText) => Buffer.from(javaScriptText, "utf8")));
    case "with_import_map":
      return pageWithTheSuppliedModulesImportMap(pathInTheProject, fileBytes);
    case "as_read":
      return Effect.succeed(fileBytes);
  }
}

/** The file `requestUrl` asks for: one of a view a studio window listed as one that opens, read through the runtime, only for a project a studio window holds open. */
const projectViewFileServed = Effect.fn("project_view_file_served")(function* (requestUrl: string) {
  const fileAsked = projectViewFileOfTheRequest(requestUrl);
  if (fileAsked === null) return yield* new NotAProjectViewFile({ words: `${requestUrl} names no file of a project's view.` });
  const studioWindows = yield* StudioWindows;
  if (!studioWindows.aStudioWindowHoldsTheProjectIn(fileAsked.open_project_folder)) {
    return yield* new ProjectViewNotOpenInAStudioWindow({ words: `${fileAsked.open_project_folder} is not a project open in a studio window.` });
  }
  const projectViewsListed = yield* ProjectViewsListed;
  if (!projectViewsListed.isListedAsOpening(fileAsked.open_project_folder, fileAsked.view_folder_in_the_project)) {
    return yield* new ProjectViewNotOpenInAStudioWindow({ words: `${fileAsked.view_folder_in_the_project} is not a view the studio window of ${fileAsked.open_project_folder} listed.` });
  }
  const runtimeControl = yield* RuntimeControl;
  const fileRead = yield* runtimeControl.call("read_project_file", { project_directory: fileAsked.open_project_folder, path: fileAsked.path_in_the_project });
  const fileBytes = yield* fromResult(bytesOfTheBase64ContentOfTheContract(fileRead), (failure) => new ProjectFileBytesUnreadable({ words: `the runtime's read_project_file result could not be read: ${failure}` }));
  const serving = howAProjectViewFileIsServed(fileAsked.path_in_the_project);
  const servedBytes = yield* projectViewFileAsServed(fileAsked.path_in_the_project, fileBytes, serving.served_as);
  return { kind: "served", content_type: serving.content_type, file_bytes: servedBytes } satisfies ProjectViewFileAnswer;
});

/** The answer to `requestUrl`: the file served, or the status and words of what stopped it; a file not servable as its author wrote it is logged with its words. */
function answerAProjectViewFileRequest(requestUrl: string): Effect.Effect<ProjectViewFileAnswer, never, StudioWindows | ProjectViewsListed | RuntimeControl> {
  return projectViewFileServed(requestUrl).pipe(
    Effect.tapError((notServed) => (statusOfAFileNotServed(notServed) === 422 ? Effect.logWarning("a project view's file was not served as its author wrote it", notServed.words) : Effect.void)),
    Effect.catch((notServed) => Effect.succeed<ProjectViewFileAnswer>({ kind: "not_served", status: statusOfAFileNotServed(notServed), because: notServed.words })),
  );
}

/** How a request for `requestUrl` answers when serving it ended without an answer: `cause` was a defect, or the runtime that ran it was disposed. */
function answerOfARequestThatEndedWithoutAnAnswer(requestUrl: string, cause: Cause.Cause<unknown>): ProjectViewFileAnswer {
  return { kind: "not_served", status: 500, because: `serving ${requestUrl} ended without an answer: ${describeCaughtFailure(Cause.squash(cause))}` };
}

/**
 * Every request for a project view's file answered on `studioRuntime`, never rejected: a defect is logged and answers that
 * serving it ended without an answer, and so does a request the runtime was disposed under, logged to `tatolabAppLog`.
 */
export function projectViewFileRequestsAnsweredOn(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioWindows | ProjectViewsListed | RuntimeControl, never>,
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
