import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import { FakeLocalApiServer, controlOperationResponseOfTheRecordedToolResponse, httpResponse, controlOperationFailedResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUps, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, controlOperationResponseOfTheResultText, failureOf, fakeLocalApiServerAnswering, headAndBodyOf, recordedResponseBody } from "./runtime_operations_test_support.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { describeNodeCatalog, listProjectAssets, listProjectNodeTypes, nameTheProject, readAssetPreview } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

const RECORDED_HARBOUR_LIGHTS = "/tmp/claude-0/live/home/Tato Studio/Harbour Lights";

const RECORDED_HARBOUR_DUSK_PNG = "38ab4435-5f49-4cd1-b60e-f03acf54db34";

const RECORDED_QUAY_WALK_MP4 = "23199eb3-ea3c-4d31-8f0f-2bf9395590d2";

test("the_node_catalog_is_read_from_the_registry_of_the_stream_asked_for", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-registry-answer-of-a-test-root-runtime-naming-no-stream.json")),
  ]);

  const nodeCatalog = answerOf(await server.run(describeNodeCatalog("pattern-main-3f2a1c")));

  expect(server.receivedRequests()[0]?.startsWith("GET /api/registry?stream=pattern-main-3f2a1c HTTP/1.1\r\n")).toBe(true);
  expect(nodeCatalog.stream).toBe("pattern-main-3f2a1c");
  expect(nodeCatalog.node_types.map((nodeType) => nodeType.type)).toEqual(["tatolab.stream:RelayTrackSource"]);
});

test("a_real_node_catalog_reads_the_pin_type_and_flow_a_typed_port_declares_and_an_untyped_port_by_its_family_alone", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-registry-answer-of-pins-naming-the-texture-ports-of-two-built-ins.json")),
  ]);

  const nodeCatalog = answerOf(await server.run(describeNodeCatalog("pins-main-cbc98f")));

  const portsOf = (type: string) => {
    const nodeType = nodeCatalog.node_types.find((listed) => listed.type === type);
    return [nodeType?.inputs.map(({ name, family, pin }) => ({ name, family, pin })), nodeType?.outputs.map(({ name, family, pin }) => ({ name, family, pin }))];
  };
  const aDeclaredTexture = { pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" };
  expect(portsOf("tatolab.stream:ArrayToImage")).toEqual([[{ name: "array", family: "array", pin: null }], [{ name: "image", family: "image", pin: aDeclaredTexture }]]);
  expect(portsOf("tatolab.stream:ImageToArray")).toEqual([[{ name: "image", family: "image", pin: aDeclaredTexture }], [{ name: "array", family: "array", pin: null }]]);
  expect(portsOf("tatolab.stream:ChannelsToRecords")).toEqual([[{ name: "channels", family: "channels", pin: null }], [{ name: "records", family: "records", pin: null }]]);
});

test("a_node_catalog_of_a_stream_not_loaded_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("404 Not Found", "application/json", await recordedResponseBody("local-api-registry-refusal-for-the-stream-front-door-not-loaded.json")),
  ]);

  expect(failureOf(await server.run(describeNodeCatalog("front-door"))).words).toBe(
    "Resource not found: no stream with the id `front-door` is loaded in this runtime. Loaded: none",
  );
});

test("listing_a_projects_node_types_calls_list_project_node_types_with_its_folder_and_reads_each_source", async () => {
  const listingText = JSON.stringify({
    project_directory: "/w/pattern",
    project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
    project_name: "pattern",
    sources: [{ source: "project", node_types: [], graph_generators: [], unreadable_modules: [] }],
  });
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheResultText(listingText)]);

  const listing = answerOf(await server.run(listProjectNodeTypes("/w/pattern")));

  expect(listing.project_name).toBe("pattern");
  expect(listing.sources.map((source) => source.origin)).toEqual([{ source: "project" }]);
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("list_project_node_types");
  expect(JSON.parse(body).params).toEqual({ project_directory: "/w/pattern" });
});

test("a_node_type_listing_the_runtime_refuses_carries_its_own_words", async () => {
  const refusal = "list_project_node_types failed: the project's interpreter printed no listing";
  const server = await fakeLocalApiServerAnswering([controlOperationFailedResponse(refusal)]);

  expect(failureOf(await server.run(listProjectNodeTypes("/w/pattern"))).words).toBe(refusal);
});

