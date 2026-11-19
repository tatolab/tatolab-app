import type { ListedNodeUiElement, NodeUiElementsReading } from "@tatolab/tato-app-view-sdk/node_ui_host";
import type { ProjectActionRefusal, StudioViewListed } from "@tatolab/tato-app-view-sdk/studio_readings";
import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk/studio_host";
import {
  connectToTatoAppOverPort,
  type TatoAppViewConnection,
  type TatolabViewManifest,
  type ViewInputEvent,
  type ViewSettings,
} from "@tatolab/tato-app-view-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectAssetPickHeldInTheWindow } from "./project_asset_pick_held_in_the_window";
import { WatchedStudioValue } from "./watched_studio_value";
import type {
  JsonValue,
  PortViewerConnectionEvent,
  PortViewerTarget,
  ProjectFileRead,
  ProjectFileReading,
  ProjectTransaction,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  ProjectAssetsReading,
  StudioViewsReading,
  PythonLanguageServerConnectionEvent,
  StudioSelection,
  StudioViewHostServices,
  StudioViewNodeAddress,
  ViewHeaderRow,
  ViewOpenedOn,
  ViewOpenedOnAsked,
  ViewOpeningTarget,
} from "./studio_view_contract";
import type { StudioViewInputWiring } from "./studio_view_node_wiring";
import { TatolabViewBridge, type TatolabViewAreaServices } from "./tatolab_view_bridge";

function manifestOf(manifestJson: unknown): TatolabViewManifest {
  const reading = readTatolabViewManifest(manifestJson);
  if (reading.kind === "not_read") return expect.unreachable(reading.because);
  return reading.manifest;
}

const STUDIOS_FLOAT_CONTROL_LISTED: ListedNodeUiElement = {
  module: "studio",
  brought_by: "studio",
  script: "float_number.ts",
  folder_version: "0.45.0",
  registration: { kind: "control", type: "float", control: null },
  script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
};

const DJ_DECK_MANIFEST = manifestOf({
  contract: "1.0",
  title: "DJ Deck",
  entry: "index.html",
  placement: "node",
  inputs: [{ name: "deck_a", family: "channels" }],
  outputs: [
    { name: "crossfader", family: "array" },
    { name: "play_a", family: "array" },
    { name: "cover", family: "image" },
  ],
  settings: { type: "object", properties: { show_waveform: { type: "boolean", default: true }, zoom: { type: "number", minimum: 1, default: 1 } } },
});

const STREAM_FILE_READ: ProjectFileRead = { file: "/set/stream.py", project_folder: "/set", text: "print()", version: "v1", is_editable: true };

const UNDO_APPLIED: ProjectTransaction = {
  format_version: 2,
  transaction: "t-undo",
  commit: "c2",
  parent_commit: "c1",
  author_kind: "agent",
  author_name: "claude-code",
  operations: [{ operation: "remove_node" }],
  inverse_operations: [{ operation: "add_node" }],
  undoes: "t-add",
  redoes: null,
  idempotency_key: null,
  undo_state: null,
  applied_at: "2026-11-09T18:42:00Z",
};

const GRAPH_TRANSACTION_APPLIED = {
  mode: "commit" as const,
  transaction: "t-add",
  commit: "c3",
  operations: [{ operation: "add_node" }],
  added_nodes: [{ stream: "set-main-1a2b3c", node: "n-uuid", name: "holdframe", as: "hold" }],
  connected_links: [],
  added_groups: [],
  added_notes: [],
};

const GRAPH_TRANSACTION_REFUSAL: ProjectActionRefusal = {
  refusal_code: "params_do_not_match_schema",
  action: "transact",
  refused_operation_index: 0,
  refused_node: "n-uuid",
  refused_link: null,
  refused_field: null,
  refused_params_pointer: "/operations/0/name",
  refused_file: { path: "streams/main.graph.json", line: 12, column: 5 },
  suggested_call: { operation: "describe_operations", params: { operations: ["transact"] } },
  runtime_words: "a node of that name exists",
};

/** The runtime's refusal of a value its view node's input does not take, as `transact` answers it. */
const VIEW_OUTPUT_VALUE_REFUSAL: ProjectActionRefusal = {
  refusal_code: "input_value_not_valid",
  action: "transact",
  refused_operation_index: 0,
  refused_node: "id-dj-deck",
  refused_link: null,
  refused_field: "play_a",
  refused_params_pointer: "/operations/0/value",
  refused_file: null,
  suggested_call: null,
  runtime_words: "output `play_a` of node `deck` carries Array, and an Array value is a number or a list of numbers",
};

const DECK_A_TARGET: PortViewerTarget = { stream: "set", node_id: "id-deck-a", port: "audio" };
const DECK_B_TARGET: PortViewerTarget = { stream: "set", node_id: "id-deck-b", port: "audio" };

