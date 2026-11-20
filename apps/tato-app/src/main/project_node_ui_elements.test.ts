import { Effect, Layer } from "effect";
import { afterEach, expect, test } from "vitest";
import { ExtensionFolderChecksKept, folderVersionOf } from "./extension_check_gate.js";
import { answersOfAFolderPassingTheGate, fileReadAnswer } from "./extension_check_gate_test_support.js";
import { projectViewFolderUrl, ProjectViewsListedToTheWindows } from "./extension_files_served_with_types_removed.js";
import { controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { projectNodeUiElementsOfTheOpenProject } from "./project_node_ui_elements.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { ProjectViewsListed } from "./studio_runtime.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

const NIGHT_SHOW = "/home/sam/streams/night-show";
const NIGHT_SHOW_MODULE = { project: "7d1c2b9e-4f3a-4e8b-9c61-2a5d8e0f3b47", project_name: "night-show", import_folder: null };
const LOBBY_WALL_MODULE = { project: "3e0b6a52-91c4-4f7d-8a2e-5c9d1b7f0e63", project_name: "lobby-wall", import_folder: "lobby-wall" };
const KNOB_SCRIPT = "export default class Knob extends HTMLElement {}\n";
const NODE_UI_MANIFEST = '{ "contract": "1.1", "controls": [{ "type": "float", "control": "knob", "script": "knob.ts" }] }\n';
const BROKEN_FADER = "export default class Fader extends HTMLElement { level: number = \"loud\"; }\n";

/** The runtime's `list_project_node_ui_elements` answer: night-show's knob and lobby-wall's fader. */
function listingOfNightShowAndLobbyWall(): Buffer {
  return controlOperationResultResponse({
    project_directory: NIGHT_SHOW,
    project: NIGHT_SHOW_MODULE.project,
    project_name: "night-show",
    elements: [
      { module: NIGHT_SHOW_MODULE, script_path: "node_ui/knob.ts", element: { kind: "control", pin_type: "float", control: "knob" } },
      { module: LOBBY_WALL_MODULE, script_path: "imports/lobby-wall/node_ui/fader.ts", element: { kind: "control", pin_type: "float", control: "fader" } },
    ],
    manifests: [],
    unreadable_manifests: [],
  });
}

/** The runtime's answers to the gate blocking lobby-wall's node UI folder on a type error in its fader. */
function answersOfLobbyWallsFolderFailingTheGate(): Buffer[] {
  return [
    controlOperationResultResponse({ files: [{ path: "imports/lobby-wall/node_ui/fader.ts", byte_len: BROKEN_FADER.length }] }),
    fileReadAnswer("imports/lobby-wall/node_ui/fader.ts", BROKEN_FADER),
    controlOperationResultResponse({
      verdict: "failed",
      checks: [{ check: "extension_types", state: "failed", checked_with: [] }],
      findings: [{ check: "extension_types", finding_code: "TS2322", severity: "error", words: "Type 'string' is not assignable to type 'number'.", path: "node_ui/fader.ts", line: 1, column: 50 }],
      files_checked: [],
    }),
  ];
}

/** The node UI elements of night-show listed over a fake local API answering `scriptedAnswers`, with the folders the listing kept as served. */
async function nodeUiElementsListedOver(scriptedAnswers: readonly Buffer[]) {
  const server = await FakeLocalApiServer.answering(scriptedAnswers);
  cleanUps.push(() => server.close());
  const listedToTheWindows = new ProjectViewsListedToTheWindows();
  const elements = await Effect.runPromise(
    projectNodeUiElementsOfTheOpenProject(NIGHT_SHOW).pipe(
      Effect.provide(
        Layer.mergeAll(
          runtimeControlLayer(server.localApiSocketPath, 2_000),
          Layer.succeed(ProjectViewsListed, {
            passedExtensionFolder: (openProjectFolder, folderVersion, folder) => listedToTheWindows.passedExtensionFolder(openProjectFolder, folderVersion, folder),
            startAListing: Effect.sync(() => listedToTheWindows.startAListing()),
            rememberTheListing: (openProjectFolder, listed, listingStarted, passedFolders) => Effect.sync(() => listedToTheWindows.rememberTheListing(openProjectFolder, listed, listingStarted, passedFolders)),
            extensionFolderChecks: { kitFolderOfThisCheckout: null, checksKept: new ExtensionFolderChecksKept() },
          }),
        ),
      ),
    ),
  );
  return { elements, listedToTheWindows };
}

test("a project's control whose folder passes the check is listed served at its folder's version, and one whose folder fails is listed blocked with the runtime's finding", async () => {
  const { elements, listedToTheWindows } = await nodeUiElementsListedOver([
    listingOfNightShowAndLobbyWall(),
    ...answersOfAFolderPassingTheGate("node_ui", { "knob.ts": KNOB_SCRIPT, "tatolab_node_ui.json": NODE_UI_MANIFEST }),
    ...answersOfLobbyWallsFolderFailingTheGate(),
  ]);
  const nodeUiVersion = folderVersionOf(
    new Map([
      ["node_ui/knob.ts", Buffer.from(KNOB_SCRIPT)],
      ["node_ui/tatolab_node_ui.json", Buffer.from(NODE_UI_MANIFEST)],
    ]),
  );

  expect(elements).toEqual([
    {
      module: "night-show",
      brought_by: "project",
      script: "knob.ts",
      folder_version: nodeUiVersion,
      registration: { kind: "control", type: "float", control: "knob" },
      script_serving: { kind: "served", script_url: `${projectViewFolderUrl(NIGHT_SHOW, nodeUiVersion, "node_ui")}knob.ts` },
    },
    {
      module: "lobby-wall",
      brought_by: "project",
      script: "fader.ts",
      folder_version: "",
      registration: { kind: "control", type: "float", control: "fader" },
      script_serving: {
        kind: "blocked",
        findings: [
          "This module's node UI code did not pass the runtime's check, so the Studio does not load it.",
          "imports/lobby-wall/node_ui/fader.ts:1:50: error: Type 'string' is not assignable to type 'number'. (TS2322)",
        ],
      },
    },
  ]);
  expect(listedToTheWindows.passedExtensionFolder(NIGHT_SHOW, nodeUiVersion, "node_ui")?.files.get("node_ui/knob.ts")).toEqual(Buffer.from(KNOB_SCRIPT));
  expect(listedToTheWindows.passedExtensionFolder(NIGHT_SHOW, nodeUiVersion, "imports/lobby-wall/node_ui")).toBeNull();
});

test("a runtime that does not list the project's elements leaves only the Studio's own", async () => {
  const { elements } = await nodeUiElementsListedOver([]);

  expect(elements).toEqual([]);
});
