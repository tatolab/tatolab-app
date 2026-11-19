import { SUPPLIED_MODULES_IMPORT_MAP_TEXT } from "@tatolab/tato-app-view-sdk/supplied_modules";
import { Layer, ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import { ExtensionFolderChecksKept, folderVersionOf, type ExtensionFolderPassed } from "./extension_check_gate.js";
import {
  projectViewFileOfTheRequest,
  projectViewFileRequestsAnsweredOn,
  projectViewFolderUrl,
  ProjectViewsListedToTheWindows,
  type ExtensionFileAnswer,
} from "./extension_files_served_with_types_removed.js";
import { ProjectViewsListed, StudioWindows, tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

const NIGHT_SHOW = "/home/sam/streams/night-show";
/** The bytes of night-show's recorded `views/deck/icon.png`. */
const RECORDED_DECK_ICON = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGM4YRP1HxkzkC4AAAAXJdG9hqaJAAAAAElFTkSuQmCC", "base64");
const A_VERSION = "0123456789abcdef";

test("a view's folder is served under the window page's scheme, naming the open project and the folder version, and a request in it names the view folder and the file in the project", () => {
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, A_VERSION, "views/deck");
  const meterFolderUrl = projectViewFolderUrl(NIGHT_SHOW, A_VERSION, "imports/lobby-wall/views/meter");

  expect(deckFolderUrl).toBe(`tatolab-app://app/project_views/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/${A_VERSION}/views/deck/`);
  expect(projectViewFileOfTheRequest(new URL("index.html", deckFolderUrl).href)).toEqual({
    open_project_folder: NIGHT_SHOW,
    folder_version: A_VERSION,
    view_folder_in_the_project: "views/deck",
    path_in_the_project: "views/deck/index.html",
  });
  expect(projectViewFileOfTheRequest(new URL("assets/app.js?v=2", meterFolderUrl).href)).toEqual({
    open_project_folder: NIGHT_SHOW,
    folder_version: A_VERSION,
    view_folder_in_the_project: "imports/lobby-wall/views/meter",
    path_in_the_project: "imports/lobby-wall/views/meter/assets/app.js",
  });
});

test("a request outside a view folder, climbing out of one, with no folder version, or naming a project folder that is not absolute names no file", () => {
  const encodedNightShow = Buffer.from(NIGHT_SHOW).toString("base64url");
  for (const requestUrl of [
    `tatolab-app://app/project_views/${encodedNightShow}/${A_VERSION}/nodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/${A_VERSION}/tatolab-project.json`,
    `tatolab-app://app/project_views/${encodedNightShow}/${A_VERSION}/views/deck`,
    `tatolab-app://app/project_views/${encodedNightShow}/${A_VERSION}/views/deck/%2E%2E/%2E%2E/nodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/${A_VERSION}/views/deck%2F..%2F..%2Fnodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/${A_VERSION}/views/deck/..%5C..%5Cnodes%5Ccamera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck/index.html`,
    `tatolab-app://app/project_views/${encodedNightShow}/NOT-A-VERSION/views/deck/index.html`,
    `tatolab-app://app/project_views/${Buffer.from("streams/night-show").toString("base64url")}/${A_VERSION}/views/deck/index.html`,
    `tatolab-app://app/project_views/${encodedNightShow}`,
    `tatolab-app://app/core_views/outliner/index.html`,
    `https://example.com/project_views/${encodedNightShow}/${A_VERSION}/views/deck/index.html`,
  ]) {
    expect(projectViewFileOfTheRequest(requestUrl)).toBeNull();
  }
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
const VENDORED_DECLARATION = "export declare const chart: (points: number) => number;\n";
/** A view's own built `.js`, outside `vendor/`, which is still served as it was read. */
const BUILT_SCRIPT = "export const meter = (level) => level;\n";

/** The views the gate passed: deck and weather, each file by its path in night-show. */
const DECK_FILES = new Map<string, Buffer>([
  ["views/deck/icon.png", RECORDED_DECK_ICON],
  ["views/deck/index.html", Buffer.from(DECK_PAGE)],
  ["views/deck/deck.ts", Buffer.from(DECK_SCRIPT)],
  ["views/deck/lanes.ts", Buffer.from(SCRIPT_WITH_AN_ENUM)],
  ["views/deck/vendor/chart.js", Buffer.from(VENDORED_SCRIPT)],
  ["views/deck/vendor/chart.d.ts", Buffer.from(VENDORED_DECLARATION)],
  ["views/deck/built_meter.js", Buffer.from(BUILT_SCRIPT)],
  ["views/deck/latin1.html", Buffer.from([0x3c, 0x70, 0xe9, 0x3e])],
]);
const WEATHER_FILES = new Map<string, Buffer>([["views/weather/index.html", Buffer.from("<html><body></body></html>")]]);
const DECK_VERSION = folderVersionOf(DECK_FILES);
const WEATHER_VERSION = folderVersionOf(WEATHER_FILES);

/** `files` as the gate passes a folder. */
function passed(files: ReadonlyMap<string, Buffer>): ExtensionFolderPassed {
  return { kind: "passed", folder_version: folderVersionOf(files), files };
}

/** Requests for project views' files answered over a studio window holding night-show open, whose last listing passed deck and weather; with every line the app logged. */
function projectViewFilesServedOverAnOpenNightShow() {
  const projectViewsListed = new ProjectViewsListedToTheWindows();
  projectViewsListed.rememberTheListing(
    NIGHT_SHOW,
    projectViewsListed.startAListing(),
    new Map([
      ["views/deck", passed(DECK_FILES)],
      ["views/weather", passed(WEATHER_FILES)],
    ]),
  );
  const loggedLines: string[] = [];
  const tatolabAppLog = createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine));
  const studioRuntime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.mock(StudioWindows, { aStudioWindowHoldsTheProjectIn: (projectFolder) => projectFolder === NIGHT_SHOW, folderOfTheWindowsOpenProject: () => null, openedFolderOfTheStudioWindow: () => null, windowFollowingTheRuntimeOf: () => null }),
      Layer.mock(ProjectViewsListed, {
        passedViewFolder: (openProjectFolder, folderVersion, viewFolder) => projectViewsListed.passedViewFolder(openProjectFolder, folderVersion, viewFolder),
        extensionFolderChecks: { kitFolderOfThisCheckout: null, checksKept: new ExtensionFolderChecksKept() },
      }),
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
  const served = projectViewFilesServedOverAnOpenNightShow();
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, DECK_VERSION, "views/deck");

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
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("index.html", projectViewFolderUrl(NIGHT_SHOW, WEATHER_VERSION, "views/weather")).href))).toEqual({
    kind: "served",
    content_type: "text/html; charset=utf-8",
    file_text: `${IMPORT_MAP_SCRIPT}<html><body></body></html>`,
  });
});

