// A project's views are served to their frames from the bytes the runtime's `read_project_file`
// answers, under the window page's own scheme: `tatolab-app://app/project_views/<open project>/
// <view folder>/<file>`, the open project's folder written as base64url so the URL names which
// project's history the bytes come from. Only a view a studio window listed as one that opens is
// served. A full-access view runs on the window's origin with no policy of its own; a sandboxed
// view's pages carry one that holds them to their own folder and the hosts their manifest lists.
// The app reads no project file from disk.

import path from "node:path";
import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk/tatolab_view_manifest";
import { TATOLAB_WINDOW_PAGE_HOST, TATOLAB_WINDOW_PAGE_SCHEME } from "../shared/tatolab_electron_bridge_contract.js";
import type { Result } from "./result.js";

/** Where the window serves project views' files. */
export const PROJECT_VIEW_FILES_PATH = "/project_views/";

/** A view's folder inside a project, at the start of a path: its own `views/<folder>`, or an import's `imports/<import>/views/<folder>`. */
const VIEW_FOLDER_IN_A_PROJECT = /^(?:views\/[^/]+|imports\/[^/]+\/views\/[^/]+)(?=\/)/;

/** The content type each file a view's built folder may hold is served with, by its extension; any other is served as bytes. */
const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
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

/**
 * The content security policy a sandboxed view's pages are served with: they load only from `viewFolderUrl`, their own
 * folder, frame nothing, and connect only to the `network` hosts `networkHosts` its manifest lists.
 */
export function sandboxedProjectViewContentSecurityPolicy(viewFolderUrl: string, networkHosts: readonly string[]): string {
  return [
    `default-src ${viewFolderUrl}`,
    `script-src ${viewFolderUrl} 'wasm-unsafe-eval'`,
    `style-src ${viewFolderUrl} 'unsafe-inline'`,
    `img-src ${viewFolderUrl} data: blob:`,
    `media-src ${viewFolderUrl} blob: mediastream:`,
    `font-src ${viewFolderUrl} data:`,
    [`connect-src ${viewFolderUrl}`, ...networkHosts.flatMap((networkHost) => [`https://${networkHost}`, `wss://${networkHost}`])].join(" "),
    `worker-src ${viewFolderUrl} blob:`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** The policy the pages of the view in `viewFolderUrl`, whose `tatolab_view.json` reads `manifestJson`, are served with: none for a full-access view, which runs on the window's origin, its sandbox's for a sandboxed one or one whose manifest does not read. */
export function contentSecurityPolicyOfTheViewsManifest(viewFolderUrl: string, manifestJson: unknown): string | null {
  const manifestReading = readTatolabViewManifest(manifestJson);
  if (manifestReading.kind === "not_read") return sandboxedProjectViewContentSecurityPolicy(viewFolderUrl, []);
  if (!manifestReading.manifest.sandbox) return null;
  return sandboxedProjectViewContentSecurityPolicy(viewFolderUrl, manifestReading.manifest.network);
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

/** How a request for a project view's file is answered: its bytes, under a sandboxed view's content security policy or none, or a status with why. */
export type ProjectViewFileAnswer =
  | { kind: "served"; content_type: string; content_security_policy: string | null; file_bytes: Buffer }
  | { kind: "not_served"; status: 403 | 404; because: string };

/** How the running app answers a request for a project view's file. */
export type AnswerAProjectViewFileRequest = (requestUrl: string) => Promise<ProjectViewFileAnswer>;

/** A view a studio window listed as one that opens, with the policy its pages are served under as its manifest read then; `null` for none. */
interface ProjectViewServedToTheWindow {
  content_security_policy: string | null;
}

/** The views each studio window's view-type menu last listed as ones that open, by project and view folder: the only folders served, under the policy that one reading of the manifest calls for. */
export class ProjectViewsListedToTheWindows {
  private readonly viewsServedByOpenProjectFolder = new Map<string, ReadonlyMap<string, ProjectViewServedToTheWindow>>();

  /** Keep the views that open in `listedViews`, the listing of the project in `openProjectFolder`, in place of its last listing. */
  rememberTheListing(openProjectFolder: string, listedViews: readonly { view_folder_in_the_project: string; opens: boolean; manifest: unknown }[]): void {
    const viewsServedByViewFolder = new Map<string, ProjectViewServedToTheWindow>();
    for (const listedView of listedViews) {
      if (!listedView.opens) continue;
      const viewFolderUrl = projectViewFolderUrl(openProjectFolder, listedView.view_folder_in_the_project);
      viewsServedByViewFolder.set(listedView.view_folder_in_the_project, { content_security_policy: contentSecurityPolicyOfTheViewsManifest(viewFolderUrl, listedView.manifest) });
    }
    this.viewsServedByOpenProjectFolder.set(openProjectFolder, viewsServedByViewFolder);
  }

  /** The view in `viewFolderInTheProject` of the project in `openProjectFolder`, as last listed; `null` when no listing holds it as one that opens. */
  listedViewIn(openProjectFolder: string, viewFolderInTheProject: string): ProjectViewServedToTheWindow | null {
    return this.viewsServedByOpenProjectFolder.get(openProjectFolder)?.get(viewFolderInTheProject) ?? null;
  }
}

/** What a project view's file is served from: whether a studio window holds the project open, the views the windows listed, and the runtime's `read_project_file`. */
export interface ProjectViewFilesSources {
  aStudioWindowHoldsTheProjectIn(projectFolder: string): boolean;
  projectViewsListed: ProjectViewsListedToTheWindows;
  readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, string>>;
}

/** The answer to `requestUrl`: a file of a view a studio window listed, read through the runtime, under the policy its listed manifest calls for; only for a project a studio window holds open. */
export async function answerAProjectViewFileRequest(requestUrl: string, sources: ProjectViewFilesSources): Promise<ProjectViewFileAnswer> {
  const fileAsked = projectViewFileOfTheRequest(requestUrl);
  if (fileAsked === null) return { kind: "not_served", status: 404, because: `${requestUrl} names no file of a project's view.` };
  if (!sources.aStudioWindowHoldsTheProjectIn(fileAsked.open_project_folder)) {
    return { kind: "not_served", status: 403, because: `${fileAsked.open_project_folder} is not a project open in a studio window.` };
  }
  const listedView = sources.projectViewsListed.listedViewIn(fileAsked.open_project_folder, fileAsked.view_folder_in_the_project);
  if (listedView === null) {
    return { kind: "not_served", status: 403, because: `${fileAsked.view_folder_in_the_project} is not a view the studio window of ${fileAsked.open_project_folder} listed.` };
  }
  const fileBytes = await sources.readProjectFile(fileAsked.open_project_folder, fileAsked.path_in_the_project);
  if (!fileBytes.ok) return { kind: "not_served", status: 404, because: fileBytes.failure };
  return {
    kind: "served",
    content_type: contentTypeOfAProjectViewFile(fileAsked.path_in_the_project),
    content_security_policy: listedView.content_security_policy,
    file_bytes: fileBytes.value,
  };
}
