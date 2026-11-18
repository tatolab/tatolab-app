import { createHash } from "node:crypto";
import { SUPPLIED_MODULES_IMPORT_MAP_TEXT } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { Layer, ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import {
  howAProjectViewFileIsServed,
  projectViewFileOfTheRequest,
  projectViewFileRequestsAnsweredOn,
  projectViewFolderUrl,
  ProjectViewsListedToTheWindows,
  type ExtensionFileAnswer,
} from "./extension_files_served_with_types_removed.js";
import { controlOperationResponseOfTheRecordedToolResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { ProjectViewsListed, StudioWindows, tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps, recordedResponseBody } from "./tatolab_commands_test_support.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";

afterEach(cleanUpTheFakesTheLastTestMade);

const NIGHT_SHOW = "/home/sam/streams/night-show";
/** The bytes of night-show's recorded `views/deck/icon.png`. */
const RECORDED_DECK_ICON = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGM4YRP1HxkzkC4AAAAXJdG9hqaJAAAAAElFTkSuQmCC", "base64");

test("a view's folder is served under the window page's scheme, naming the open project, and a request in it names the view folder and the file in the project", () => {
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");
  const meterFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "imports/lobby-wall/views/meter");

  expect(deckFolderUrl).toBe("tatolab-app://app/project_views/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/views/deck/");
  expect(projectViewFileOfTheRequest(new URL("index.html", deckFolderUrl).href)).toEqual({ open_project_folder: NIGHT_SHOW, view_folder_in_the_project: "views/deck", path_in_the_project: "views/deck/index.html" });
  expect(projectViewFileOfTheRequest(new URL("assets/app.js?v=2", meterFolderUrl).href)).toEqual({
    open_project_folder: NIGHT_SHOW,
    view_folder_in_the_project: "imports/lobby-wall/views/meter",
    path_in_the_project: "imports/lobby-wall/views/meter/assets/app.js",
  });
});

test("a request outside a view folder, climbing out of one, or naming a project folder that is not absolute names no file", () => {
  const encodedNightShow = Buffer.from(NIGHT_SHOW).toString("base64url");
  for (const requestUrl of [
    `tatolab-app://app/project_views/${encodedNightShow}/nodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/tatolab-project.json`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck/%2E%2E/%2E%2E/nodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck%2F..%2F..%2Fnodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck/..%5C..%5Cnodes%5Ccamera.py`,
    `tatolab-app://app/project_views/${Buffer.from("streams/night-show").toString("base64url")}/views/deck/index.html`,
    `tatolab-app://app/project_views/${encodedNightShow}`,
    `tatolab-app://app/core_views/outliner/index.html`,
    `https://example.com/project_views/${encodedNightShow}/views/deck/index.html`,
  ]) {
    expect(projectViewFileOfTheRequest(requestUrl)).toBeNull();
  }
});

test("each file a view's folder holds is served with its content type and its transform: a page with the import map, a .ts file as JavaScript with its types removed, any other as read", () => {
  expect(["views/deck/index.html", "views/deck/assets/app.js", "views/deck/deck.TS", "views/deck/icon.png", "views/deck/model.onnx"].map(howAProjectViewFileIsServed)).toEqual([
    { content_type: "text/html; charset=utf-8", served_as: "with_import_map" },
    { content_type: "text/javascript; charset=utf-8", served_as: "as_read" },
    { content_type: "text/javascript; charset=utf-8", served_as: "types_removed" },
    { content_type: "image/png", served_as: "as_read" },
    { content_type: "application/octet-stream", served_as: "as_read" },
  ]);
});

const IMPORT_MAP_SCRIPT = `<script type="importmap">${SUPPLIED_MODULES_IMPORT_MAP_TEXT}</script>`;
const DECK_PAGE = '<!doctype html>\n<script type="module" src="./deck.ts"></script>\n';
/** A view written in `.ts` only: its entry imports the SDK by name and its own file by relative path, with types to remove. */
const DECK_SCRIPT = [
  'import { PORT_FAMILIES, type PortFamily } from "@tatolab/tato-app-view-sdk/port_families";',
  'import { meterLevel } from "./meter.ts";',
  "",
  "const firstFamily: PortFamily = PORT_FAMILIES[0];",
  "export function deckLabel<Label extends string>(label: Label): string {",
  "  return `${label} ${firstFamily} ${meterLevel(0.5 as number)}`;",
  "}",
  "",
].join("\n");
const DECK_SCRIPT_WITH_ITS_TYPES_REMOVED = [
  'import { PORT_FAMILIES,                 } from "@tatolab/tato-app-view-sdk/port_families";',
  'import { meterLevel } from "./meter.ts";',
  "",
  "const firstFamily             = PORT_FAMILIES[0];",
  "export function deckLabel                      (label       )         {",
  "  return `${label} ${firstFamily} ${meterLevel(0.5          )}`;",
  "}",
  "",
  "",
  "//# sourceURL=views/deck/deck.ts",
].join("\n");
const SCRIPT_WITH_AN_ENUM = ["const tracks = 2;", "", "enum Lane {", "  Left,", "}", ""].join("\n");
const VENDORED_SCRIPT = "export const chart = (points: number) => points;\n";

/** The runtime's `read_project_file` answer for `filePath` holding `fileText`, as the contract writes it. */
function fileReadAnswer(filePath: string, fileText: string): Buffer {
  const fileBytes = Buffer.from(fileText, "utf8");
  return controlOperationResultResponse({
    path: filePath,
    byte_len: fileBytes.length,
    content_base64: fileBytes.toString("base64"),
    content_sha256: createHash("sha256").update(fileBytes).digest("hex"),
  });
}

/**
 * Requests for project views' files answered on the live `RuntimeControl` over a fake local API holding night-show's
 * views, a studio window holding night-show open and listing deck and weather as views that open; with every
 * `read_project_file` path the runtime was asked for and every line the app logged.
 */
async function projectViewFilesServedOverAnOpenNightShow(answerAnotherRead: (filePath: string) => Promise<Buffer | null> = async () => null) {
  const fileReadAnswers = new Map<string, () => Promise<Buffer>>([
    ["views/deck/icon.png", async () => controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-views-deck-icon-png.json"))],
    ["views/deck/index.html", async () => fileReadAnswer("views/deck/index.html", DECK_PAGE)],
    ["views/deck/deck.ts", async () => fileReadAnswer("views/deck/deck.ts", DECK_SCRIPT)],
    ["views/deck/lanes.ts", async () => fileReadAnswer("views/deck/lanes.ts", SCRIPT_WITH_AN_ENUM)],
    ["views/deck/vendor/chart.js", async () => fileReadAnswer("views/deck/vendor/chart.js", VENDORED_SCRIPT)],
    ["views/weather/index.html", async () => fileReadAnswer("views/weather/index.html", "<html><body></body></html>")],
  ]);
  const server = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    const filePath = String(params["path"]);
    const answerTheRead = method === "read_project_file" ? fileReadAnswers.get(filePath) : undefined;
    if (answerTheRead !== undefined) return answerTheRead();
    const anotherAnswer = await answerAnotherRead(filePath);
    if (anotherAnswer !== null) return anotherAnswer;
    return controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-refusal-for-a-path-outside-night-show.json"));
  });
  cleanUps.push(() => server.close());
  return { ...projectViewFilesServedAt(server.localApiSocketPath), pathsTheRuntimeWasAskedToRead: () => controlOperationCallsReceivedBy(server).map(([, params]) => (typeof params === "object" && params !== null && "path" in params ? params.path : null)) };
}

