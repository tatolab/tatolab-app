import {
  connectToTatoAppOverPort,
  readTatolabViewManifest,
  type TatoAppViewConnection,
  type TatolabViewManifest,
  type ViewInputEvent,
  type ViewSettings,
} from "@tatolab/tato-app-view-sdk";
import { afterEach, describe, expect, it } from "vitest";
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
import { WindowToolbarGraphToolOffers } from "../studio_shell/window_toolbar_graph_tool_offers";

function manifestOf(manifestJson: unknown): TatolabViewManifest {
  const reading = readTatolabViewManifest(manifestJson);
  if (reading.kind === "not_read") return expect.unreachable(reading.because);
  return reading.manifest;
}

const DJ_DECK_MANIFEST = manifestOf({
  contract: "1.0",
  title: "DJ Deck",
  entry: "index.html",
  placement: "node",
  inputs: [{ name: "deck_a", family: "channels" }],
  outputs: [
    { name: "crossfader", family: "array" },
    { name: "play_a", family: "array" },
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

const GRAPH_TRANSACTION_REFUSAL = { action: "transact", refused_operation_index: 0, refused_node: "n-uuid", refused_link: null, refused_field: null, runtime_words: "a node of that name exists" };

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
  const assetImportsAsked: string[] = [];
  const graphTransactionsAsked: { projectFolder: string; operations: readonly unknown[]; mode: string; idempotencyKey: string | null }[] = [];
  const languageServers: { projectFolder: string; onEvent: (event: PythonLanguageServerConnectionEvent) => void; closed: boolean }[] = [];
  const outputsWritten: { viewNode: StudioViewNodeAddress; port: string; value: JsonValue }[] = [];
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
    watchNodeCatalog: () => () => undefined,
    openView: (viewTypeId, on) => {
      viewsOpened.push({ viewTypeId, on });
      if (viewTypeId === "acme-dj:nowhere") return { kind: "not_opened", because: "No layout has an area showing acme-dj:nowhere." };
      viewsOpenedOn.publish({ ...viewsOpenedOn.readLatest(), [viewTypeId]: { on, opening_id: `opening-${viewsOpened.length}`, layout: "build" } });
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
    importAssetsIntoTheProject: async (projectFolder) => {
      assetImportsAsked.push(projectFolder);
      if (projectFolder === "/cancelled") return { kind: "nothing_chosen" };
      return {
        kind: "imported",
        assets_imported: { imported: [{ asset: "a-uuid", path: "media/intro.mp4" }], refused: [{ file_name: "notes.txt", because: "import_asset failed: `media/notes.txt` is already the path of the asset b-uuid" }] },
      };
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
    writeStudioViewOutput: async (viewNode, port, value) => {
      outputsWritten.push({ viewNode, port, value });
      return port === "play_a" ? { kind: "not_written", because: "write_studio_view_output failed: `play_a` takes a number or a list of numbers" } : { kind: "written" };
    },
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
  return { hostServices, selection, portViewersOpened, selectionsAsked, viewsOpened, languageServers, languageServerMessagesSent, undosAsked, assetImportsAsked, graphTransactionsAsked, outputsWritten };
}

/** An area that keeps the settings it is asked to remember and says where the view's header row lies. */
function recordingAreaServices(savedSettings: JsonValue | undefined) {
  const saved = new WatchedStudioValue<{ saved: JsonValue | undefined }>({ saved: savedSettings });
  const headerRow = new WatchedStudioValue<ViewHeaderRow>({ leading_inset_px: 120, height_px: 30 });
  const toolbarGraphToolOffers = new WindowToolbarGraphToolOffers();
  const areaServices: TatolabViewAreaServices = {
    watchSavedSettings: (listener) => saved.watch((latest) => listener(latest.saved)),
    rememberSettings: (settings) => saved.publish({ saved: settings }),
    watchHeaderRow: headerRow.watch,
    offerGraphTools: (onToolPressed) => toolbarGraphToolOffers.offerFrom("graph", onToolPressed),
  };
  return { areaServices, saved, headerRow, toolbarGraphToolOffers };
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

  it("offers graph tools to the window's toolbar, a press of an enabled one reaching the view, and withdraws them when the view stops", async () => {
    const { connection, toolbarGraphToolOffers } = await connectedView(DJ_DECK_MANIFEST, {});
    const toolsPressed: string[] = [];
    const offer = connection.offerGraphToolsToTheWindow((tool) => toolsPressed.push(tool));
    expect(
      await offer.show([
        { tool: "add_node", disabled_reason: null },
        { tool: "frame_selection", disabled_reason: "Select the nodes to frame first" },
      ]),
    ).toEqual({ kind: "done" });
    const shown = toolbarGraphToolOffers.shown.readLatest() ?? expect.unreachable("no tools shown");
    expect(shown.tools.map(({ tool, disabled_reason }) => [tool, disabled_reason])).toEqual([
      ["add_node", null],
      ["frame_selection", "Select the nodes to frame first"],
    ]);
    shown.press("frame_selection");
    shown.press("add_node");
    await messagesDelivered();
    expect(toolsPressed).toEqual(["add_node"]);

    offer.withdraw();
    await messagesDelivered();
    expect(toolbarGraphToolOffers.shown.readLatest()).toBeNull();
    expect(await offer.show([{ tool: "add_note", disabled_reason: null }])).toEqual({ kind: "refused", because: "The view watches no graph tool presses under 1." });

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

  it("imports the files the person chooses, each refusal in the runtime's words", async () => {
    const { connection, assetImportsAsked } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.importAssetsIntoTheProject("/set")).toEqual({
      kind: "imported",
      assets_imported: { imported: [{ asset: "a-uuid", path: "media/intro.mp4" }], refused: [{ file_name: "notes.txt", because: "import_asset failed: `media/notes.txt` is already the path of the asset b-uuid" }] },
    });
    expect(await connection.importAssetsIntoTheProject("/cancelled")).toEqual({ kind: "nothing_chosen" });
    expect(assetImportsAsked).toEqual(["/set", "/cancelled"]);
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

  it("writes what it sends on a declared output onto its node through the runtime, refused an undeclared output, and the runtime's refusal in its own words", async () => {
    const deckNode: StudioViewNodeAddress = { stream: "set", node_id: "id-dj-deck" };
    const { connection, outputsWritten } = await connectedView(DJ_DECK_MANIFEST, {}, undefined, deckNode);

    expect(await connection.sendOutput("tempo", 0.5)).toEqual({ kind: "refused", because: "DJ Deck declares no output named tempo." });
    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({ kind: "done" });
    expect(await connection.sendOutput("play_a", { playing: true })).toEqual({ kind: "refused", because: "write_studio_view_output failed: `play_a` takes a number or a list of numbers" });
    expect(outputsWritten).toEqual([
      { viewNode: deckNode, port: "crossfader", value: 0.42 },
      { viewNode: deckNode, port: "play_a", value: { playing: true } },
    ]);
  });

  it("is refused an output while it shows in an area with no node, writing nothing", async () => {
    const { connection, outputsWritten } = await connectedView(DJ_DECK_MANIFEST, {});

    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({ kind: "refused", because: "DJ Deck shows in an area and has no node, so what it sends on crossfader reaches no stream." });
    expect(outputsWritten).toEqual([]);
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
    expect(notOpenedAnswer).toEqual({ kind: "refused", because: "No layout has an area showing acme-dj:nowhere." });
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
