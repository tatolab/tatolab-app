import { afterEach, expect, test } from "vitest";
import { controlOperationFailedResponse, controlOperationResponseOfTheRecordedToolResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, controlOperationResponseOfTheResultText, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./runtime_operations_test_support.js";
import { deleteAsset, deleteProject, describeStreamAction, duplicateProject, importAsset, importProject, relocateAsset, renameProject, setNodeTypeGroup, setProjectCover, setProjectDescription, summarizeTheProject } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

test("renaming_a_project_calls_rename_project_with_its_folder_and_name_and_reads_its_settings_after_and_a_blank_name_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-rename-project-answer-for-night-show-renamed-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-rename-project-refusal-for-a-name-that-shows-nothing.json")),
  ]);

  expect(answerOf(await server.run(renameProject("/tmp/tatolab-proof-projects/night-show", "Night Show")))).toEqual({ name: "Night Show", description: null, cover: null });
  expect(failureOf(await server.run(renameProject("/tmp/tatolab-proof-projects/night-show", "   ")))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "rename_project failed: a project's name cannot be blank",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["rename_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", name: "Night Show" }],
    ["rename_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", name: "   " }],
  ]);
});

test("duplicating_a_project_calls_duplicate_project_into_a_new_folder_and_reads_the_duplicate_and_a_folder_already_there_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-duplicate-project-answer-for-night-show-into-night-show-copy.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-duplicate-project-refusal-for-a-folder-already-there.json")),
  ]);
  const into = "/tmp/tatolab-proof-projects/night-show copy";

  expect(answerOf(await server.run(duplicateProject("/tmp/tatolab-proof-projects/night-show", into)))).toEqual({
    folder: into,
    project: "03784927-d486-46f1-a0d8-a1768485f601",
    name: "Night Show copy",
  });
  expect(failureOf(await server.run(duplicateProject("/tmp/tatolab-proof-projects/night-show", into))).words).toBe(
    "duplicate_project failed: /tmp/tatolab-proof-projects/night-show copy already exists, so the project was not duplicated into it",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["duplicate_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", into }],
    ["duplicate_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", into }],
  ]);
});

test("importing_a_project_zip_calls_import_project_with_the_zip_and_a_new_folder_and_reads_the_project_made_and_a_zip_holding_none_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-project-answer-for-night-show-zip-into-imported-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-project-refusal-for-a-zip-holding-no-project.json")),
  ]);

  expect(answerOf(await server.run(importProject("/tmp/tatolab-proof-projects/night-show.zip", "/tmp/tatolab-proof-projects/imported-show")))).toEqual({
    folder: "/tmp/tatolab-proof-projects/imported-show",
    project: "cba1d286-8a36-4113-bf10-8630cf9a52b2",
    name: "Night Show",
  });
  expect(failureOf(await server.run(importProject("/tmp/tatolab-proof-projects/notes.zip", "/tmp/tatolab-proof-projects/imported-notes"))).words).toBe(
    "import_project failed: /tmp/tatolab-proof-projects/notes.zip holds no project to import: it has no `tatolab-project.json` at its root",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["import_project", { source: "/tmp/tatolab-proof-projects/night-show.zip", project_directory: "/tmp/tatolab-proof-projects/imported-show" }],
    ["import_project", { source: "/tmp/tatolab-proof-projects/notes.zip", project_directory: "/tmp/tatolab-proof-projects/imported-notes" }],
  ]);
});

test("deleting_a_project_queues_delete_project_answering_its_action_which_is_followed_to_done_and_a_folder_holding_no_project_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-project-answer-queueing-the-deletion-of-night-show-copy.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-deletion-of-night-show-copy-done.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-project-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(answerOf(await server.run(deleteProject("/tmp/tatolab-proof-projects/night-show copy")))).toBe("Rumdndppudfu1hageszz80pom-2");
  expect(answerOf(await server.run(describeStreamAction("Rumdndppudfu1hageszz80pom-2")))).toMatchObject({
    kind: "described",
    description: { action: "Rumdndppudfu1hageszz80pom-2", kind: "delete", state: "done", streams: [], failed_because: null },
  });
  expect(failureOf(await server.run(deleteProject("/tmp/tatolab-proof-projects/nothing-here"))).words).toBe(
    "Resource not found: /tmp/tatolab-proof-projects/nothing-here holds no project: it has no tatolab-project.json, so there is none to delete",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["delete_project", { project_directory: "/tmp/tatolab-proof-projects/night-show copy" }],
    ["describe_stream_action", { action: "Rumdndppudfu1hageszz80pom-2" }],
    ["delete_project", { project_directory: "/tmp/tatolab-proof-projects/nothing-here" }],
  ]);
});