/** Requests for project views' files answered on the live `RuntimeControl` over the local API at `localApiSocketPath`, a studio window holding night-show open and listing deck and weather as views that open; with every line the app logged. */
function projectViewFilesServedAt(localApiSocketPath: string) {
  const projectViewsListed = new ProjectViewsListedToTheWindows();
  projectViewsListed.rememberTheListing(NIGHT_SHOW, projectViewsListed.startAListing(), [
    { view_folder_in_the_project: "views/deck", opens: true },
    { view_folder_in_the_project: "views/weather", opens: true },
    { view_folder_in_the_project: "views/broken", opens: false },
  ]);
  const loggedLines: string[] = [];
  const tatolabAppLog = createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine));
  const studioRuntime = ManagedRuntime.make(
    Layer.mergeAll(
      runtimeControlLayer(localApiSocketPath, 2_000),
      Layer.mock(StudioWindows, { aStudioWindowHoldsTheProjectIn: (projectFolder) => projectFolder === NIGHT_SHOW, folderOfTheWindowsOpenProject: () => null, openedFolderOfTheStudioWindow: () => null }),
      Layer.mock(ProjectViewsListed, { isListedAsOpening: (openProjectFolder, viewFolder) => projectViewsListed.isListedAsOpening(openProjectFolder, viewFolder) }),
      tatolabAppLogAsEffectsLogger(tatolabAppLog),
    ),
  );
  cleanUps.push(() => studioRuntime.dispose());
  return { answerAProjectViewFileRequest: projectViewFileRequestsAnsweredOn(studioRuntime, tatolabAppLog), loggedLines };
}