/** Host services answering the selection from a watched value and each port viewer from a recorded list; every other part refuses. */
function recordingHostServices() {
  const selection = new WatchedStudioValue<StudioSelection>({ kind: "nothing" });
  const portViewersOpened: { target: PortViewerTarget; onEvent: (event: PortViewerConnectionEvent) => void; closed: boolean }[] = [];
  const selectionsAsked: StudioSelection[] = [];
  const viewsOpened: { viewTypeId: string; on: ViewOpeningTarget }[] = [];
  const viewsOpenedOn = new WatchedStudioValue<Readonly<Record<string, ViewOpenedOnAsked>>>({});
  const languageServerMessagesSent: JsonValue[] = [];
  const undosAsked: { projectFolder: string; author: ProjectTransactionAuthor }[] = [];
  const assetImportsAsked: { projectFolder: string; media: readonly string[] | null }[] = [];
  const assetChangesAsked: string[][] = [];
  const recoveriesAsked: string[][] = [];
  const modulesAndMarketplaceSectionsOpened: string[] = [];
  const viewTypesShownInAreas: { viewTypeId: string; areaId: string }[] = [];
  const graphTransactionsAsked: { projectFolder: string; operations: readonly unknown[]; mode: string; idempotencyKey: string | null }[] = [];
  const languageServers: { projectFolder: string; onEvent: (event: PythonLanguageServerConnectionEvent) => void; closed: boolean }[] = [];
  const projectAssetPickHeld = new ProjectAssetPickHeldInTheWindow();
  const hostServices: StudioViewHostServices = {
    watchOpenProject: (listener) => {
      listener({ kind: "none_open" });
      return () => undefined;
    },
    watchListedStreams: () => () => undefined,
    watchSelection: selection.watch,
    select: (asked) => selectionsAsked.push(asked),
    watchActiveStreamTab: () => () => undefined,
    openStreamTab: () => undefined,
    watchStreamGraph: () => () => undefined,
    watchNodeTypes: () => () => undefined,
    watchStreamInputValues: () => () => undefined,
    openView: (viewTypeId, on) => {
      viewsOpened.push({ viewTypeId, on });
      if (viewTypeId === "acme-dj:nowhere") return { kind: "not_opened", because: "No area shows acme-dj:nowhere." };
      viewsOpenedOn.publish({ ...viewsOpenedOn.readLatest(), [viewTypeId]: { on, opening_id: `opening-${viewsOpened.length}` } });
      return { kind: "opened" };
    },
    watchViewOpenedOn: (viewTypeId, listener) =>
      viewsOpenedOn.watch((openedOn) => {
        const opening = openedOn[viewTypeId];
        listener(opening === undefined ? null : { ...opening.on, opening_id: opening.opening_id });
      }),
    readProjectFile: async (file): Promise<ProjectFileReading> =>
      file === STREAM_FILE_READ.file ? { kind: "read", file_read: STREAM_FILE_READ } : { kind: "not_read", because: `${file} is not in the project.` },
    saveProjectFile: async () => ({ kind: "not_saved", because: "no files in this test" }),
    createNodeFile: async () => ({ kind: "not_created", because: "no files in this test" }),
    listProjectFiles: async () => ({ kind: "not_listed", because: "no files in this test" }),
    watchProjectLog: () => () => undefined,
    watchProjectNodeTypes: () => () => undefined,
    watchProjectAssets: (projectFolder, listener) => {
      listener({ kind: "not_listed", because: `list_assets failed: ${projectFolder} holds no project: it has no tatolab-project.json` });
      return () => undefined;
    },
    watchStudioViews: (listener) => {
      listener({ kind: "listed", studio_views: [STUDIO_VIEW_LISTED_DJ_DECK] });
      return () => undefined;
    },
    watchNodeUiElements: (listener) => {
      listener({ elements: [STUDIOS_FLOAT_CONTROL_LISTED] });
      return () => undefined;
    },
    importAssetsIntoTheProject: async (projectFolder, media) => {
      assetImportsAsked.push({ projectFolder, media });
      if (projectFolder === "/cancelled") return { kind: "nothing_chosen" };
      return {
        kind: "imported",
        assets_imported: { imported: [{ asset: "a-uuid", path: "media/intro.mp4" }], refused: [{ file_name: "main.graph.json", because: "import_asset failed: `data/main.graph.json` is not an asset path: it names a stream's graph document, which only the stream verbs write" }] },
      };
    },
    relocateAssetInTheProject: async (projectFolder, asset, toPath) => {
      assetChangesAsked.push(["relocate", projectFolder, asset, toPath]);
      return toPath === "media/taken.png" ? { kind: "not_changed", because: "relocate_asset failed: `media/taken.png` is already the path of the asset b-uuid" } : { kind: "changed" };
    },
    readAssetPreviewInTheProject: async (projectFolder, asset) => {
      assetChangesAsked.push(["read_preview", projectFolder, asset]);
      return asset === "a-uuid"
        ? { kind: "read", picture: { picture_url: "data:image/png;base64,iVBORw0KGgo=", pixel_width: 512, pixel_height: 288 } }
        : { kind: "not_read", because: "read_asset_preview failed: asset c-uuid has no preview picture; the runtime makes one for an image" };
    },
    deleteAssetFromTheProject: async (projectFolder, asset) => {
      assetChangesAsked.push(["delete", projectFolder, asset]);
      return { kind: "changed" };
    },
    recoverTheProjectsStreams: async (projectFolder, recovery) => {
      recoveriesAsked.push([projectFolder, recovery]);
      return projectFolder === "/set" ? { kind: "asked" } : { kind: "not_asked", because: `Tato Studio recovers the streams of this window's project only, not ${projectFolder}.` };
    },
    watchAreasForTheViewType: (viewTypeId, listener) => {
      listener(
        viewTypeId === "acme-dj:deck"
          ? {
              kind: "areas_listed",
              view_title: "DJ Deck",
              areas: [
                { area_id: "viewer", shows_view_title: "Viewer", shows_the_view_type: false },
                { area_id: "properties", shows_view_title: "Properties", shows_the_view_type: false },
              ],
            }
          : { kind: "not_a_view_type" },
      );
      return () => undefined;
    },
    showViewTypeInArea: (viewTypeId, areaId) => {
      viewTypesShownInAreas.push({ viewTypeId, areaId });
      return areaId === "viewer" ? { kind: "opened" } : { kind: "not_opened", because: `The layout shown has no area ${areaId}.` };
    },
    openModulesAndMarketplace: async (shows) => {
      modulesAndMarketplaceSectionsOpened.push(shows);
      return modulesAndMarketplaceSectionsOpened.length === 1 ? { kind: "opened" } : { kind: "not_opened", because: "Only a project's studio window opens its Modules and Marketplace window." };
    },
    watchProjectTransactions: (projectFolder, listener) => {
      listener({ kind: "not_read", because: `No runtime follows ${projectFolder}.` });
      return () => undefined;
    },
    undoInTheProject: async (projectFolder, author) => {
      undosAsked.push({ projectFolder, author });
      return { kind: "applied", transaction: UNDO_APPLIED };
    },
    redoInTheProject: async () => ({ kind: "not_applied", because: "redo failed: claude-code has nothing to redo" }),
    transactInTheProject: async (projectFolder, operations, mode, idempotencyKey) => {
      graphTransactionsAsked.push({ projectFolder, operations, mode, idempotencyKey });
      if (operations[0]?.operation === "rename_node") return { kind: "refused", refusal: GRAPH_TRANSACTION_REFUSAL };
      if (operations[0]?.operation === "remove_node") return { kind: "not_sent", because: "No runtime answers." };
      if (operations[0]?.operation === "set_node_input_value" && operations[0].input === "play_a") return { kind: "refused", refusal: VIEW_OUTPUT_VALUE_REFUSAL };
      return { kind: "applied", transaction: GRAPH_TRANSACTION_APPLIED };
    },
    readThePersonEditing: async () => ({ kind: "read", author: { kind: "person", name: "sam" } }),
    connectToPythonLanguageServer: (projectFolder, onEvent) => {
      const opened = { projectFolder, onEvent, closed: false };
      languageServers.push(opened);
      return {
        send: (message) => languageServerMessagesSent.push(message),
        close: () => {
          opened.closed = true;
        },
      };
    },
    pickAProjectAsset: (pick) => projectAssetPickHeld.start(pick, null),
    watchProjectAssetPickShownHere: projectAssetPickHeld.projectAssetPick.watch,
    answerTheProjectAssetPick: (asset) => projectAssetPickHeld.answer(asset),
    endTheProjectAssetPick: (because) => projectAssetPickHeld.end(because),
    watchPortViewer: (target, onEvent) => {
      const opened = { target, onEvent, closed: false };
      portViewersOpened.push(opened);
      return {
        close: () => {
          opened.closed = true;
        },
      };
    },
  };
  return { hostServices, projectAssetPickHeld, selection, portViewersOpened, selectionsAsked, viewsOpened, languageServers, languageServerMessagesSent, undosAsked, assetImportsAsked, assetChangesAsked, recoveriesAsked, modulesAndMarketplaceSectionsOpened, viewTypesShownInAreas, graphTransactionsAsked };
}