test("summarizing_a_project_reads_its_name_description_and_last_edit_from_list_assets_and_a_project_never_described_has_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-described-and-edited.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-copy-with-no-description-or-cover.json")),
  ]);

  expect(answerOf(await server.run(summarizeTheProject("/tmp/tatolab-proof-projects/night-show")))).toMatchObject({
    name: "Night Show",
    description: "Projection for the night market: a test pattern into a brightness meter.",
    last_edited_at_wall_clock_ms: 1_794_335_926_000,
  });
  expect(answerOf(await server.run(summarizeTheProject("/tmp/tatolab-proof-projects/night-show copy")))).toMatchObject({
    name: "Night Show copy",
    description: null,
    last_edited_at_wall_clock_ms: 1_794_335_872_000,
  });
});

test("a_project_covered_by_a_media_asset_is_summarized_with_that_assets_path_and_one_with_no_cover_has_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-covered-by-cover-art.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-copy-with-no-description-or-cover.json")),
  ]);

  expect(answerOf(await server.run(summarizeTheProject("/tmp/tatolab-proof-projects/night-show")))).toMatchObject({ name: "Night Market", cover_path: "media/cover-art.png" });
  expect(answerOf(await server.run(summarizeTheProject("/tmp/tatolab-proof-projects/night-show copy")))).toMatchObject({ cover_path: null });
});

test("describing_a_project_calls_set_project_description_and_reads_its_settings_after_and_a_folder_holding_no_project_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-description-answer-for-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-description-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(answerOf(await server.run(setProjectDescription("/tmp/tatolab-proof-projects/night-show", "Projection for the night market.")))).toEqual({
    name: "Night Market",
    description: "Projection for the night market.",
    cover: "7593be3b-210b-4656-ab21-2213bfa307b5",
  });
  expect(failureOf(await server.run(setProjectDescription("/tmp/tatolab-proof-projects/nothing-here", null)))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "set_project_description failed: /tmp/tatolab-proof-projects/nothing-here holds no project: it has no tatolab-project.json",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["set_project_description", { project_directory: "/tmp/tatolab-proof-projects/night-show", description: "Projection for the night market." }],
    ["set_project_description", { project_directory: "/tmp/tatolab-proof-projects/nothing-here", description: null }],
  ]);
});

test("an_asset_the_person_imports_naming_no_path_lands_in_its_kinds_folder_numbered_past_a_name_taken_recorded_under_them_and_answered_by_its_uuid_and_path", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-answer-for-poster-png-numbered-poster-3-in-media-imported-by-a-person.json")),
  ]);
  const tidePool = "/tmp/tatolab-proof-projects/tide-pool";

  expect(answerOf(await server.run(importAsset(tidePool, "/tmp/poster.png", null, { kind: "person", name: "sam" })))).toEqual({
    asset: "d18ac59c-d741-45fc-8d21-d3febd0d14a0",
    path: "media/poster-3.png",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([["import_asset", { project_directory: tidePool, source: "/tmp/poster.png", author: { kind: "person", name: "sam" } }]]);
});

test("covering_a_project_imports_the_image_with_import_asset_then_names_it_with_set_project_cover_and_each_refusal_is_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-answer-for-cover-art-png-into-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-refusal-for-a-path-night-show-already-holds.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-cover-answer-for-night-show-covered-by-cover-art.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-cover-refusal-for-an-asset-night-show-does-not-hold.json")),
  ]);
  const nightShow = "/tmp/tatolab-proof-projects/night-show";

  expect(answerOf(await server.run(importAsset(nightShow, "/tmp/cover-art.png", "media/cover-art.png", null)))).toEqual({ asset: "7593be3b-210b-4656-ab21-2213bfa307b5", path: "media/cover-art.png" });
  expect(failureOf(await server.run(importAsset(nightShow, "/tmp/cover-art.png", "media/cover-art.png", null))).words).toBe(
    "import_asset failed: `media/cover-art.png` is already the path of the asset 7593be3b-210b-4656-ab21-2213bfa307b5",
  );
  expect(answerOf(await server.run(setProjectCover(nightShow, "7593be3b-210b-4656-ab21-2213bfa307b5")))).toMatchObject({ cover: "7593be3b-210b-4656-ab21-2213bfa307b5" });
  expect(failureOf(await server.run(setProjectCover(nightShow, "00000000-0000-4000-8000-000000000000"))).words).toBe(
    "set_project_cover failed: the project holds no asset 00000000-0000-4000-8000-000000000000",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["import_asset", { project_directory: nightShow, source: "/tmp/cover-art.png", asset_path: "media/cover-art.png" }],
    ["import_asset", { project_directory: nightShow, source: "/tmp/cover-art.png", asset_path: "media/cover-art.png" }],
    ["set_project_cover", { project_directory: nightShow, cover: "7593be3b-210b-4656-ab21-2213bfa307b5" }],
    ["set_project_cover", { project_directory: nightShow, cover: "00000000-0000-4000-8000-000000000000" }],
  ]);
});