test("a library in the view's vendor/ folder is served as it is written, its declaration as text, and a .js file outside it and any other file as the gate read them", async () => {
  const served = projectViewFilesServedOverAnOpenNightShow();
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, DECK_VERSION, "views/deck");

  expect(await served.answerAProjectViewFileRequest(new URL("icon.png", deckFolderUrl).href)).toEqual({ kind: "served", content_type: "image/png", file_bytes: RECORDED_DECK_ICON });
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("vendor/chart.js", deckFolderUrl).href))).toEqual({
    kind: "served",
    content_type: "text/javascript; charset=utf-8",
    file_text: VENDORED_SCRIPT,
  });
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("vendor/chart.d.ts", deckFolderUrl).href))).toEqual({
    kind: "served",
    content_type: "text/plain; charset=utf-8",
    file_text: VENDORED_DECLARATION,
  });
  expect(withItsBytesAsText(await served.answerAProjectViewFileRequest(new URL("built_meter.js", deckFolderUrl).href))).toEqual({
    kind: "served",
    content_type: "text/javascript; charset=utf-8",
    file_text: BUILT_SCRIPT,
  });
});

test("a .ts file whose types cannot be removed is not served, and the Studio names the file and the line", async () => {
  const served = projectViewFilesServedOverAnOpenNightShow();

  expect(await served.answerAProjectViewFileRequest(new URL("lanes.ts", projectViewFolderUrl(NIGHT_SHOW, DECK_VERSION, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 422,
    because: "views/deck/lanes.ts, line 3: TypeScript enum is not supported in strip-only mode",
  });
  expect(served.loggedLines.filter((logLine) => logLine.includes("a project view's file was not served as its author wrote it") && logLine.includes("views/deck/lanes.ts, line 3"))).toHaveLength(1);
});

test("a page that is not UTF-8 text is not served, since the import map cannot be written into it", async () => {
  const served = projectViewFilesServedOverAnOpenNightShow();

  expect(await served.answerAProjectViewFileRequest(new URL("latin1.html", projectViewFolderUrl(NIGHT_SHOW, DECK_VERSION, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 422,
    because: "views/deck/latin1.html is not UTF-8 text, so the import map of the modules the Studio supplies cannot be written into it.",
  });
});

test("only the bytes the gate passed are served: a file outside them, another version of a passed folder, a folder not passed and a project no window holds are not", async () => {
  const served = projectViewFilesServedOverAnOpenNightShow();

  expect(await served.answerAProjectViewFileRequest(new URL("missing.ts", projectViewFolderUrl(NIGHT_SHOW, DECK_VERSION, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 404,
    because: "views/deck/missing.ts is not a file of the view folder the runtime checked.",
  });
  expect(await served.answerAProjectViewFileRequest(new URL("index.html", projectViewFolderUrl(NIGHT_SHOW, WEATHER_VERSION, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 403,
    because: `views/deck at ${WEATHER_VERSION} is not a view the studio window of ${NIGHT_SHOW} last listed as passing its check.`,
  });
  expect(await served.answerAProjectViewFileRequest(new URL("icon.png", projectViewFolderUrl("/home/sam/streams/other", DECK_VERSION, "views/deck")).href)).toEqual({
    kind: "not_served",
    status: 403,
    because: "/home/sam/streams/other is not a project open in a studio window.",
  });
  expect(await served.answerAProjectViewFileRequest("tatolab-app://app/core_views/outliner/index.html")).toEqual({
    kind: "not_served",
    status: 404,
    because: "tatolab-app://app/core_views/outliner/index.html names no file of a project's view.",
  });
  expect(await served.answerAProjectViewFileRequest(new URL("index.html", projectViewFolderUrl(NIGHT_SHOW, DECK_VERSION, "views/broken")).href)).toEqual({
    kind: "not_served",
    status: 403,
    because: `views/broken at ${DECK_VERSION} is not a view the studio window of ${NIGHT_SHOW} last listed as passing its check.`,
  });
});

test("a listing that answers after one started later is not kept over it", () => {
  const projectViewsListed = new ProjectViewsListedToTheWindows();
  const earlierListing = projectViewsListed.startAListing();
  const laterListing = projectViewsListed.startAListing();
  projectViewsListed.rememberTheListing(NIGHT_SHOW, laterListing, new Map([["views/deck", passed(DECK_FILES)]]));
  projectViewsListed.rememberTheListing(NIGHT_SHOW, earlierListing, new Map());
  expect(projectViewsListed.passedViewFolder(NIGHT_SHOW, DECK_VERSION, "views/deck")?.files).toBe(DECK_FILES);

  projectViewsListed.rememberTheListing(NIGHT_SHOW, projectViewsListed.startAListing(), new Map());
  expect(projectViewsListed.passedViewFolder(NIGHT_SHOW, DECK_VERSION, "views/deck")).toBeNull();
});
