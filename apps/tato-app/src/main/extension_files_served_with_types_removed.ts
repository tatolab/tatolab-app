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
import { TATOLAB_WINDOW_PAGE_HOST, TATOLAB_WINDOW_PAGE_SCHEME } from "../shared/tatolab_electron_bridge_contract.js";
import { bytesOfTheBase64ContentOfTheContract } from "./project_files_on_the_wire.js";
import { describeCaughtFailure } from "./result.js";
import { fromResult } from "./result_as_effect.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { ProjectViewsListed, StudioWindows } from "./studio_runtime.js";
import { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { typeScriptWithItsTypesRemoved, type TypeScriptTypesNotRemoved } from "./typescript_types_removed.js";

/** Where the window serves project views' files. */
export const PROJECT_VIEW_FILES_PATH = "/project_views/";

/** A view's folder inside a project: its own `views/<folder>`, or an import's `imports/<import>/views/<folder>`. */
const VIEW_FOLDER_IN_A_PROJECT = /^(?:views\/[^/]+|imports\/[^/]+\/views\/[^/]+)(?=\/)/;

/** The content type each file a view's folder may hold is served with, by its extension; any other is served as bytes. A `.ts` file is served with its types removed. */
const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".ts", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".wasm", "application/wasm"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".txt", "text/plain; charset=utf-8"],
]);

/** The URL the view folder `viewFolderInTheProject` of the project in `openProjectFolder` is served under, which its entry and every file it loads resolve against. */
export function projectViewFolderUrl(openProjectFolder: string, viewFolderInTheProject: string): string {
  const encodedPath = viewFolderInTheProject.split("/").map(encodeURIComponent).join("/");
  return `${TATOLAB_WINDOW_PAGE_SCHEME}://${TATOLAB_WINDOW_PAGE_HOST}${PROJECT_VIEW_FILES_PATH}${Buffer.from(openProjectFolder, "utf8").toString("base64url")}/${encodedPath}/`;
}

/** Whether `url` is served from a project's view folder. */
export function isAProjectViewFileUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsedUrl = new URL(url);
  return parsedUrl.protocol === `${TATOLAB_WINDOW_PAGE_SCHEME}:` && parsedUrl.host === TATOLAB_WINDOW_PAGE_HOST && parsedUrl.pathname.startsWith(PROJECT_VIEW_FILES_PATH);
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

/** The content type `pathInTheProject` is served with. */
export function contentTypeOfAProjectViewFile(pathInTheProject: string): string {
  return CONTENT_TYPE_BY_EXTENSION.get(path.posix.extname(pathInTheProject).toLowerCase()) ?? "application/octet-stream";
}

/** How a request for a project view's file is answered: its bytes, or a status with why. */
export type ProjectViewFileAnswer = { kind: "served"; content_type: string; file_bytes: Buffer } | { kind: "not_served"; status: 403 | 404 | 422 | 500; because: string };

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

/** Every way a request for a project view's file goes unserved. */
type ProjectViewFileNotServed = NotAProjectViewFile | ProjectViewNotOpenInAStudioWindow | ProjectFileBytesUnreadable | TypeScriptTypesNotRemoved | RuntimeControlFailure;

/** The status a request answers with when `notServed` stopped it. */
function statusOfAFileNotServed(notServed: ProjectViewFileNotServed): 403 | 404 | 422 {
  switch (notServed._tag) {
    case "ProjectViewNotOpenInAStudioWindow":
      return 403;
    case "TypeScriptTypesNotRemoved":
      return 422;
    case "NotAProjectViewFile":
    case "ProjectFileBytesUnreadable":
    case "RuntimeRefused":
    case "RuntimeUnreachable":
    case "RuntimeTimedOut":
    case "ContractMismatch":
      return 404;
  }
}

/** The file at `pathInTheProject`, whose bytes the runtime read as `fileBytes`, as a page is served it: a `.ts` file with its types removed, a page with the supplied modules' import map, any other file as it is. */
function projectViewFileAsServed(pathInTheProject: string, fileBytes: Buffer): Effect.Effect<Buffer, TypeScriptTypesNotRemoved> {
  switch (path.posix.extname(pathInTheProject).toLowerCase()) {
    case ".ts":
      return typeScriptWithItsTypesRemoved(pathInTheProject, fileBytes).pipe(Effect.map((javaScriptText) => Buffer.from(javaScriptText, "utf8")));
    case ".html":
      return Effect.succeed(Buffer.from(withTheSuppliedModulesImportMap(fileBytes.toString("utf8")), "utf8"));
    default:
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
  const servedBytes = yield* projectViewFileAsServed(fileAsked.path_in_the_project, fileBytes);
  return { kind: "served", content_type: contentTypeOfAProjectViewFile(fileAsked.path_in_the_project), file_bytes: servedBytes } satisfies ProjectViewFileAnswer;
});

/** The answer to `requestUrl`: the file served, or the status and words of what stopped it; a file whose types could not be removed is logged with its line. */
export function answerAProjectViewFileRequest(requestUrl: string): Effect.Effect<ProjectViewFileAnswer, never, StudioWindows | ProjectViewsListed | RuntimeControl> {
  return projectViewFileServed(requestUrl).pipe(
    Effect.tapError((notServed) => (notServed._tag === "TypeScriptTypesNotRemoved" ? Effect.logWarning("a project view's .ts file was not served", notServed.words) : Effect.void)),
    Effect.catch((notServed) => Effect.succeed<ProjectViewFileAnswer>({ kind: "not_served", status: statusOfAFileNotServed(notServed), because: notServed.words })),
  );
}

/** How a request for `requestUrl` answers when serving it ended without an answer: `cause` was a defect, or the runtime that ran it was disposed. */
function answerOfARequestThatEndedWithoutAnAnswer(requestUrl: string, cause: Cause.Cause<unknown>): ProjectViewFileAnswer {
  return { kind: "not_served", status: 500, because: `serving ${requestUrl} ended without an answer: ${describeCaughtFailure(Cause.squash(cause))}` };
}

/** Every request for a project view's file answered on `studioRuntime`, never rejected: a defect is logged and answers that serving it ended without an answer. */
export function projectViewFileRequestsAnsweredOn(
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioWindows | ProjectViewsListed | RuntimeControl, never>,
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
      .then((answered) => (Exit.isSuccess(answered) ? answered.value : answerOfARequestThatEndedWithoutAnAnswer(requestUrl, answered.cause)));
}