test("a_real_node_type_listing_reads_the_projects_node_types_generator_unreadable_module_and_installed_distribution", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-node-types-tool-result-of-a-project-with-a-module-that-does-not-parse.json")),
  ]);

  const listing = answerOf(await server.run(listProjectNodeTypes("/private/tmp/tatolab-proof-projects/node-type-proof")));

  expect(listing.project_name).toBe("node-type-proof");
  expect(listing.sources.map((source) => source.origin)).toEqual([
    { source: "project" },
    { source: "dependency", project: "ba5fc2b1-df25-4e86-bec3-aba1564d6233", folder: "core-nodes", version: "0.68.82", project_name: "Core Nodes" },
    { source: "installed_distribution", distribution: "tatolab-compositor", distribution_version: "0.68.82" },
    { source: "installed_distribution", distribution: "tatolab-stream", distribution_version: "0.68.82" },
    { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "0.68.82" },
  ]);
  const [projectSource, , , , testPatternSource] = listing.sources;
  expect(projectSource?.node_types.map((nodeType) => [nodeType.type, nodeType.kind, nodeType.category])).toEqual([
    ["nodes.brightness_meter:BrightnessMeter", "process", null],
    ["nodes.edge_mask:EdgeMask", "process", "Masks"],
    ["nodes.gain:scale_by_gain", "function", null],
    ["nodes.halftone_lens_effect:HalftoneLensEffect", "process", null],
  ]);
  expect(projectSource?.node_types[1]?.outputs).toEqual([{ name: "mask_out", family: "image", description: "The edge mask.", annotation: null }]);
  expect(projectSource?.node_types[2]?.inputs?.[1]).toEqual({ name: "gain", family: "channels", description: "", annotation: "float" });
  expect(projectSource?.graph_generators).toEqual([
    { generator: "nodes.masked_rig:masked_rig", description: "Wires `mask_count` edge masks in a row.", promoted_config: [{ name: "mask_count", annotation: "int" }], path: "nodes/masked_rig.py", line: 7 },
  ]);
  expect(projectSource?.unreadable_modules).toEqual([{ module: "nodes.half_written", path: "nodes/half_written.py", line: 4, column: 11, why: "SyntaxError: '(' was never closed" }]);
  expect(testPatternSource?.node_types.map((nodeType) => nodeType.type)).toEqual(["tatolab.testpattern:TestPatternSource"]);
});

test("a_real_node_type_listing_of_a_folder_that_is_not_a_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-node-types-tool-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(failureOf(await server.run(listProjectNodeTypes("/private/tmp/tatolab-proof-185/not-a-project"))).words).toBe(
    "list_project_node_types failed: /private/tmp/tatolab-proof-185/not-a-project holds no project: it has no tatolab-project.json",
  );
});

test("a_real_node_type_listing_of_a_project_with_imports_lists_each_import_by_its_uuid_folder_and_version", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-node-types-tool-result-of-night-show-importing-doorways-and-lobby-wall.json")),
  ]);

  const listing = answerOf(await server.run(listProjectNodeTypes("/tmp/tatolab-proof-projects/night-show")));

  expect(listing.sources.map((source) => [source.origin, source.node_types.length])).toEqual([
    [{ source: "project" }, 2],
    [{ source: "dependency", project: "27f7b9b7-9a4d-463c-9b72-10bbf0c3c3e1", folder: "doorways", version: "4c3ae2870d8408c96345817f9dd86c190d3cc1f0313079d56915d54b59dd5223", project_name: "doorways" }, 2],
    [{ source: "dependency", project: "dde5a62f-b0a8-45d2-a741-79140871f978", folder: "lobby-wall", version: "b542d38ff3bc8901f8495be6d5ca434a24bc93a7174837b5c0e0e22a7c81c9d0", project_name: "lobby-wall" }, 2],
    [{ source: "dependency", project: "ba5fc2b1-df25-4e86-bec3-aba1564d6233", folder: "core-nodes", version: "0.68.82", project_name: "Core Nodes" }, 74],
    [{ source: "installed_distribution", distribution: "tatolab-compositor", distribution_version: "0.68.82" }, 1],
    [{ source: "installed_distribution", distribution: "tatolab-stream", distribution_version: "0.68.82" }, 1],
    [{ source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "0.68.82" }, 1],
  ]);
});

test("a_real_asset_listing_names_the_project_and_a_folder_that_is_not_a_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-the-project-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-the-import-lobby-wall-of-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(answerOf(await server.run(nameTheProject("/tmp/tatolab-proof-projects/night-show")))).toEqual({
    folder: "/tmp/tatolab-proof-projects/night-show",
    project: "cc5046d5-d8b7-4ecf-82e7-3f0e511b2ab0",
    name: "night-show",
  });
  expect(answerOf(await server.run(nameTheProject("/tmp/tatolab-proof-projects/night-show/imports/lobby-wall")))).toEqual({
    folder: "/tmp/tatolab-proof-projects/night-show/imports/lobby-wall",
    project: "dde5a62f-b0a8-45d2-a741-79140871f978",
    name: "lobby-wall",
  });
  expect(failureOf(await server.run(nameTheProject("/tmp/tatolab-proof-projects/not-a-project"))).words).toBe(
    "list_assets failed: /tmp/tatolab-proof-projects/not-a-project holds no project: it has no tatolab-project.json",
  );
  expect(controlOperationCallsReceivedBy(server).map(([toolName]) => toolName)).toEqual(["list_assets", "list_assets", "list_assets"]);
});

