import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./local_api_client_test_support.js";
import { listProjectViews, undoOrRedo } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

const RECORDED_NIGHT_SHOW = "/tmp/tl-rec/projects/night-show";

const RECORDED_S07_CODE = "/tmp/tatolab-proof-projects/s07-code";

test("project files are listed, read whole as bytes, and written as one transaction by the author under a key, each through the runtime's file tools, a refusal in its own words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-files-tool-result-of-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-files-tool-result-of-night-show-under-nodes.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-nodes-camera-py.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-views-deck-icon-png.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-imports-lobby-wall-views-meter-manifest.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-refusal-for-a-path-outside-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-project-file-tool-result-of-sam-saving-night-show-nodes-camera-py.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-project-file-refusal-for-a-file-under-imports-of-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-project-file-refusal-for-content-night-show-already-holds.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;

  const wholeProject = answerOf(await server.client().listProjectFiles(RECORDED_NIGHT_SHOW, null));
  expect(wholeProject.map((listedFile) => listedFile.path)).toContain("views/deck/icon.png");
  expect(wholeProject.find((listedFile) => listedFile.path === "nodes/camera.py")).toEqual({ path: "nodes/camera.py", byte_len: 43 });
  expect(answerOf(await server.client().listProjectFiles(RECORDED_NIGHT_SHOW, "nodes"))).toEqual([{ path: "nodes/camera.py", byte_len: 43 }]);
  expect(answerOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py")).toString("utf8")).toBe("import streamlib\n\n\nCAMERA_DEVICE_INDEX = 0\n");
  const iconBytes = answerOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "views/deck/icon.png"));
  expect([iconBytes.length, [...iconBytes.subarray(0, 8)]]).toEqual([75, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]);
  expect(JSON.parse(answerOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "imports/lobby-wall/views/meter/tatolab_view.json")).toString("utf8"))).toMatchObject({ title: "Meter" });
  expect(failureOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "../elsewhere.txt"))).toMatchObject({
    isTheRuntimesRefusal: true,
    failureDescription: "read_project_file failed: the file path `../elsewhere.txt` is refused: it holds `.`, `..` or a root, which could lead outside the project",
  });
  expect(answerOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py", "import streamlib\n", sam, "save-1"))).toEqual({
    path: "nodes/camera.py",
    transaction: "841dea3f-0f85-44f6-a3bf-7ab09d1fa179",
    commit: "bbd985b362ad3ff5e7154324bcd13d19022e9ff2",
  });
  expect(failureOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "imports/lobby-wall/views/meter/index.html", "<p></p>\n", sam, "save-2")).failureDescription).toBe(
    "write_project_file failed: the file `imports/lobby-wall/views/meter/index.html` is not written with write_project_file: an import's files are edited by opening `imports/<folder>/` as a project of its own",
  );
  expect(failureOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py", "import streamlib\n", sam, "save-3")).failureDescription).toBe(
    "write_project_file failed: `nodes/camera.py` already holds this content, so the write has nothing to change",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["list_project_files", { project_directory: RECORDED_NIGHT_SHOW }],
    ["list_project_files", { project_directory: RECORDED_NIGHT_SHOW, under: "nodes" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "nodes/camera.py" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "views/deck/icon.png" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "imports/lobby-wall/views/meter/tatolab_view.json" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "../elsewhere.txt" }],
    ["write_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "nodes/camera.py", content: "import streamlib\n", author: sam, idempotency_key: "save-1" }],
    ["write_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "imports/lobby-wall/views/meter/index.html", content: "<p></p>\n", author: sam, idempotency_key: "save-2" }],
    ["write_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "nodes/camera.py", content: "import streamlib\n", author: sam, idempotency_key: "save-3" }],
  ]);
});

test("a new node file is created from the runtime's node template as one transaction by the author under a key, answering the node type it declares, a refusal in the runtime's own words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-node-file-tool-result-of-sam-creating-s07-code-nodes-invert-py.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-node-file-refusal-for-a-file-s07-code-already-holds.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-node-file-refusal-for-a-path-not-importable-as-a-python-module.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;

  expect(answerOf(await server.client().createNodeFile(RECORDED_S07_CODE, "nodes/invert.py", sam, "create-1"))).toEqual({
    path: "nodes/invert.py",
    node_type: "nodes.invert:Invert",
    transaction: "9c38b2ef-7d8b-4d89-b6fd-c226ca507521",
    commit: "665925378946a3db63451a5eff799202db9bc04b",
  });
  expect(failureOf(await server.client().createNodeFile(RECORDED_S07_CODE, "nodes/invert.py", sam, "create-2"))).toMatchObject({
    isTheRuntimesRefusal: true,
    failureDescription: "create_node_file failed: the project already holds `nodes/invert.py`, and a new file is never written over it",
  });
  expect(failureOf(await server.client().createNodeFile(RECORDED_S07_CODE, "nodes/my-effect.py", sam, "create-3")).failureDescription).toBe(
    "create_node_file failed: `nodes/my-effect.py` is not importable as a Python module: `my-effect` is not a Python identifier; use letters, digits and `_`, not starting with a digit",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["create_node_file", { project_directory: RECORDED_S07_CODE, path: "nodes/invert.py", author: sam, idempotency_key: "create-1" }],
    ["create_node_file", { project_directory: RECORDED_S07_CODE, path: "nodes/invert.py", author: sam, idempotency_key: "create-2" }],
    ["create_node_file", { project_directory: RECORDED_S07_CODE, path: "nodes/my-effect.py", author: sam, idempotency_key: "create-3" }],
  ]);
});

test("undoing a save is the runtime's undo of the write_project_file transaction that recorded it", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-save-of-night-show-nodes-camera-py.json")),
  ]);

  const undone = answerOf(await server.run(undoOrRedo("undo", RECORDED_NIGHT_SHOW, { kind: "person", name: "Sam" })));

  expect(undone.undoes).toBe("c394e90f-a850-4603-81c3-8d25ba25ea76");
});

test("a project's views are listed from its views/ folders and its imports', each that does not open with the runtime's reason, and a folder that is not a project refused in its words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-views-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  const listed = answerOf(await server.run(listProjectViews(RECORDED_NIGHT_SHOW)));
  const refusal = failureOf(await server.run(listProjectViews("/private/tmp/tl-rec053/not-a-project")));

  expect(listed.map(({ view_type, project_name, import_folder, view_folder_in_the_project, opens, not_opened_because }) => ({ view_type, project_name, import_folder, view_folder_in_the_project, opens, not_opened_because }))).toEqual([
    { view_type: "night-show:broken", project_name: "night-show", import_folder: null, view_folder_in_the_project: "views/broken", opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0." },
    { view_type: "night-show:deck", project_name: "night-show", import_folder: null, view_folder_in_the_project: "views/deck", opens: true, not_opened_because: null },
    { view_type: "lobby-wall:meter", project_name: "lobby-wall", import_folder: "lobby-wall", view_folder_in_the_project: "imports/lobby-wall/views/meter", opens: true, not_opened_because: null },
  ]);
  expect(listed[1]?.manifest).toMatchObject({ title: "DJ Deck", placement: "node", entry: "index.html" });
  expect(refusal).toMatchObject({ _tag: "RuntimeRefused", words: "list_project_views failed: /private/tmp/tl-rec053/not-a-project holds no project: it has no tatolab-project.json" });
});
