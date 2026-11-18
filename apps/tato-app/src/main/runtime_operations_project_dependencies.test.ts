import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./local_api_client_test_support.js";
import { addDependency, listDependencies, removeDependency, updateDependency } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

test("a_dependency_added_from_a_folder_or_a_zip_answers_the_import_the_runtime_copied", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-tool-result-of-night-show-importing-the-folder-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-tool-result-of-night-show-importing-the-zip-doorways.json")),
  ]);

  expect(answerOf(await server.run(addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall")))).toEqual({
    project: "dde5a62f-b0a8-45d2-a741-79140871f978",
    folder: "lobby-wall",
    source: "/tmp/tatolab-proof-projects/lobby-wall",
    version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82",
  });
  expect(answerOf(await server.run(addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/doorways.zip")))).toMatchObject({ folder: "doorways", source: "/tmp/tatolab-proof-projects/doorways.zip" });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["add_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", source: "/tmp/tatolab-proof-projects/lobby-wall" }],
    ["add_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", source: "/tmp/tatolab-proof-projects/doorways.zip" }],
  ]);
});

test("a_dependency_removed_answers_the_import_the_runtime_took_out_and_a_refused_removal_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-dependency-tool-result-of-night-show-removing-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-dependency-refusal-for-a-project-not-imported.json")),
  ]);

  expect(answerOf(await server.run(removeDependency("/tmp/tatolab-proof-projects/night-show", "92c01338-ae3e-400f-aef1-4e791b0150b8")))).toEqual({
    project: "92c01338-ae3e-400f-aef1-4e791b0150b8",
    folder: "lobby-wall",
    source: "/tmp/tatolab-proof-projects/lobby-wall",
    version: "a33a4a3c5ebb6cbc2d878536e95327f8135ab0a1938f096bcac4c0c30c9b70ad",
  });
  expect(failureOf(await server.run(removeDependency("/tmp/tatolab-proof-projects/night-show", "00000000-0000-4000-8000-000000000000")))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "remove_dependency failed: the project imports no project 00000000-0000-4000-8000-000000000000",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["remove_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "92c01338-ae3e-400f-aef1-4e791b0150b8" }],
    ["remove_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "00000000-0000-4000-8000-000000000000" }],
  ]);
});

test("a_dependency_the_runtime_refuses_to_add_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-refusal-for-a-folder-that-is-not-a-project.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-refusal-for-lobby-wall-imported-already.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-refusal-for-requirements-uv-could-not-resolve-offline.json")),
  ]);

  expect(failureOf(await server.run(addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/not-a-project")))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "add_dependency failed: /tmp/tatolab-proof-projects/not-a-project holds no project to import: it has no `tatolab-project.json` at its root",
  });
  expect(failureOf(await server.run(addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall"))).words).toBe(
    "add_dependency failed: the project already imports dde5a62f-b0a8-45d2-a741-79140871f978; copy it again with update_dependency",
  );
  expect(failureOf(await server.run(addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall"))).words).toContain(
    "the project's Python requirements, with this import change, cannot be resolved, so nothing changed",
  );
});

test("an_update_of_a_dependency_edited_since_its_copy_waits_on_the_overwrite_and_then_commits_it", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-update-dependency-tool-result-of-lobby-wall-edited-since-its-copy.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-update-dependency-tool-result-of-lobby-wall-overwriting-its-edits.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-update-dependency-refusal-for-a-project-not-imported.json")),
  ]);
  const lobbyWall = "dde5a62f-b0a8-45d2-a741-79140871f978";

  expect(answerOf(await server.run(updateDependency("/tmp/tatolab-proof-projects/night-show", lobbyWall, false)))).toEqual({ kind: "edited_since_its_copy", edited_files: ["nodes/brightness_meter.py"] });
  expect(answerOf(await server.run(updateDependency("/tmp/tatolab-proof-projects/night-show", lobbyWall, true)))).toEqual({
    kind: "updated",
    dependency: { project: lobbyWall, folder: "lobby-wall", source: "/tmp/tatolab-proof-projects/lobby-wall", version: "27ac758d40fe967b15e1f8c9722755d82d4e093ed69e4617e22c674fbb66dfff" },
  });
  expect(failureOf(await server.run(updateDependency("/tmp/tatolab-proof-projects/night-show", "00000000-0000-4000-8000-000000000000", false))).words).toBe(
    "update_dependency failed: the project imports no project 00000000-0000-4000-8000-000000000000",
  );
  expect(controlOperationCallsReceivedBy(server).map(([, toolArguments]) => toolArguments)).toEqual([
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: lobbyWall, overwrite_edited_files: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: lobbyWall, overwrite_edited_files: true },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "00000000-0000-4000-8000-000000000000", overwrite_edited_files: false },
  ]);
});

test("the_dependencies_listed_carry_their_edited_files_and_with_a_check_whether_their_source_holds_a_newer_version", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-dependencies-tool-result-of-the-project-night-show-importing-nothing.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-dependencies-tool-result-of-night-show-importing-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-dependencies-tool-result-of-night-show-with-lobby-wall-edited-and-newer-on-its-source.json")),
  ]);
  const lobbyWall = { project: "dde5a62f-b0a8-45d2-a741-79140871f978", folder: "lobby-wall", source: "/tmp/tatolab-proof-projects/lobby-wall", version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82" };

  expect(answerOf(await server.run(listDependencies("/tmp/tatolab-proof-projects/night-show", false)))).toEqual([]);
  expect(answerOf(await server.run(listDependencies("/tmp/tatolab-proof-projects/night-show", false)))).toEqual([
    { dependency: lobbyWall, edited_files: [], newer_version_exists: null, check_refused_because: null },
  ]);
  expect(answerOf(await server.run(listDependencies("/tmp/tatolab-proof-projects/night-show", true)))).toEqual([
    { dependency: lobbyWall, edited_files: ["nodes/brightness_meter.py"], newer_version_exists: true, check_refused_because: null },
  ]);
  expect(controlOperationCallsReceivedBy(server).map(([, toolArguments]) => toolArguments)).toEqual([
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: true },
  ]);
});