test("a_real_asset_listing_sizes_an_images_preview_picture_and_a_video_whose_poster_frame_did_not_decode_has_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-harbour-lights-holding-a-previewed-image-and-a-video-with-no-poster.json")),
  ]);
  const listing = answerOf(await server.run(listProjectAssets(RECORDED_HARBOUR_LIGHTS)));
  expect(listing.assets.map((asset) => [asset.path, asset.preview])).toEqual([
    ["media/harbour-dusk.png", { pixel_width: 512, pixel_height: 320, media_type: "image/png" }],
    ["media/quay-walk.mp4", null],
    ["streams/main.graph.json", null],
  ]);
  expect(listing.assets.map((asset) => [asset.path, asset.media_its_bytes_hold])).toEqual([
    ["media/harbour-dusk.png", ["image"]],
    ["media/quay-walk.mp4", ["video"]],
    ["streams/main.graph.json", null],
  ]);
});

test("a_real_preview_picture_read_answers_the_png_and_a_video_with_no_poster_frame_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-tool-result-of-harbour-dusk-png.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-refusal-for-quay-walk-mp4-with-no-poster-frame.json")),
  ]);
  const picture = answerOf(await server.run(readAssetPreview(RECORDED_HARBOUR_LIGHTS, RECORDED_HARBOUR_DUSK_PNG)));
  expect([picture.pixel_width, picture.pixel_height, picture.media_type, picture.picture_bytes.length]).toEqual([512, 320, "image/png", 36974]);
  expect(picture.picture_bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  expect(failureOf(await server.run(readAssetPreview(RECORDED_HARBOUR_LIGHTS, RECORDED_QUAY_WALK_MP4))).words).toBe(
    "read_asset_preview failed: asset 23199eb3-ea3c-4d31-8f0f-2bf9395590d2 has no preview picture; the runtime makes one for an image",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    [
      "read_asset_preview",
      {
        project_directory: RECORDED_HARBOUR_LIGHTS,
        asset: RECORDED_HARBOUR_DUSK_PNG,
      },
    ],
    [
      "read_asset_preview",
      {
        project_directory: RECORDED_HARBOUR_LIGHTS,
        asset: RECORDED_QUAY_WALK_MP4,
      },
    ],
  ]);
});

test("a_preview_picture_answered_for_another_asset_is_refused", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-tool-result-of-harbour-dusk-png.json"))]);
  expect(failureOf(await server.run(readAssetPreview(RECORDED_HARBOUR_LIGHTS, RECORDED_QUAY_WALK_MP4)))).toMatchObject({
    _tag: "ContractMismatch",
    words: `the runtime's answer to \`read_asset_preview\` is not the contract's \`ReadAssetPreviewToolResult\`: the runtime's read_asset_preview result could not be read: it answers the asset ${RECORDED_HARBOUR_DUSK_PNG}, not ${RECORDED_QUAY_WALK_MP4}`,
  });
});

test("a_real_asset_listing_lists_each_imported_file_and_graph_document_and_a_folder_that_is_not_a_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-lobby-camera-holding-a-video-an-image-and-a-lut.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);
  const lobbyCameraFolder = "/tmp/claude-0/-home-user/4632618e-7712-59e1-9bd8-72d7c92c4d42/scratchpad/live/home/Tato Studio/Lobby Camera";

  const listing = answerOf(await server.run(listProjectAssets(lobbyCameraFolder)));
  expect([listing.project_directory, listing.project, listing.project_name]).toEqual([lobbyCameraFolder, "9ffa289f-60a1-48ed-a867-f19e3726aa96", "Lobby Camera"]);
  expect(listing.assets.map((asset) => [asset.kind, asset.path, asset.content_byte_len])).toEqual([
    ["data", "luts/warm.cube", 75],
    ["media", "media/lobby-intro.mp4", 48493],
    ["media", "media/poster.png", 11194],
    ["stream", "streams/main.graph.json", 336],
  ]);
  expect(listing.assets[1]).toEqual({
    asset: "207ef246-3d00-4167-b394-bb591f7c4b8f",
    kind: "media",
    path: "media/lobby-intro.mp4",
    content_sha256: "16e89515f01295ded2534fd319db70fbd6bce1e95ed619b0127105489cc82700",
    content_byte_len: 48493,
    import_settings: {},
    preview: null,
    media_its_bytes_hold: null,
  });
  expect(failureOf(await server.run(listProjectAssets("/tmp/tatolab-proof-projects/not-a-project"))).words).toBe(
    "list_assets failed: /tmp/tatolab-proof-projects/not-a-project holds no project: it has no tatolab-project.json",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["list_assets", { project_directory: lobbyCameraFolder }],
    ["list_assets", { project_directory: "/tmp/tatolab-proof-projects/not-a-project" }],
  ]);
});

test("a_node_type_listing_waits_past_the_ordinary_request_timeout_for_the_projects_interpreter", async () => {
  const listingText = JSON.stringify({ project_directory: "/w/pattern", project: "p", project_name: "pattern", sources: [] });
  const server = await FakeLocalApiServer.answering([controlOperationResponseOfTheResultText(listingText)], 300);
  cleanUps.push(() => server.close());
  const listing = await Effect.runPromise(listProjectNodeTypes("/w/pattern").pipe(Effect.provide(runtimeControlLayer(server.localApiSocketPath, 100))));

  expect(listing.project_name).toBe("pattern");
});