/** `answer` with the bytes it serves read as text. */
function withItsBytesAsText(answer: ExtensionFileAnswer) {
  return answer.kind === "served" ? { kind: answer.kind, content_type: answer.content_type, file_text: answer.file_bytes.toString("utf8") } : answer;
}

test("a view made only of .ts files is served as JavaScript with its types removed, each line and column where the author wrote it, and its page holds the import map straight after the doctype", async () => {
  const served = await projectViewFilesServedOverAnOpenNightShow();
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");

  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("index.html", deckFolderUrl).href))).toEqual({
    kind: "served",
    content_type: "text/html; charset=utf-8",
    file_text: `<!doctype html>${IMPORT_MAP_SCRIPT}\n<script type="module" src="./deck.ts"></script>\n`,
  });
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("deck.ts", deckFolderUrl).href))).toEqual({
    kind: "served",
    content_type: "text/javascript; charset=utf-8",
    file_text: DECK_SCRIPT_WITH_ITS_TYPES_REMOVED,
  });
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("index.html", projectViewFolderUrl(NIGHT_SHOW, "views/weather")).href))).toEqual({
    kind: "served",
    content_type: "text/html; charset=utf-8",
    file_text: `${IMPORT_MAP_SCRIPT}<html><body></body></html>`,
  });
  expect(served.pathsTheRuntimeWasAskedToRead()).toEqual(["views/deck/index.html", "views/deck/deck.ts", "views/weather/index.html"]);
});

test("a .js file and any other file are served as the runtime read them", async () => {
  const served = await projectViewFilesServedOverAnOpenNightShow();
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");

  expect(await served.answerAProjectViewFileRequest(new URL("icon.png", deckFolderUrl).href)).toEqual({ kind: "served", content_type: "image/png", file_bytes: RECORDED_DECK_ICON });
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("vendor/chart.js", deckFolderUrl).href))).toEqual({
    kind: "served",
    content_type: "text/javascript; charset=utf-8",
    file_text: VENDORED_SCRIPT,
  });
});

