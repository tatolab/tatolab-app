// A project's views are served to their frames from the bytes the runtime's `read_project_file`
// answers, each view folder on an origin of its own: `tatolab-view://<origin host>/<open project>/
// <view folder>/<file>`, the open project's folder written as base64url so the URL names which
// project's history the bytes come from, and the host a hash of the project and the view folder, so a
// request is served only from the folder its origin stands for. On its own origin a view reaches
// neither the window page, whose bridge invokes every command, nor another view's files. The app reads
// no project file from disk.

import { createHash } from "node:crypto";
import path from "node:path";
import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk/tatolab_view_manifest";
import { TATOLAB_PROJECT_VIEW_SCHEME } from "../shared/tatolab_electron_bridge_contract.js";
import type { Result } from "./result.js";

/** A view's folder inside a project, at the start of a path: its own `views/<folder>`, or an import's `imports/<import>/views/<folder>`. */
const VIEW_FOLDER_IN_A_PROJECT = /^(?:views\/[^/]+|imports\/[^/]+\/views\/[^/]+)(?=\/)/;

/** Hex characters of the hash a view's origin host keeps: 128 bits, short of a DNS label's 63. */
const PROJECT_VIEW_ORIGIN_HOST_LENGTH = 32;

/** Where a view's page may connect when its manifest does not read: its own origin alone. */
const CONNECT_SOURCES_OF_A_VIEW_WHOSE_MANIFEST_DOES_NOT_READ: readonly string[] = [];

/** Where a full-access view's page may connect: anywhere on the network, the same trust its project's nodes have. */
const CONNECT_SOURCES_OF_A_FULL_ACCESS_VIEW: readonly string[] = ["*"];

/**
 * The content security policy a project view's page is served with: it loads only from its own origin and frames
 * nothing, so all it reaches of Studio is the view SDK's port; it connects to its own origin and `connectSources`.
 */
export function projectViewContentSecurityPolicy(connectSources: readonly string[]): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "font-src 'self' data:",
    ["connect-src 'self'", ...connectSources].join(" "),
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Where the view whose `tatolab_view.json` reads `manifestJson` may connect: anywhere with full access, only the `network` hosts it lists when sandboxed, its own origin alone when it does not read. */
export function connectSourcesOfTheViewsManifest(manifestJson: unknown): readonly string[] {
  const manifestReading = readTatolabViewManifest(manifestJson);
  if (manifestReading.kind === "not_read") return CONNECT_SOURCES_OF_A_VIEW_WHOSE_MANIFEST_DOES_NOT_READ;
  if (!manifestReading.manifest.sandbox) return CONNECT_SOURCES_OF_A_FULL_ACCESS_VIEW;
  return manifestReading.manifest.network.flatMap((networkHost) => [`https://${networkHost}`, `wss://${networkHost}`]);
}

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

/** The host of the origin the view folder `viewFolderInTheProject` of the project in `openProjectFolder` is served on. */
function projectViewOriginHost(openProjectFolder: string, viewFolderInTheProject: string): string {
  return createHash("sha256").update(`${openProjectFolder}\0${viewFolderInTheProject}`).digest("hex").slice(0, PROJECT_VIEW_ORIGIN_HOST_LENGTH);
}

/** The URL the view folder `viewFolderInTheProject` of the project in `openProjectFolder` is served under, on its own origin, which its entry and every file it loads resolve against. */
export function projectViewFolderUrl(openProjectFolder: string, viewFolderInTheProject: string): string {
  const encodedPath = viewFolderInTheProject.split("/").map(encodeURIComponent).join("/");
  const encodedOpenProjectFolder = Buffer.from(openProjectFolder, "utf8").toString("base64url");
  return `${TATOLAB_PROJECT_VIEW_SCHEME}://${projectViewOriginHost(openProjectFolder, viewFolderInTheProject)}/${encodedOpenProjectFolder}/${encodedPath}/`;
}

/** Whether `url` is served from a project's view folder. */
export function isAProjectViewFileUrl(url: string): boolean {
  return URL.canParse(url) && new URL(url).protocol === `${TATOLAB_PROJECT_VIEW_SCHEME}:`;
}

/** A file of a project view a request names: the open project's folder, the view folder its origin stands for, and the file's `/`-separated path in the project, inside that folder. */
export interface ProjectViewFileAsked {
  open_project_folder: string;
  view_folder_in_the_project: string;
  path_in_the_project: string;
}

/** The project view file `requestUrl` asks for, or `null` when it names none: another scheme, a project folder that is not absolute, a file outside a view folder, or a view folder its origin does not stand for. */
export function projectViewFileOfTheRequest(requestUrl: string): ProjectViewFileAsked | null {
  if (!isAProjectViewFileUrl(requestUrl)) return null;
  const parsedRequestUrl = new URL(requestUrl);
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(parsedRequestUrl.pathname.slice(1));
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
  if (viewFolderInTheProject === undefined || parsedRequestUrl.host !== projectViewOriginHost(openProjectFolder, viewFolderInTheProject)) return null;
  return { open_project_folder: openProjectFolder, view_folder_in_the_project: viewFolderInTheProject, path_in_the_project: pathInTheProject };
}

/** The content type `pathInTheProject` is served with. */
export function contentTypeOfAProjectViewFile(pathInTheProject: string): string {
  return CONTENT_TYPE_BY_EXTENSION.get(path.posix.extname(pathInTheProject).toLowerCase()) ?? "application/octet-stream";
}

/** How a request for a project view's file is answered: its bytes under the view's content security policy, or a status with why. */
export type ProjectViewFileAnswer =
  | { kind: "served"; content_type: string; content_security_policy: string; file_bytes: Buffer }
  | { kind: "not_served"; status: 403 | 404; because: string };

/** A view's manifest, beside its files: the file the view contract names. */
const VIEW_MANIFEST_FILE_NAME = "tatolab_view.json";

/** Content types the content security policy is enforced on, a page or a worker's script, for which the view's manifest is read. */
const CONTENT_TYPES_A_POLICY_GOVERNS: ReadonlySet<string> = new Set(["text/html; charset=utf-8", "text/javascript; charset=utf-8"]);

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
  const contentType = contentTypeOfAProjectViewFile(fileAsked.path_in_the_project);
  const connectSources = CONTENT_TYPES_A_POLICY_GOVERNS.has(contentType)
    ? await connectSourcesOfTheViewInTheFolder(sources, fileAsked.open_project_folder, fileAsked.view_folder_in_the_project)
    : CONNECT_SOURCES_OF_A_VIEW_WHOSE_MANIFEST_DOES_NOT_READ;
  return { kind: "served", content_type: contentType, content_security_policy: projectViewContentSecurityPolicy(connectSources), file_bytes: fileBytes.value };
}

/** Where the view in `viewFolderInTheProject` may connect, from its manifest as the runtime reads it; its own origin alone when the manifest does not read. */
async function connectSourcesOfTheViewInTheFolder(sources: ProjectViewFilesSources, openProjectFolder: string, viewFolderInTheProject: string): Promise<readonly string[]> {
  const manifestBytes = await sources.readProjectFile(openProjectFolder, `${viewFolderInTheProject}/${VIEW_MANIFEST_FILE_NAME}`);
  if (!manifestBytes.ok) return CONNECT_SOURCES_OF_A_VIEW_WHOSE_MANIFEST_DOES_NOT_READ;
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBytes.value.toString("utf8"));
  } catch {
    return CONNECT_SOURCES_OF_A_VIEW_WHOSE_MANIFEST_DOES_NOT_READ;
  }
  return connectSourcesOfTheViewsManifest(manifestJson);
}