test("an_asset_the_person_renames_or_moves_keeps_its_uuid_at_its_new_path_recorded_under_them_and_a_path_another_asset_takes_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-answer-for-poster-png-renamed-to-harbour-poster-png-by-a-person.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-answer-for-harbour-poster-png-moved-into-media-posters.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-refusal-for-a-path-another-asset-of-harbour-lights-takes.json")),
  ]);
  const harbourLights = "/tmp/tatolab-proof-projects/harbour-lights";
  const poster = "7fc01c14-399c-4749-a45b-2c99a77ce0a6";
  const sam = { kind: "person", name: "sam" } as const;

  expect(answerOf(await server.run(relocateAsset(harbourLights, poster, "media/harbour-poster.png", sam)))).toEqual({ asset: poster, path: "media/harbour-poster.png" });
  expect(answerOf(await server.run(relocateAsset(harbourLights, poster, "media/posters/harbour-poster.png", sam)))).toEqual({ asset: poster, path: "media/posters/harbour-poster.png" });
  expect(failureOf(await server.run(relocateAsset(harbourLights, poster, "media/opening.png", sam)))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "relocate_asset failed: `media/opening.png` is already the path of the asset 4ce7c229-734b-4210-9bb5-e321bf4183de",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["relocate_asset", { project_directory: harbourLights, asset: poster, to_path: "media/harbour-poster.png", author: sam }],
    ["relocate_asset", { project_directory: harbourLights, asset: poster, to_path: "media/posters/harbour-poster.png", author: sam }],
    ["relocate_asset", { project_directory: harbourLights, asset: poster, to_path: "media/opening.png", author: sam }],
  ]);
});

test("an_asset_the_person_deletes_is_answered_as_it_was_recorded_under_them_and_one_the_project_does_not_hold_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-asset-answer-for-opening-png-deleted-by-a-person.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-asset-refusal-for-an-asset-harbour-lights-does-not-hold.json")),
  ]);
  const harbourLights = "/tmp/tatolab-proof-projects/harbour-lights";
  const sam = { kind: "person", name: "sam" } as const;

  expect(answerOf(await server.run(deleteAsset(harbourLights, "4ce7c229-734b-4210-9bb5-e321bf4183de", sam)))).toEqual({ asset: "4ce7c229-734b-4210-9bb5-e321bf4183de", path: "media/opening.png" });
  expect(failureOf(await server.run(deleteAsset(harbourLights, "00000000-0000-4000-8000-000000000000", sam)))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "delete_asset failed: the project holds no asset 00000000-0000-4000-8000-000000000000",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["delete_asset", { project_directory: harbourLights, asset: "4ce7c229-734b-4210-9bb5-e321bf4183de", author: sam }],
    ["delete_asset", { project_directory: harbourLights, asset: "00000000-0000-4000-8000-000000000000", author: sam }],
  ]);
});

test("a_node_type_the_person_moves_into_a_group_or_puts_back_is_filed_by_the_project_recorded_under_them_and_a_group_with_a_blank_name_is_refused_in_the_runtimes_words", async () => {
  const harbourLights = "/tmp/tatolab-proof-projects/harbour-lights";
  const filedAnswer = (group: string | null) =>
    controlOperationResponseOfTheResultText(
      JSON.stringify({ project: harbourLights, node_type: "nodes.mix:Mixer", group, transaction: "0b9e4f61-3c2a-4d7e-9a51-6f0c2b8d1e73", commit: "5d2f0e1c9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d" }),
    );
  const blankName = "set_node_type_group failed: \"Show//Levels\" cannot file `nodes.mix:Mixer`: a group is one or more names split by `/`, none of them blank, as `Effects/Stylize`";
  const server = await fakeLocalApiServerAnswering([filedAnswer("Show/Levels"), filedAnswer(null), controlOperationFailedResponse(blankName)]);
  const sam = { kind: "person", name: "sam" } as const;

  answerOf(await server.run(setNodeTypeGroup(harbourLights, "nodes.mix:Mixer", "Show/Levels", sam)));
  answerOf(await server.run(setNodeTypeGroup(harbourLights, "nodes.mix:Mixer", null, sam)));
  expect(failureOf(await server.run(setNodeTypeGroup(harbourLights, "nodes.mix:Mixer", "Show//Levels", sam)))).toMatchObject({ _tag: "RuntimeRefused", words: blankName });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["set_node_type_group", { project_directory: harbourLights, node_type: "nodes.mix:Mixer", group: "Show/Levels", author: sam }],
    ["set_node_type_group", { project_directory: harbourLights, node_type: "nodes.mix:Mixer", group: null, author: sam }],
    ["set_node_type_group", { project_directory: harbourLights, node_type: "nodes.mix:Mixer", group: "Show//Levels", author: sam }],
  ]);
});