test("a .ts file whose types cannot be removed is not served, and the Studio names the file and the line", async () => {
  const served = await projectViewFilesServedOverAnOpenNightShow();

  expect(await served.answerAProjectViewFileRequest(new URL("lanes.ts", projectViewFolderUrl(NIGHT_SHOW, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 422,
    because: "views/deck/lanes.ts, line 3: TypeScript enum is not supported in strip-only mode",
  });
  expect(served.loggedLines.filter((logLine) => logLine.includes("a project view's file was not served as its author wrote it") && logLine.includes("views/deck/lanes.ts, line 3"))).toHaveLength(1);
});

test("a page that is not UTF-8 text is not served, since the import map cannot be written into it", async () => {
  const served = await projectViewFilesServedOverAnOpenNightShow(async (filePath) =>
    filePath === "views/deck/latin1.html" ? controlOperationResultResponse({ path: filePath, byte_len: 4, content_base64: Buffer.from([0x3c, 0x70, 0xe9, 0x3e]).toString("base64"), content_sha256: "0".repeat(64) }) : null,
  );

  expect(await served.answerAProjectViewFileRequest(new URL("latin1.html", projectViewFolderUrl(NIGHT_SHOW, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 422,
    because: "views/deck/latin1.html is not UTF-8 text, so the import map of the modules the Studio supplies cannot be written into it.",
  });
});

test("a runtime answer that breaks its contract answers 502, and no runtime answering answers 503", async () => {
  const served = await projectViewFilesServedOverAnOpenNightShow(async (filePath) => {
    if (filePath === "views/deck/short.ts") return controlOperationResultResponse({ path: filePath, byte_len: 99, content_base64: Buffer.from("x").toString("base64"), content_sha256: "0".repeat(64) });
    if (filePath === "views/deck/shapeless.ts") return controlOperationResultResponse({ path: filePath });
    return null;
  });
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");

  expect(await served.answerAProjectViewFileRequest(new URL("short.ts", deckFolderUrl).href)).toEqual({
    kind: "not_served",
    status: 502,
    because: "the runtime's read_project_file result could not be read: `content_base64` holds 1 bytes where `byte_len` says 99",
  });
  expect(await served.answerAProjectViewFileRequest(new URL("shapeless.ts", deckFolderUrl).href)).toMatchObject({ kind: "not_served", status: 502 });

  const nothingListening = projectViewFilesServedAt("/tmp/tl-app-nothing-listens-here/local-api.sock");
  expect(await nothingListening.answerAProjectViewFileRequest(new URL("deck.ts", deckFolderUrl).href)).toMatchObject({ kind: "not_served", status: 503 });
});

test("a file the runtime refuses to read is not served, in the runtime's words, and nothing is read for a request outside an open project's listed views", async () => {
  const served = await projectViewFilesServedOverAnOpenNightShow();

  expect(await served.answerAProjectViewFileRequest(new URL("missing.ts", projectViewFolderUrl(NIGHT_SHOW, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 404,
    because: "read_project_file failed: the file path `../elsewhere.txt` is refused: it holds `.`, `..` or a root, which could lead outside the project",
  });
  expect(await served.answerAProjectViewFileRequest(new URL("icon.png", projectViewFolderUrl("/home/sam/streams/other", "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 403,
    because: "/home/sam/streams/other is not a project open in a studio window.",
  });
  expect(await served.answerAProjectViewFileRequest("tatolab-app://app/core_views/outliner/index.html")).toEqual({
    kind: "not_served",
    status: 404,
    because: "tatolab-app://app/core_views/outliner/index.html names no file of a project's view.",
  });
  for (const viewFolder of ["views/unlisted", "views/broken"]) {
    expect(await served.answerAProjectViewFileRequest(new URL("index.html", projectViewFolderUrl(NIGHT_SHOW, viewFolder)).href)).toEqual({
      kind: "not_served",
      status: 403,
      because: `${viewFolder} is not a view the studio window of ${NIGHT_SHOW} listed.`,
    });
  }
  expect(served.pathsTheRuntimeWasAskedToRead()).toEqual(["views/deck/missing.ts"]);
});

test("a listing that answers after one started later is not kept over it", () => {
  const projectViewsListed = new ProjectViewsListedToTheWindows();
  const earlierListing = projectViewsListed.startAListing();
  const laterListing = projectViewsListed.startAListing();
  projectViewsListed.rememberTheListing(NIGHT_SHOW, laterListing, [{ view_folder_in_the_project: "views/deck", opens: true }]);
  projectViewsListed.rememberTheListing(NIGHT_SHOW, earlierListing, [{ view_folder_in_the_project: "views/deck", opens: false }]);
  expect(projectViewsListed.isListedAsOpening(NIGHT_SHOW, "views/deck")).toBe(true);

  projectViewsListed.rememberTheListing(NIGHT_SHOW, projectViewsListed.startAListing(), [{ view_folder_in_the_project: "views/deck", opens: false }]);
  expect(projectViewsListed.isListedAsOpening(NIGHT_SHOW, "views/deck")).toBe(false);
});
