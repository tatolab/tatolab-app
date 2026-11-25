import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import { FakeLocalApiServer, controlOperationResponseOfTheRecordedToolResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUps, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, controlOperationResponseOfTheResultText, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./runtime_operations_test_support.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { describeNodeTypes, listNodeTypes, listProjectAssets, nameTheProject, readAssetPreview } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

const EVERY_PIN_KIND = "/home/user/streamlib/examples/every-pin-kind";

const RECORDED_HARBOUR_LIGHTS = "/tmp/claude-0/live/home/Tato Studio/Harbour Lights";

const RECORDED_HARBOUR_DUSK_PNG = "38ab4435-5f49-4cd1-b60e-f03acf54db34";

const RECORDED_QUAY_WALK_MP4 = "23199eb3-ea3c-4d31-8f0f-2bf9395590d2";

test("listing_node_types_calls_list_node_types_with_the_project_folder_and_passes_each_source_on_as_the_contract_types_it", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-node-types-result-of-every-pin-kind.json"))]);

  const listing = answerOf(await server.run(listNodeTypes(EVERY_PIN_KIND)));

  expect(controlOperationCallsReceivedBy(server)).toEqual([["list_node_types", { project_directory: EVERY_PIN_KIND }]]);
  expect(listing.project_name).toBe("Every pin kind");
  expect(listing.sources.map((source) => source.source)).toEqual(["project", "installed_distribution", "installed_distribution", "installed_distribution", "built_in"]);
  expect(listing.sources[0]?.node_types.map((nodeType) => nodeType.node_type)).toEqual(["nodes.beat:Beat", "nodes.beat:Warmth", "nodes.frame_tally:FrameTally", "nodes.glow:Glow", "nodes.spotlight:Spotlight"]);
});

test("listing_the_node_types_of_a_folder_holding_no_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-node-types-refusal-for-a-folder-that-is-not-a-project.json"))]);

  expect(failureOf(await server.run(listNodeTypes("/etc"))).words).toBe("list_node_types failed: /etc holds no project: it has no tatolab-project.json");
});

test("describing_node_types_calls_describe_node_types_with_each_type_and_passes_a_typed_port_and_an_untyped_port_on_as_the_runtime_describes_them", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-node-types-result-of-every-pin-kind-describing-glow-and-channels-to-records.json")),
  ]);

  const { node_types: described } = answerOf(await server.run(describeNodeTypes(EVERY_PIN_KIND, ["nodes.glow:Glow", "tatolab.stream:ChannelsToRecords"])));

  expect(controlOperationCallsReceivedBy(server)).toEqual([["describe_node_types", { project_directory: EVERY_PIN_KIND, node_types: ["nodes.glow:Glow", "tatolab.stream:ChannelsToRecords"] }]]);
  const [glow, channelsToRecords] = described;
  if (glow === undefined || "not_described_because" in glow || channelsToRecords === undefined || "not_described_because" in channelsToRecords) throw new Error("both node types are described");
  expect(glow.inputs.map(({ name, mode, pin_type }) => ({ name, mode, pin_type }))).toEqual([
    { name: "image", mode: "wire_only", pin_type: { kind: "is", pin_type: { type: "texture" } } },
    { name: "glow", mode: "wire_or_value", pin_type: { kind: "is", pin_type: { type: "float", exact_size: "float32" } } },
    { name: "warmth", mode: "wire_or_value", pin_type: { kind: "is", pin_type: { type: "float", exact_size: "float32" } } },
  ]);
  expect(channelsToRecords.inputs.map(({ name, mode, pin_type }) => ({ name, mode, pin_type }))).toEqual([
    { name: "channels", mode: "wire_or_value", pin_type: undefined },
    { name: "channel_names", mode: "setting_only", pin_type: undefined },
  ]);
});

test("describing_a_node_type_the_project_does_not_offer_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-node-types-refusal-for-a-node-type-every-pin-kind-does-not-offer.json")),
  ]);

  expect(failureOf(await server.run(describeNodeTypes(EVERY_PIN_KIND, ["nodes.glow:Glow", "nodes.glow:NoSuchNode"]))).words).toContain("offers a node type `nodes.glow:NoSuchNode`");
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
  const listing = await Effect.runPromise(listNodeTypes("/w/pattern").pipe(Effect.provide(runtimeControlLayer(server.localApiSocketPath, 100))));

  expect(listing.project_name).toBe("pattern");
});