/** An area that keeps the settings it is asked to remember, says where the view's header row lies, and expands while a layout holds it. */
function recordingAreaServices(savedSettings: JsonValue | undefined) {
  const saved = new WatchedStudioValue<{ saved: JsonValue | undefined }>({ saved: savedSettings });
  const headerRow = new WatchedStudioValue<ViewHeaderRow>({ leading_inset_px: 120, height_px: 30 });
  const isExpanded = new WatchedStudioValue(false);
  const areaServices: TatolabViewAreaServices = {
    areaId: "properties",
    watchSavedSettings: (listener) => saved.watch((latest) => listener(latest.saved)),
    rememberSettings: (settings) => saved.publish({ saved: settings }),
    watchHeaderRow: headerRow.watch,
    expansion: {
      watchIsExpanded: isExpanded.watch,
      expand: (isExpandedNext) => {
        isExpanded.publish(isExpandedNext);
        return { kind: "done" };
      },
    },
  };
  return { areaServices, saved, headerRow, isExpanded };
}

const bridgesOpen: TatolabViewBridge[] = [];
const connectionsOpen: TatoAppViewConnection[] = [];
afterEach(() => {
  for (const bridge of bridgesOpen.splice(0)) bridge.close();
  for (const connection of connectionsOpen.splice(0)) connection.close();
});

async function connectedView(manifest: TatolabViewManifest, inputWiring: Record<string, StudioViewInputWiring>, savedSettings?: JsonValue, viewNode: StudioViewNodeAddress | null = null) {
  const host = recordingHostServices();
  const area = recordingAreaServices(savedSettings);
  const channel = new MessageChannel();
  const bridge = new TatolabViewBridge(channel.port1, "acme-dj:deck", manifest, host.hostServices, area.areaServices, inputWiring, viewNode);
  bridgesOpen.push(bridge);
  const connecting = connectToTatoAppOverPort(channel.port2);
  bridge.start();
  const connection = await connecting;
  connectionsOpen.push(connection);
  return { ...host, ...area, bridge, connection };
}

