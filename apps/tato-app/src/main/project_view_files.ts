// A project's views are served to their frames from the bytes the runtime's `read_project_file`
// answers, under the window page's own scheme: `tatolab-app://app/project_views/<open project>/
// <view folder>/<file>`, the open project's folder written as base64url so the URL names which
// project's history the bytes come from. The app reads no project file from disk.

import path from "node:path";
import { TATOLAB_WINDOW_PAGE_HOST, TATOLAB_WINDOW_PAGE_SCHEME } from "../shared/tatolab_electron_bridge_contract.js";
import type { Result } from "./result.js";

/** Where the window serves project views' files. */
export const PROJECT_VIEW_FILES_PATH = "/project_views/";

/** A view's folder inside a project: its own `views/<folder>`, or an import's `imports/<import>/views/<folder>`. */
const VIEW_FOLDER_IN_A_PROJECT = /^(?:views\/[^/]+|imports\/[^/]+\/views\/[^/]+)\//;

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

/** Whether `url` is served from a project's view folder. */
export function isAProjectViewFileUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsedUrl = new URL(url);
  return parsedUrl.protocol === `${TATOLAB_WINDOW_PAGE_SCHEME}:` && parsedUrl.host === TATOLAB_WINDOW_PAGE_HOST && parsedUrl.pathname.startsWith(PROJECT_VIEW_FILES_PATH);
}

/** A file of a project view a request names: the open project's folder and the file's `/`-separated path in it, inside a view folder. */
export interface ProjectViewFileAsked {
  open_project_folder: string;
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
  if (!VIEW_FOLDER_IN_A_PROJECT.test(pathInTheProject)) return null;
  return { open_project_folder: openProjectFolder, path_in_the_project: pathInTheProject };
}

/** The content type `pathInTheProject` is served with. */
export function contentTypeOfAProjectViewFile(pathInTheProject: string): string {
  return CONTENT_TYPE_BY_EXTENSION.get(path.posix.extname(pathInTheProject).toLowerCase()) ?? "application/octet-stream";
}

/** How a request for a project view's file is answered: its bytes, or a status with why. */
export type ProjectViewFileAnswer = { kind: "served"; content_type: string; file_bytes: Buffer } | { kind: "not_served"; status: 403 | 404; because: string };

/** How the running app answers a request for a project view's file. */
export type AnswerAProjectViewFileRequest = (requestUrl: string) => Promise<ProjectViewFileAnswer>;

/** What a project view's file is served from: whether a studio window holds the project open, and the runtime's `read_project_file`. */
export interface ProjectViewFilesSources {
  aStudioWindowHoldsTheProjectIn(projectFolder: string): boolean;
  readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, string>>;
}

/** The answer to `requestUrl`: a project view's file read through the runtime, only for a project a studio window holds open. */
export async function answerAProjectViewFileRequest(requestUrl: string, sources: ProjectViewFilesSources): Promise<ProjectViewFileAnswer> {
  const fileAsked = projectViewFileOfTheRequest(requestUrl);
  if (fileAsked === null) return { kind: "not_served", status: 404, because: `${requestUrl} names no file of a project's view.` };
  if (!sources.aStudioWindowHoldsTheProjectIn(fileAsked.open_project_folder)) {
    return { kind: "not_served", status: 403, because: `${fileAsked.open_project_folder} is not a project open in a studio window.` };
  }
  const fileBytes = await sources.readProjectFile(fileAsked.open_project_folder, fileAsked.path_in_the_project);
  if (!fileBytes.ok) return { kind: "not_served", status: 404, because: fileBytes.failure };
  return { kind: "served", content_type: contentTypeOfAProjectViewFile(fileAsked.path_in_the_project), file_bytes: fileBytes.value };
}