/** Resolves once the view has been told something on the next turn, which a MessagePort delivers on. */
function messagesDelivered(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

const STUDIO_VIEW_LISTED_DJ_DECK: StudioViewListed = { view_type_id: "acme-dj:deck", title: "DJ Deck", description: "Two decks and a crossfader.", brought_by: "Acme DJ", is_built_in: false, placement: "node", inputs: [], outputs: [{ name: "crossfader", family: "array", description: "" }], not_opened_because: null };

describe("a view's connection to Studio, through the one bridge every view is served by", () => {
  it("edits the project's graphs through it, the runtime's structured refusal reaching the view whole", async () => {
    const { connection, graphTransactionsAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    const addHoldFrame = { operation: "add_node", stream: "s-uuid", type: "tatolab.ops:HoldFrame", as: "hold" } as const;
    expect(await connection.transactInTheProject("/set", [addHoldFrame], { mode: "commit", idempotencyKey: "gesture-1" })).toEqual({ kind: "applied", transaction: GRAPH_TRANSACTION_APPLIED });
    expect(await connection.transactInTheProject("/set", [{ operation: "rename_node", stream: "s-uuid", node: "n-uuid", name: "camera" }], { mode: "commit", idempotencyKey: null })).toEqual({
      kind: "refused",
      refusal: GRAPH_TRANSACTION_REFUSAL,
    });
    expect(await connection.transactInTheProject("/set", [{ operation: "remove_node", stream: "s-uuid", node: "n-uuid" }], { mode: "live", idempotencyKey: null })).toEqual({ kind: "not_sent", because: "No runtime answers." });
    expect(graphTransactionsAsked[0]).toEqual({ projectFolder: "/set", operations: [addHoldFrame], mode: "commit", idempotencyKey: "gesture-1" });
  });

  it("carries an asset pick from the view asking to the asset picker answering it, and its end in words", async () => {
    const { connection, projectAssetPickHeld } = await connectedView(DJ_DECK_MANIFEST, {});
    const pick = { media: ["image"], chosen_now: null };
    const picking = connection.pickAProjectAsset(pick);
    await messagesDelivered();
    expect(projectAssetPickHeld.projectAssetPick.readLatest()).toEqual(pick);
    const picksShown: unknown[] = [];
    connection.watchProjectAssetPick((shown) => picksShown.push(shown));
    await messagesDelivered();
    expect(picksShown).toEqual([pick]);
    expect(await connection.answerTheProjectAssetPick("baaf9e5a-uuid")).toEqual({ kind: "done" });
    expect(await picking).toEqual({ kind: "chosen", asset: "baaf9e5a-uuid" });
    expect(picksShown).toEqual([pick, null]);
    expect(await connection.answerTheProjectAssetPick("baaf9e5a-uuid")).toEqual({ kind: "refused", because: "No asset is being chosen in the asset picker." });

    const pickingAgain = connection.pickAProjectAsset(pick);
    await messagesDelivered();
    projectAssetPickHeld.end("The asset picker closed.");
    expect(await pickingAgain).toEqual({ kind: "ended", because: "The asset picker closed." });
  });

  it("ends the asset pick a view still holds when the view closes", async () => {
    const { connection, projectAssetPickHeld, bridge } = await connectedView(DJ_DECK_MANIFEST, {});
    const picking = connection.pickAProjectAsset({ media: null, chosen_now: "a-uuid" });
    await messagesDelivered();
    bridge.close();
    expect(projectAssetPickHeld.projectAssetPick.readLatest()).toBeNull();
    void picking;
  });

  it("names the person editing, whose own edits Undo reverts", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.readThePersonEditing()).toEqual({ kind: "read", author: { kind: "person", name: "sam" } });
  });


  it("lists the project's assets, the runtime's refusal in its words", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});
    const readings: ProjectAssetsReading[] = [];
    connection.watchProjectAssets("/set", (reading) => readings.push(reading));
    await messagesDelivered();
    expect(readings).toEqual([{ kind: "not_listed", because: "list_assets failed: /set holds no project: it has no tatolab-project.json" }]);
  });

  it("lists the views an area can show", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});
    const readings: StudioViewsReading[] = [];
    connection.watchStudioViews((reading) => readings.push(reading));
    await messagesDelivered();
    expect(readings).toEqual([{ kind: "listed", studio_views: [STUDIO_VIEW_LISTED_DJ_DECK] }]);
  });

  it("lists the node UI elements a control table picks from", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});
    const readings: NodeUiElementsReading[] = [];
    connection.watchNodeUiElements((reading) => readings.push(reading));
    await messagesDelivered();
    expect(readings).toEqual([{ elements: [STUDIOS_FLOAT_CONTROL_LISTED] }]);
  });

  it("imports the files the person chooses, each refusal in the runtime's words", async () => {
    const { connection, assetImportsAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.importAssetsIntoTheProject("/set", ["image"])).toEqual({
      kind: "imported",
      assets_imported: { imported: [{ asset: "a-uuid", path: "media/intro.mp4" }], refused: [{ file_name: "main.graph.json", because: "import_asset failed: `data/main.graph.json` is not an asset path: it names a stream's graph document, which only the stream verbs write" }] },
    });
    expect(await connection.importAssetsIntoTheProject("/cancelled", null)).toEqual({ kind: "nothing_chosen" });
    expect(assetImportsAsked).toEqual([
      { projectFolder: "/set", media: ["image"] },
      { projectFolder: "/cancelled", media: null },
    ]);
  });

  it("recovers the project's streams as asked, a refusal in Studio's words", async () => {
    const { connection, recoveriesAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.recoverTheProjectsStreams("/set", "restart_the_playback")).toEqual({ kind: "done" });
    expect(await connection.recoverTheProjectsStreams("/elsewhere", "reload_the_project")).toEqual({ kind: "refused", because: "Tato Studio recovers the streams of this window's project only, not /elsewhere." });
    expect(recoveriesAsked).toEqual([
      ["/set", "restart_the_playback"],
      ["/elsewhere", "reload_the_project"],
    ]);
  });

  it("renames, moves and deletes an asset of the project, a refusal in the runtime's words", async () => {
    const { connection, assetChangesAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.relocateAssetInTheProject("/set", "a-uuid", "media/archive/intro.mp4")).toEqual({ kind: "done" });
    expect(await connection.relocateAssetInTheProject("/set", "a-uuid", "media/taken.png")).toEqual({ kind: "refused", because: "relocate_asset failed: `media/taken.png` is already the path of the asset b-uuid" });
    expect(await connection.deleteAssetFromTheProject("/set", "a-uuid")).toEqual({ kind: "done" });
    expect(assetChangesAsked).toEqual([
      ["relocate", "/set", "a-uuid", "media/archive/intro.mp4"],
      ["relocate", "/set", "a-uuid", "media/taken.png"],
      ["delete", "/set", "a-uuid"],
    ]);
  });

  it("reads an asset's preview picture, a refusal in the runtime's words", async () => {
    const { connection, assetChangesAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.readAssetPreviewInTheProject("/set", "a-uuid")).toEqual({
      kind: "read",
      picture: {
        picture_url: "data:image/png;base64,iVBORw0KGgo=",
        pixel_width: 512,
        pixel_height: 288,
      },
    });
    expect(await connection.readAssetPreviewInTheProject("/set", "c-uuid")).toEqual({
      kind: "not_read",
      because: "read_asset_preview failed: asset c-uuid has no preview picture; the runtime makes one for an image",
    });
    expect(assetChangesAsked).toEqual([
      ["read_preview", "/set", "a-uuid"],
      ["read_preview", "/set", "c-uuid"],
    ]);
  });

  it("lists the layout's areas for a view type, marking the asking view's own, and shows the view type in one", async () => {
    const { connection, viewTypesShownInAreas } = await connectedView(DJ_DECK_MANIFEST, {});
    const readings: unknown[] = [];
    connection.watchAreasForTheViewType("acme-dj:deck", (reading) => readings.push(reading));
    connection.watchAreasForTheViewType("acme-dj:nowhere", (reading) => readings.push(reading));
    await messagesDelivered();
    expect(readings).toEqual([
      {
        kind: "areas_listed",
        view_title: "DJ Deck",
        areas: [
          { area_id: "viewer", shows_view_title: "Viewer", shows_the_view_type: false, is_the_asking_views_area: false },
          { area_id: "properties", shows_view_title: "Properties", shows_the_view_type: false, is_the_asking_views_area: true },
        ],
      },
      { kind: "not_a_view_type" },
    ]);
    expect(await connection.showViewTypeInArea("acme-dj:deck", "viewer")).toEqual({ kind: "done" });
    expect(await connection.showViewTypeInArea("acme-dj:deck", "gone")).toEqual({ kind: "refused", because: "The layout shown has no area gone." });
    expect(viewTypesShownInAreas).toEqual([
      { viewTypeId: "acme-dj:deck", areaId: "viewer" },
      { viewTypeId: "acme-dj:deck", areaId: "gone" },
    ]);
  });

  it("opens the project's Modules and Marketplace window on the section asked, and says why when it can't", async () => {
    const { connection, modulesAndMarketplaceSectionsOpened } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.openModulesAndMarketplace("marketplace")).toEqual({ kind: "done" });
    expect(await connection.openModulesAndMarketplace("added_to_this_project")).toEqual({ kind: "refused", because: "Only a project's studio window opens its Modules and Marketplace window." });
    expect(modulesAndMarketplaceSectionsOpened).toEqual(["marketplace", "added_to_this_project"]);
  });

  it("reads the project's history and undoes through it", async () => {
    const { connection, undosAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    const readings: ProjectTransactionsReading[] = [];
    connection.watchProjectTransactions("/set", (reading) => readings.push(reading));
    const author = { kind: "agent", name: "claude-code" } as const;
    const undone = await connection.undoInTheProject("/set", author);
    const redone = await connection.redoInTheProject("/set", author);
    await messagesDelivered();
    expect(readings).toEqual([{ kind: "not_read", because: "No runtime follows /set." }]);
    expect(undone).toEqual({ kind: "applied", transaction: UNDO_APPLIED });
    expect(undosAsked).toEqual([{ projectFolder: "/set", author }]);
    expect(redone).toEqual({ kind: "not_applied", because: "redo failed: claude-code has nothing to redo" });
  });

  it("is told its id, contract, placement, declared ports and declared capabilities as it connects", async () => {
    const { connection } = await connectedView({ ...DJ_DECK_MANIFEST, capabilities: ["read.selection", "camera"] }, {});
    expect(connection.grant).toEqual({
      view_type_id: "acme-dj:deck",
      contract: "1.0",
      placement: "node",
      inputs: [{ name: "deck_a", family: "channels" }],
      outputs: [
        { name: "crossfader", family: "array" },
        { name: "play_a", family: "array" },
        { name: "cover", family: "image" },
      ],
      capabilities: ["read.selection", "camera"],
    });
  });

  it("reads the open project, the selection and a stream's graph, and selects", async () => {
    const { connection, selection } = await connectedView(DJ_DECK_MANIFEST, {});
    const selectionsSeen: StudioSelection[] = [];
    const refusals: string[] = [];
    const openProjectReadings: string[] = [];
    connection.watchOpenProject((reading) => openProjectReadings.push(reading.kind));
    connection.watchSelection((seen) => selectionsSeen.push(seen));
    connection.watchStreamGraph("set", () => undefined, (because) => refusals.push(because));
    await messagesDelivered();
    selection.publish({ kind: "node", stream: "set", node: "mixer" });
    const selectAnswer = await connection.select({ kind: "nothing" });
    await messagesDelivered();

    expect(openProjectReadings).toEqual(["none_open"]);
    expect(selectionsSeen).toEqual([{ kind: "nothing" }, { kind: "node", stream: "set", node: "mixer" }]);
    expect(refusals).toEqual([]);
    expect(selectAnswer).toEqual({ kind: "done" });
  });

  it("asks the studio to select", async () => {
    const { connection, selectionsAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.select({ kind: "node", stream: "set", node: "deck_a" })).toEqual({ kind: "done" });
    expect(selectionsAsked).toEqual([{ kind: "node", stream: "set", node: "deck_a" }]);
  });

  it("reads an input from the output wired into it, says why when nothing is, and reopens it on the output wired in next", async () => {
    const { connection, bridge, portViewersOpened } = await connectedView(DJ_DECK_MANIFEST, { deck_a: { kind: "unwired", because: "Nothing is wired into deck_a." } });
    const inputEvents: ViewInputEvent[] = [];
    connection.watchInput("deck_a", (inputEvent) => inputEvents.push(inputEvent));
    await messagesDelivered();
    bridge.rewireInputs({ deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    portViewersOpened[0]?.onEvent({ kind: "reopening", because: "the stream reloaded" });
    await messagesDelivered();
    bridge.rewireInputs({ deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    bridge.rewireInputs({ deck_a: { kind: "wired", target: DECK_B_TARGET, wired_from_words: "deck_b_player › audio" } });

    expect(inputEvents).toEqual([
      { kind: "unwired", because: "Nothing is wired into deck_a." },
      { kind: "reopening", because: "the stream reloaded" },
    ]);
    expect(portViewersOpened.map((opened) => [opened.target, opened.closed])).toEqual([
      [DECK_A_TARGET, true],
      [DECK_B_TARGET, false],
    ]);
  });

  it("is refused an input it did not declare, and closes the input's port viewer when it stops watching", async () => {
    const { connection, portViewersOpened } = await connectedView(DJ_DECK_MANIFEST, { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    const refusals: string[] = [];
    connection.watchInput("deck_z", () => undefined, (because) => refusals.push(because));
    const stopWatchingDeckA = connection.watchInput("deck_a", () => undefined);
    await messagesDelivered();
    stopWatchingDeckA();
    await messagesDelivered();

    expect(refusals).toEqual(["DJ Deck declares no input named deck_z."]);
    expect(portViewersOpened.map((opened) => opened.closed)).toEqual([true]);
  });

  it("sets what it sends on a declared output, live, on its node's input of that name, refused an undeclared output, and the runtime's refusal in its own words", async () => {
    const deckNode: StudioViewNodeAddress = { kind: "addressed", graph: { project_folder: "/set", stream_asset: "s-uuid", level: [] }, node_id: "id-dj-deck" };
    const { connection, graphTransactionsAsked } = await connectedView(DJ_DECK_MANIFEST, {}, undefined, deckNode);

    expect(await connection.sendOutput("tempo", 0.5)).toEqual({ kind: "refused", because: "DJ Deck declares no output named tempo." });
    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({ kind: "done" });
    expect(await connection.sendOutput("play_a", { playing: true })).toEqual({ kind: "refused", because: VIEW_OUTPUT_VALUE_REFUSAL.runtime_words });
    expect(graphTransactionsAsked).toEqual([
      { projectFolder: "/set", operations: [{ operation: "set_node_input_value", stream: "s-uuid", node: "id-dj-deck", input: "crossfader", value: 0.42 }], mode: "live", idempotencyKey: null },
      { projectFolder: "/set", operations: [{ operation: "set_node_input_value", stream: "s-uuid", node: "id-dj-deck", input: "play_a", value: { playing: true } }], mode: "live", idempotencyKey: null },
    ]);
  });

  it("is refused a value on an Image output, which a panel never writes, sending nothing", async () => {
    const deckNode: StudioViewNodeAddress = { kind: "addressed", graph: { project_folder: "/set", stream_asset: "s-uuid", level: [] }, node_id: "id-dj-deck" };
    const { connection, graphTransactionsAsked } = await connectedView(DJ_DECK_MANIFEST, {}, undefined, deckNode);

    expect(await connection.sendOutput("cover", { frame: 1 })).toEqual({ kind: "refused", because: "DJ Deck writes no value on its Image output cover; a panel writes Array, Channels and Records outputs." });
    expect(graphTransactionsAsked).toEqual([]);
  });

  it("sets what it sends at the address its node was given last, once the stream's asset becomes known", async () => {
    const { connection, bridge, graphTransactionsAsked } = await connectedView(DJ_DECK_MANIFEST, {}, undefined, { kind: "not_addressed", because: "The runtime's graph of Set names no stream asset, so nothing is set on its Deck node." });
    expect(await connection.sendOutput("crossfader", 0.1)).toEqual({ kind: "refused", because: "The runtime's graph of Set names no stream asset, so nothing is set on its Deck node." });

    bridge.readdress({ kind: "addressed", graph: { project_folder: "/set", stream_asset: "s-uuid", level: [] }, node_id: "id-dj-deck" });
    expect(await connection.sendOutput("crossfader", 0.2)).toEqual({ kind: "done" });
    expect(graphTransactionsAsked).toEqual([{ projectFolder: "/set", operations: [{ operation: "set_node_input_value", stream: "s-uuid", node: "id-dj-deck", input: "crossfader", value: 0.2 }], mode: "live", idempotencyKey: null }]);
  });

  it("answers why Studio sent nothing when the write never reached the runtime", async () => {
    const deckNode: StudioViewNodeAddress = { kind: "addressed", graph: { project_folder: "/set", stream_asset: "s-uuid", level: [] }, node_id: "id-dj-deck" };
    const { connection, hostServices } = await connectedView(DJ_DECK_MANIFEST, {}, undefined, deckNode);
    hostServices.transactInTheProject = async () => ({ kind: "not_sent", because: "No runtime answers." });

    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({ kind: "refused", because: "No runtime answers." });
  });

  it("is refused an output while its node has no address a value is set at, writing nothing", async () => {
    const { connection, graphTransactionsAsked } = await connectedView(DJ_DECK_MANIFEST, {}, undefined, { kind: "not_addressed", because: "The runtime's graph of set names no stream asset, so no value is set on DJ Deck's node." });

    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({ kind: "refused", because: "The runtime's graph of set names no stream asset, so no value is set on DJ Deck's node." });
    expect(graphTransactionsAsked).toEqual([]);
  });

  it("is refused an output while it shows in an area with no node, writing nothing", async () => {
    const { connection, graphTransactionsAsked } = await connectedView(DJ_DECK_MANIFEST, {});

    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({ kind: "refused", because: "DJ Deck shows in an area and has no node, so what it sends on crossfader reaches no stream." });
    expect(graphTransactionsAsked).toEqual([]);
  });

  it("stops every watch and port viewer when the studio closes the view", async () => {
    const { connection, bridge, selection, portViewersOpened } = await connectedView(DJ_DECK_MANIFEST, { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    const selectionsSeen: StudioSelection[] = [];
    connection.watchSelection((seen) => selectionsSeen.push(seen));
    connection.watchInput("deck_a", () => undefined);
    await messagesDelivered();
    bridge.close();
    selection.publish({ kind: "nothing" });
    selection.publish({ kind: "node", stream: "set", node: "mixer" });
    await messagesDelivered();

    expect(selectionsSeen).toEqual([{ kind: "nothing" }]);
    expect(portViewersOpened.map((opened) => opened.closed)).toEqual([true]);
  });

  it("hands a view an Image frame as the VideoFrame itself, transferred with no copy", async () => {
    const host = recordingHostServices();
    const postedToTheView: { message: unknown; transfer: Transferable[] }[] = [];
    const listenersOfThePort: ((event: MessageEvent<unknown>) => void)[] = [];
    const portDouble = {
      postMessage: (message: unknown, transfer: Transferable[]) => {
        postedToTheView.push({ message, transfer });
      },
      addEventListener: (_type: string, listener: (event: MessageEvent<unknown>) => void) => {
        listenersOfThePort.push(listener);
      },
      removeEventListener: () => undefined,
      start: () => undefined,
      close: () => undefined,
    };
    const framesClosed: string[] = [];
    const videoFrame = Object.assign(Object.create(null), { timestamp: 33_000, close: () => framesClosed.push("frame") });
    const bridge = new TatolabViewBridge(
      portDouble,
      "acme-dj:deck",
      { ...DJ_DECK_MANIFEST, inputs: [{ name: "deck_a", family: "image" }] },
      host.hostServices,
      recordingAreaServices(undefined).areaServices,
      { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "camera › video" } },
      null,
    );
    bridgesOpen.push(bridge);
    bridge.start();
    for (const listener of listenersOfThePort) listener(new MessageEvent("message", { data: { kind: "watch", watch_id: 1, subject: { kind: "input", input: "deck_a" } } }));
    host.portViewersOpened[0]?.onEvent({ kind: "image_frame", video_frame: videoFrame, format_wire_name: "bgra8", skipped_since_last_read: 0 });

    const framesPosted = postedToTheView.filter((posted) => posted.transfer.length > 0);
    expect(framesPosted).toHaveLength(1);
    expect(framesPosted[0]?.transfer[0]).toBe(videoFrame);
    expect(framesPosted[0]?.message).toMatchObject({ kind: "watched", watch_id: 1, watched: { subject: "input", reading: { kind: "image_frame", format_wire_name: "bgra8" } } });
    expect(framesClosed).toEqual([]);
  });

  it("hands the view its area's settings checked against what it declares, keeps ones that fit, and refuses ones that do not, naming the setting", async () => {
    const { connection, saved } = await connectedView(DJ_DECK_MANIFEST, {}, { zoom: 3, show_waveform: "yes" });
    const settingsSeen: ViewSettings[] = [];
    connection.watchSettings((settings) => settingsSeen.push(settings));
    await messagesDelivered();
    const keptAnswer = await connection.rememberSettings({ zoom: 2 });
    const refusedAnswer = await connection.rememberSettings({ zoom: 0 });
    await messagesDelivered();

    expect(settingsSeen).toEqual([
      { show_waveform: true, zoom: 1 },
      { show_waveform: true, zoom: 2 },
    ]);
    expect(keptAnswer).toEqual({ kind: "done" });
    expect(refusedAnswer.kind === "refused" ? refusedAnswer.because : "kept").toContain("`zoom`:");
    expect(saved.readLatest()).toEqual({ saved: { show_waveform: true, zoom: 2 } });
  });

  it("opens a view of a type on a file, tells views of that type what they were opened on, and says why when no area can show it", async () => {
    const { connection, viewsOpened } = await connectedView(DJ_DECK_MANIFEST, {});
    const openedOnSeen: ViewOpenedOn[] = [];
    connection.watchOpenedOn((openedOn) => openedOnSeen.push(openedOn));
    await messagesDelivered();
    const openedAnswer = await connection.openView("acme-dj:deck", { kind: "file", file: "/set/crate.m3u" });
    const notOpenedAnswer = await connection.openView("acme-dj:nowhere", { kind: "file", file: "/set/crate.m3u" });
    await messagesDelivered();

    expect(openedAnswer).toEqual({ kind: "done" });
    expect(notOpenedAnswer).toEqual({ kind: "refused", because: "No area shows acme-dj:nowhere." });
    expect(viewsOpened.map((opened) => opened.viewTypeId)).toEqual(["acme-dj:deck", "acme-dj:nowhere"]);
    expect(openedOnSeen).toEqual([null, { kind: "file", file: "/set/crate.m3u", opening_id: "opening-1" }]);
  });

  it("tells the view where its own header row lies after Studio's view-type menu, and again when the menu's width changes", async () => {
    const { connection, headerRow } = await connectedView(DJ_DECK_MANIFEST, {});
    const headerRowsSeen: ViewHeaderRow[] = [];
    connection.watchHeaderRow((seen) => headerRowsSeen.push(seen));
    await messagesDelivered();
    headerRow.publish({ leading_inset_px: 96, height_px: 30 });
    await messagesDelivered();

    expect(headerRowsSeen).toEqual([
      { leading_inset_px: 120, height_px: 30 },
      { leading_inset_px: 96, height_px: 30 },
    ]);
  });

  it("expands the view's area and puts the layout back when the view asks, telling it each time", async () => {
    const { connection, isExpanded } = await connectedView(DJ_DECK_MANIFEST, {});
    const expansionsSeen: boolean[] = [];
    connection.watchAreaExpansion((seen) => expansionsSeen.push(seen));
    await messagesDelivered();

    expect(await connection.expandTheArea(true)).toEqual({ kind: "done" });
    expect(isExpanded.readLatest()).toBe(true);
    isExpanded.publish(false);
    await messagesDelivered();
    expect(expansionsSeen).toEqual([false, true, false]);
  });

  it("reads a project file, saying why in the reader's words when it was not read", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});

    expect(await connection.readProjectFile("/set/stream.py")).toEqual({ kind: "read", file_read: STREAM_FILE_READ });
    expect(await connection.readProjectFile("/elsewhere.py")).toEqual({ kind: "not_read", because: "/elsewhere.py is not in the project." });
  });

  it("starts a Python language server for the watch, carries its messages both ways, and stops it with the watch", async () => {
    const { connection, languageServers, languageServerMessagesSent } = await connectedView(DJ_DECK_MANIFEST, {});
    const eventsSeen: PythonLanguageServerConnectionEvent[] = [];
    const languageServer = connection.connectToPythonLanguageServer("/set", (event) => eventsSeen.push(event));
    await messagesDelivered();
    languageServer.send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    languageServers[0]?.onEvent({ kind: "message", message: { jsonrpc: "2.0", id: 1, result: {} } });
    await messagesDelivered();
    languageServer.close();
    await messagesDelivered();

    expect(languageServers.map((opened) => [opened.projectFolder, opened.closed])).toEqual([["/set", true]]);
    expect(languageServerMessagesSent).toEqual([{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
    expect(eventsSeen).toEqual([{ kind: "message", message: { jsonrpc: "2.0", id: 1, result: {} } }]);
  });

  it("ignores a message that is not the contract's, and answers the next one", async () => {
    const host = recordingHostServices();
    const channel = new MessageChannel();
    const bridge = new TatolabViewBridge(channel.port1, "acme-dj:deck", DJ_DECK_MANIFEST, host.hostServices, recordingAreaServices(undefined).areaServices);
    bridgesOpen.push(bridge);
    const connecting = connectToTatoAppOverPort(channel.port2);
    bridge.start();
    const connection = await connecting;
    connectionsOpen.push(connection);
    channel.port2.postMessage({ kind: "ask", ask_id: 99, ask: { kind: "delete_everything" } });
    channel.port2.postMessage({ kind: "watch", watch_id: "one", subject: { kind: "selection" } });

    expect(await connection.select({ kind: "nothing" })).toEqual({ kind: "done" });
    expect(host.selectionsAsked).toEqual([{ kind: "nothing" }]);
  });
});
